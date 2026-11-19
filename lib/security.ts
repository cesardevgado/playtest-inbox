import {
  randomBytes,
  createHmac,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { NextRequest } from "next/server";
const g = globalThis as unknown as {
  localSecret?: string;
  limits?: Map<string, { count: number; until: number }>;
};
function secret() {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32)
    return process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === "production")
    throw new Error("Set SESSION_SECRET to at least 32 random characters.");
  return (g.localSecret ??= randomBytes(32).toString("hex"));
}
export const token = () => randomBytes(24).toString("hex");
export function equal(a: string, b: string) {
  return timingSafeEqual(
    createHash("sha256").update(a).digest(),
    createHash("sha256").update(b).digest(),
  );
}
export type Session = {
  projectId: string;
  mode: "demo" | "private";
  expires: number;
};
export function sign(s: Session) {
  const body = Buffer.from(JSON.stringify(s)).toString("base64url");
  return (
    body + "." + createHmac("sha256", secret()).update(body).digest("base64url")
  );
}
export function session(req: NextRequest): Session | null {
  const cookie = req.cookies.get("pi_session")?.value;
  if (!cookie) return null;
  try {
    const [body, sig] = cookie.split(".");
    if (
      !sig ||
      !equal(
        sig,
        createHmac("sha256", secret()).update(body).digest("base64url"),
      )
    )
      return null;
    const s = JSON.parse(Buffer.from(body, "base64url").toString());
    return s.expires > Date.now() &&
      (s.mode === "demo" || s.mode === "private") &&
      typeof s.projectId === "string"
      ? s
      : null;
  } catch {
    return null;
  }
}
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function demand(
  ok: unknown,
  status: number,
  message: string,
): asserts ok {
  if (!ok) throw new HttpError(status, message);
}
export function field(value: unknown, name: string, max = 3000) {
  demand(
    typeof value === "string" &&
      value.trim().length > 0 &&
      value.trim().length <= max,
    400,
    `${name} is required (up to ${max} characters).`,
  );
  return value.trim();
}
export function throttle(key: string, limit: number) {
  const now = Date.now();
  const m = (g.limits ??= new Map());
  for (const [k, v] of m) if (v.until < now) m.delete(k);
  const value = m.get(key) || { count: 0, until: now + 60000 };
  demand(
    value.count < limit,
    429,
    "Too many requests. Please wait one minute.",
  );
  value.count++;
  m.set(key, value);
}
