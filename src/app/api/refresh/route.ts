import { NextResponse } from "next/server";
import { GuardError, assertSameOrigin, assertSmallBody, clientIp, consumeManualAttempt } from "@/lib/guard";
import { logEvent, logFailure } from "@/lib/log";
import {
  configuredRefreshSecret,
  hasValidRefreshSecret,
  isSameOriginRefresh,
} from "@/lib/refresh-auth";
import { RefreshRejected, runRefresh } from "@/lib/refresh";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function json(body: unknown, status = 200, extra?: HeadersInit) {
  return NextResponse.json(body, {
    status,
    headers: { "cache-control": "no-store", ...Object.fromEntries(new Headers(extra).entries()) },
  });
}

async function runAndRespond(trigger: "manual" | "schedule") {
  const board = await runRefresh({ trigger });
  logEvent(trigger === "manual" ? "manual_refresh_ok" : "cron_refresh_ok", {
    roundStatus: board.roundStatus,
    activeCount: board.activeCount,
  });
  return json(board);
}

function rejectRefresh(error: unknown) {
  if (error instanceof GuardError) {
    logEvent("manual_refresh_rejected", { code: "guard", status: error.status });
    return json({ error: error.message }, error.status);
  }
  if (error instanceof RefreshRejected) {
    const status = error.code === "BUSY" ? 409 : 429;
    logEvent("manual_refresh_rejected", { code: error.code, status });
    const headers = error.retryAfterMs
      ? { "retry-after": String(Math.max(1, Math.ceil(error.retryAfterMs / 1000))) }
      : undefined;
    return json({ error: error.message }, status, headers);
  }
  logFailure("manual_refresh_failed", error);
  return json({ error: "刷新失败" }, 500);
}

export async function GET(request: Request) {
  try {
    if (!hasValidRefreshSecret(request.headers)) {
      logEvent("cron_refresh_rejected", { code: "unauthorized", status: 401 });
      return json({ error: "未授权" }, 401);
    }
    return await runAndRespond("schedule");
  } catch (error) {
    return rejectRefresh(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSmallBody(request.headers);
    if (hasValidRefreshSecret(request.headers)) {
      return await runAndRespond("schedule");
    }
    if (configuredRefreshSecret() && !isSameOriginRefresh(request.headers)) {
      logEvent("manual_refresh_rejected", { code: "unauthorized", status: 401 });
      return json({ error: "未授权" }, 401);
    }
    assertSameOrigin(request.headers);
    const ip = clientIp(request.headers);
    if (!consumeManualAttempt(ip, Date.now())) {
      logEvent("manual_refresh_rejected", { code: "rate_limit", status: 429 });
      return json({ error: "手动刷新过于频繁，请稍后再试" }, 429, { "retry-after": "60" });
    }
    return await runAndRespond("manual");
  } catch (error) {
    return rejectRefresh(error);
  }
}
