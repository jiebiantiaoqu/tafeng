import type { AppSettings, CommandHistoryEntry, ServerProfile } from "../shared/types";

export type Env = {
  ASSETS: Fetcher;
  TAFENG_KV?: KVNamespace;
  TAFENG_FILES?: R2Bucket;
  ADMIN_PASSWORD?: string;
  SESSION_SECRET?: string;
};

const SETTINGS_KEY = "settings";
const CONNECTIONS_KEY = "connections";
const SESSION_PREFIX = "session:";
const TOTP_SECRET_KEY = "totp:secret";
const TOTP_PENDING_SECRET_KEY = "totp:pending-secret";
const COMMAND_HISTORY_INDEX_KEY = "command-history:index";
const COMMAND_HISTORY_ITEM_PREFIX = "command-history:item:";
const COMMAND_HISTORY_LIMIT = 100_000;
const memoryKv = new Map<string, { value: string; expiresAt?: number }>();

export const defaultSettings: AppSettings = {
  managementPasswordSet: false,
  twoFactorEnabled: false,
  theme: "dark",
  language: "zh"
};

export async function getSettings(env: Env): Promise<AppSettings> {
  const stored = await kvGet<AppSettings>(env, SETTINGS_KEY, "json");
  return { ...defaultSettings, ...stored, managementPasswordSet: Boolean(env.ADMIN_PASSWORD) || Boolean(stored?.managementPasswordSet) };
}

export async function saveSettings(env: Env, settings: AppSettings) {
  await kvPut(env, SETTINGS_KEY, JSON.stringify(settings));
}

export async function getTotpSecret(env: Env) {
  return kvGet(env, TOTP_SECRET_KEY);
}

export async function savePendingTotpSecret(env: Env, secret: string) {
  await kvPut(env, TOTP_PENDING_SECRET_KEY, secret, { expirationTtl: 10 * 60 });
}

export async function getPendingTotpSecret(env: Env) {
  return kvGet(env, TOTP_PENDING_SECRET_KEY);
}

export async function enableTotp(env: Env, secret: string) {
  const settings = await getSettings(env);
  await Promise.all([
    kvPut(env, TOTP_SECRET_KEY, secret),
    kvDelete(env, TOTP_PENDING_SECRET_KEY),
    saveSettings(env, { ...settings, twoFactorEnabled: true })
  ]);
}

export async function disableTotp(env: Env) {
  const settings = await getSettings(env);
  await Promise.all([
    kvDelete(env, TOTP_SECRET_KEY),
    kvDelete(env, TOTP_PENDING_SECRET_KEY),
    saveSettings(env, { ...settings, twoFactorEnabled: false })
  ]);
}

export async function listConnections(env: Env): Promise<ServerProfile[]> {
  return (await kvGet<ServerProfile[]>(env, CONNECTIONS_KEY, "json")) ?? [];
}

export async function saveConnections(env: Env, profiles: ServerProfile[]) {
  await kvPut(env, CONNECTIONS_KEY, JSON.stringify(profiles));
}

export async function createSession(env: Env) {
  const token = crypto.randomUUID() + "." + crypto.randomUUID();
  await kvPut(env, SESSION_PREFIX + token, "1", { expirationTtl: 60 * 60 * 12 });
  return token;
}

export async function isValidSession(env: Env, token: string | null) {
  if (!token) return false;
  return (await kvGet(env, SESSION_PREFIX + token)) === "1";
}

export async function clearSession(env: Env, token: string | null) {
  if (token) await kvDelete(env, SESSION_PREFIX + token);
}

export async function appendCommandHistory(env: Env, entry: Omit<CommandHistoryEntry, "id" | "createdAt">) {
  const id = crypto.randomUUID();
  const item: CommandHistoryEntry = {
    ...entry,
    id,
    createdAt: new Date().toISOString()
  };

  const currentIndex = (await kvGet<string[]>(env, COMMAND_HISTORY_INDEX_KEY, "json")) ?? [];
  const nextIndex = [id, ...currentIndex];
  const staleIds = nextIndex.splice(COMMAND_HISTORY_LIMIT);

  await Promise.all([
    kvPut(env, COMMAND_HISTORY_ITEM_PREFIX + id, JSON.stringify(item)),
    kvPut(env, COMMAND_HISTORY_INDEX_KEY, JSON.stringify(nextIndex))
  ]);

  await Promise.all(staleIds.map((staleId) => kvDelete(env, COMMAND_HISTORY_ITEM_PREFIX + staleId)));
  return item;
}

export async function listCommandHistory(env: Env, limit = 200, offset = 0): Promise<{ items: CommandHistoryEntry[]; total: number }> {
  const index = (await kvGet<string[]>(env, COMMAND_HISTORY_INDEX_KEY, "json")) ?? [];
  const boundedLimit = Math.min(Math.max(limit, 1), 1000);
  const boundedOffset = Math.max(offset, 0);
  const ids = index.slice(boundedOffset, boundedOffset + boundedLimit);
  const items = await Promise.all(ids.map((id) => kvGet<CommandHistoryEntry>(env, COMMAND_HISTORY_ITEM_PREFIX + id, "json")));
  return {
    items: items.filter((item): item is CommandHistoryEntry => Boolean(item)),
    total: index.length
  };
}

export async function clearCommandHistory(env: Env) {
  const index = (await kvGet<string[]>(env, COMMAND_HISTORY_INDEX_KEY, "json")) ?? [];
  await Promise.all(index.map((id) => kvDelete(env, COMMAND_HISTORY_ITEM_PREFIX + id)));
  await kvDelete(env, COMMAND_HISTORY_INDEX_KEY);
}

async function kvGet<T = string>(env: Env, key: string, type?: "json"): Promise<T | null> {
  if (env.TAFENG_KV) {
    if (type === "json") return env.TAFENG_KV.get<T>(key, "json");
    return (await env.TAFENG_KV.get(key)) as T | null;
  }
  const item = memoryKv.get(key);
  if (!item) return null;
  if (item.expiresAt && item.expiresAt <= Date.now()) {
    memoryKv.delete(key);
    return null;
  }
  return (type === "json" ? JSON.parse(item.value) : item.value) as T;
}

async function kvPut(env: Env, key: string, value: string, options?: { expirationTtl?: number }) {
  if (env.TAFENG_KV) {
    await env.TAFENG_KV.put(key, value, options);
    return;
  }
  memoryKv.set(key, { value, expiresAt: options?.expirationTtl ? Date.now() + options.expirationTtl * 1000 : undefined });
}

async function kvDelete(env: Env, key: string) {
  if (env.TAFENG_KV) {
    await env.TAFENG_KV.delete(key);
    return;
  }
  memoryKv.delete(key);
}
