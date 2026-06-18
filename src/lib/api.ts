import type { AppSettings, CommandHistoryEntry, RemoteFile, ServerProfile } from "../../shared/types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    },
    ...init
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message ?? "请求失败");
  }

  return response.json() as Promise<T>;
}

export const api = {
  login: (password: string, otp?: string) =>
    request<{ authenticated: boolean; twoFactorRequired: boolean }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ password, otp })
    }),
  logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  authState: () => request<{ authenticated: boolean }>("/api/auth/state"),
  settings: () => request<AppSettings>("/api/settings"),
  saveSettings: (settings: AppSettings) => request<AppSettings>("/api/settings", { method: "PUT", body: JSON.stringify(settings) }),
  setupTotp: () => request<{ secret: string; otpauthUrl: string }>("/api/totp/setup", { method: "POST" }),
  verifyTotp: (code: string) => request<AppSettings>("/api/totp/verify", { method: "POST", body: JSON.stringify({ code }) }),
  disableTotp: () => request<AppSettings>("/api/totp/disable", { method: "POST" }),
  connections: () => request<ServerProfile[]>("/api/connections"),
  createConnection: (profile: Omit<ServerProfile, "id" | "createdAt" | "updatedAt">) =>
    request<ServerProfile>("/api/connections", { method: "POST", body: JSON.stringify(profile) }),
  updateConnection: (profile: ServerProfile) =>
    request<ServerProfile>(`/api/connections/${profile.id}`, { method: "PUT", body: JSON.stringify(profile) }),
  deleteConnection: (id: string) => request<{ ok: boolean }>(`/api/connections/${id}`, { method: "DELETE" }),
  commandHistory: (limit = 200, offset = 0) =>
    request<{ items: CommandHistoryEntry[]; total: number }>(`/api/command-history?limit=${limit}&offset=${offset}`),
  clearCommandHistory: () => request<{ ok: boolean }>("/api/command-history", { method: "DELETE" }),
  files: (path: string) => request<RemoteFile[]>(`/api/files?path=${encodeURIComponent(path)}`),
  readFile: (path: string) => request<{ path: string; content: string }>(`/api/files/read?path=${encodeURIComponent(path)}`),
  writeFile: (path: string, content: string) =>
    request<{ ok: boolean; savedAt: string }>("/api/files/write", { method: "POST", body: JSON.stringify({ path, content }) })
};
