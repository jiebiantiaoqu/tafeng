import { Buffer } from "node:buffer";
import { Duplex } from "node:stream";
import { connect } from "cloudflare:sockets";
import { Client, type ClientChannel } from "ssh2";
import type { Language, ServerProfile, TerminalMessage } from "../shared/types";

export type SshBridge = {
  handleClientMessage(message: TerminalMessage): void;
  close(): void;
};

type SshBridgeOptions = {
  profile?: ServerProfile;
  language: Language;
  onCommand?: (command: string) => void;
};

type ShellSize = {
  cols: number;
  rows: number;
};

export function createSshBridge(socket: WebSocket, options: SshBridgeOptions): SshBridge {
  const copy = options.language === "en" ? terminalCopy.en : terminalCopy.zh;
  const send = (message: TerminalMessage) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  };

  let conn: Client | null = null;
  let shell: ClientChannel | null = null;
  let tcpStream: CloudflareSocketDuplex | null = null;
  let currentLine = "";
  let shellSize: ShellSize = { cols: 80, rows: 24 };

  if (!options.profile) {
    send({ type: "error", message: copy.noProfile });
  } else {
    void openSshSession(options.profile);
  }

  async function openSshSession(profile: ServerProfile) {
    send({ type: "output", data: `\r\n${copy.title}\r\n` });
    send({ type: "output", data: `${copy.selected}${profile.name} (${profile.username}@${profile.host}:${profile.port})\r\n` });
    send({ type: "output", data: `${copy.connecting}\r\n` });

    try {
      const tcpSocket = connect({ hostname: profile.host, port: profile.port });
      tcpStream = new CloudflareSocketDuplex(tcpSocket);
      conn = new Client();

      conn
        .on("ready", () => {
          send({ type: "output", data: `${copy.authenticated}\r\n` });
          conn?.shell(
            {
              term: "xterm-256color",
              cols: shellSize.cols,
              rows: shellSize.rows,
              width: shellSize.cols * 8,
              height: shellSize.rows * 16
            },
            (error, channel) => {
              if (error) {
                send({ type: "error", message: error.message });
                return;
              }
              shell = channel;
              channel.on("data", (data: Buffer | string) => send({ type: "output", data: data.toString() }));
              channel.stderr.on("data", (data: Buffer | string) => send({ type: "output", data: data.toString() }));
              channel.on("close", () => {
                send({ type: "output", data: `\r\n${copy.sessionClosed}\r\n` });
                close();
              });
            }
          );
        })
        .on("banner", (message) => send({ type: "output", data: `${message}\r\n` }))
        .on("error", (error) => send({ type: "error", message: `${copy.connectFailed}${error.message}` }))
        .on("close", () => send({ type: "output", data: `\r\n${copy.connectionClosed}\r\n` }));

      conn.connect({
        sock: tcpStream,
        username: profile.username,
        password: profile.credentialKind === "password" ? profile.password : undefined,
        privateKey: profile.credentialKind === "privateKey" ? profile.privateKey : undefined,
        passphrase: profile.credentialKind === "privateKey" ? profile.passphrase : undefined,
        readyTimeout: 20_000,
        keepaliveInterval: 15_000,
        keepaliveCountMax: 3,
        // Workers nodejs_compat crypto doesn't fully support GCM auth tags or
        // ChaCha20-Poly1305, so restrict to CTR/CBC ciphers + HMAC MACs.
        algorithms: {
          cipher: [
            "aes128-ctr", "aes192-ctr", "aes256-ctr",
            "aes128-cbc", "aes256-cbc", "3des-cbc"
          ],
          hmac: [
            "hmac-sha2-256", "hmac-sha2-512",
            "hmac-sha1"
          ]
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : copy.unknownError;
      send({ type: "error", message: `${copy.connectFailed}${message}` });
      close();
    }
  }

  function handleInput(data: string) {
    if (!shell) return;
    shell?.write(data);
    if (data === "\r") {
      const command = currentLine.trim();
      currentLine = "";
      if (command) options.onCommand?.(command);
      return;
    }
    if (data === "\u007f") {
      currentLine = currentLine.slice(0, -1);
      return;
    }
    if (data === "\u0003") {
      currentLine = "";
      return;
    }
    currentLine += data.replace(/\p{C}/gu, "");
  }

  function handleResize(cols: number, rows: number) {
    shellSize = { cols, rows };
    shell?.setWindow(rows, cols, rows * 16, cols * 8);
  }

  function close() {
    shell?.end();
    shell = null;
    conn?.end();
    conn = null;
    tcpStream?.destroy();
    tcpStream = null;
  }

  return {
    handleClientMessage(message) {
      if (message.type === "input") handleInput(message.data);
      if (message.type === "resize") handleResize(message.cols, message.rows);
    },
    close
  };
}

class CloudflareSocketDuplex extends Duplex {
  private readonly reader: ReadableStreamDefaultReader<Uint8Array>;
  private readonly writer: WritableStreamDefaultWriter<Uint8Array>;
  private destroyedByClose = false;

  constructor(private readonly tcpSocket: ReturnType<typeof connect>) {
    super();
    this.reader = tcpSocket.readable.getReader();
    this.writer = tcpSocket.writable.getWriter();
    void this.pump();
  }

  _read() {
    // Data is pushed by pump().
  }

  _write(chunk: Buffer | Uint8Array | string, encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    const bytes = typeof chunk === "string" ? Buffer.from(chunk, encoding) : new Uint8Array(chunk);
    this.writer.write(bytes).then(() => callback(), callback);
  }

  _final(callback: (error?: Error | null) => void) {
    this.writer.close().then(() => callback(), callback);
  }

  _destroy(error: Error | null, callback: (error?: Error | null) => void) {
    this.destroyedByClose = true;
    Promise.allSettled([this.reader.cancel(), this.writer.abort(error ?? undefined)])
      .then(() => this.tcpSocket.close())
      .then(() => callback(error))
      .catch((closeError) => callback(closeError instanceof Error ? closeError : error));
  }

  private async pump() {
    try {
      while (!this.destroyedByClose) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (value) this.push(Buffer.from(value));
      }
      this.push(null);
    } catch (error) {
      if (!this.destroyedByClose) this.destroy(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

const terminalCopy = {
  zh: {
    title: "踏风 Tafeng WebSSH",
    selected: "已选择连接：",
    connecting: "正在建立真实 SSH 会话...",
    authenticated: "SSH 认证成功，正在打开终端...",
    sessionClosed: "SSH 会话已关闭",
    connectionClosed: "SSH 连接已断开",
    connectFailed: "连接失败：",
    noProfile: "没有找到要连接的 VPS 配置",
    unknownError: "未知错误"
  },
  en: {
    title: "Tafeng WebSSH",
    selected: "Selected connection: ",
    connecting: "Opening a real SSH session...",
    authenticated: "SSH authentication succeeded, opening terminal...",
    sessionClosed: "SSH session closed",
    connectionClosed: "SSH connection closed",
    connectFailed: "Connection failed: ",
    noProfile: "No VPS profile was found for this connection",
    unknownError: "Unknown error"
  }
} as const;
