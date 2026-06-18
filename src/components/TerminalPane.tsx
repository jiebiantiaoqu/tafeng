import { PlugZap } from "lucide-react";
import { useEffect, useRef } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import type { Language, ProcessInfo, ServerMetrics, TerminalMessage } from "../../shared/types";

type Props = {
  profileId?: string;
  connectionAttempt: number;
  language: Language;
  connectingLabel: string;
  onMetrics: (metrics: ServerMetrics, processes: ProcessInfo[]) => void;
  onCommandSubmitted?: () => void;
};

export function TerminalPane({ profileId, connectionAttempt, language, connectingLabel, onMetrics, onCommandSubmitted }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;

    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily: '"SFMono-Regular", "Cascadia Code", "JetBrains Mono", monospace',
      fontSize: 14,
      theme: {
        background: "#070707",
        foreground: "#f5f5f5",
        cursor: "#78dce8"
      }
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(hostRef.current);
    fit.fit();
    terminalRef.current = terminal;

    const resize = () => fit.fit();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      socketRef.current?.close();
      terminal.dispose();
    };
  }, []);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal || !profileId) return;

    terminal.clear();
    terminal.writeln(connectingLabel);
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(
      `${protocol}://${window.location.host}/ws/terminal?profileId=${encodeURIComponent(profileId)}&language=${language}`
    );
    socketRef.current?.close();
    socketRef.current = socket;

    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({ type: "hello", profileId } satisfies TerminalMessage));
    });
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as TerminalMessage;
      if (message.type === "output") terminal.write(message.data);
      if (message.type === "metrics") onMetrics(message.metrics, message.processes);
      if (message.type === "error") terminal.writeln(`\r\n${message.message}`);
    });
    const inputDisposable = terminal.onData((data) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "input", data } satisfies TerminalMessage));
      if (data === "\r") window.setTimeout(() => onCommandSubmitted?.(), 300);
    });

    return () => {
      inputDisposable.dispose();
      socket.close();
    };
  }, [connectingLabel, connectionAttempt, language, onCommandSubmitted, onMetrics, profileId]);

  return (
    <section className="terminal-wrap">
      <div className="terminal-toolbar">
        <div className="traffic-lights" aria-hidden="true">
          <span className="red" />
          <span className="yellow" />
          <span className="green" />
        </div>
        <div className="terminal-title">
          <PlugZap size={16} />
          tafeng@webssh
        </div>
      </div>
      <div ref={hostRef} className="terminal-host" />
    </section>
  );
}
