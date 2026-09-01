import { createHash, timingSafeEqual } from "crypto";

type Credentials = { email: string; password: string };

function configuredEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS?.trim();
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((value): value is string => typeof value === "string").map((value) => value.trim().toLowerCase());
  } catch {
    // Comma-separated values are the documented fallback.
  }
  return raw.split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
}

function safeEqual(left: string, right: string) {
  const a = createHash("sha256").update(left).digest();
  const b = createHash("sha256").update(right).digest();
  return timingSafeEqual(a, b);
}

export function parseBasicCredentials(value: string | null): Credentials | null {
  if (!value?.startsWith("Basic ")) return null;
  try {
    const decoded = Buffer.from(value.slice(6), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator <= 0) return null;
    return { email: decoded.slice(0, separator), password: decoded.slice(separator + 1) };
  } catch {
    return null;
  }
}

export function isAdminCredentialsValid(credentials: Credentials | null) {
  const password = process.env.ADMIN_PASSWORD;
  const emails = configuredEmails();
  if (!password || emails.length === 0 || !credentials) return false;
  const emailAllowed = emails.some((email) => safeEqual(email, credentials.email.trim().toLowerCase()));
  return emailAllowed && safeEqual(password, credentials.password);
}

export function isAdminAuthorizationHeaderValid(value: string | null) {
  return isAdminCredentialsValid(parseBasicCredentials(value));
}
