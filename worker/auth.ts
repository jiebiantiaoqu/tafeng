import type { Env } from "./storage";
import { createSession, getSettings, getTotpSecret } from "./storage";
import { verifyTotp } from "./totp";

export function getCookie(request: Request, name: string) {
  const cookie = request.headers.get("Cookie") ?? "";
  return cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(name + "="))
    ?.slice(name.length + 1) ?? null;
}

export async function handleLogin(request: Request, env: Env) {
  const body = await request.json<{ password?: string; otp?: string }>();
  const expectedPassword = env.ADMIN_PASSWORD ?? "tafeng";
  const settings = await getSettings(env);

  if (body.password !== expectedPassword) {
    return json({ message: "管理密码错误" }, 401);
  }

  if (settings.twoFactorEnabled && !(await verifyTotp(body.otp, await getTotpSecret(env)))) {
    return json({ twoFactorRequired: true, message: "请输入两步验证码" }, 401);
  }

  const token = await createSession(env);
  return json(
    { authenticated: true, twoFactorRequired: false },
    200,
    { "Set-Cookie": `tafeng_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=43200` }
  );
}

export function json(data: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...headers
    }
  });
}
