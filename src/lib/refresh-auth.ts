import { timingSafeEqual } from "node:crypto";
import { GuardError, assertSameOrigin } from "./guard";

export function configuredRefreshSecret(): string | undefined {
  const secret = process.env.CRON_SECRET || process.env.REFRESH_SECRET;
  return secret ? secret : undefined;
}

export function providedRefreshSecret(headers: Headers): string | null {
  const auth = headers.get("authorization");
  if (auth) {
    const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (match?.[1]) return match[1].trim();
  }
  const header = headers.get("x-cron-secret") || headers.get("x-refresh-secret");
  if (header && header.trim()) return header.trim();
  return null;
}

export function secretsMatch(expected: string, provided: string): boolean {
  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  if (left.length !== right.length) {
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}

export function hasValidRefreshSecret(headers: Headers): boolean {
  const expected = configuredRefreshSecret();
  if (!expected) return false;
  const provided = providedRefreshSecret(headers);
  if (!provided) return false;
  return secretsMatch(expected, provided);
}

/** Browser same-origin POST from the app UI. Curl without Origin is not treated as same-origin. */
export function isSameOriginRefresh(headers: Headers): boolean {
  try {
    assertSameOrigin(headers);
  } catch (error) {
    if (error instanceof GuardError) return false;
    throw error;
  }
  const site = headers.get("sec-fetch-site");
  if (site === "same-origin" || site === "same-site") return true;
  return Boolean(headers.get("origin"));
}
