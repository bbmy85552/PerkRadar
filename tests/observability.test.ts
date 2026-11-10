import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getBoardState } from "../src/lib/board";
import { finishRound, insertRound, insertSourceRun } from "../src/lib/db";
import { toHealthReport } from "../src/lib/health";
import { useMemoryDb } from "./helpers";

const NOW = Date.parse("2026-11-08T08:00:00.000Z");
const HOUR = 3_600_000;

async function run(options: {
  roundId: number;
  sourceId: string;
  ok: boolean;
  fetched: number;
  startedAt: number;
  finishedAt: number;
  error?: string | null;
}) {
  await insertSourceRun({
    roundId: options.roundId,
    sourceId: options.sourceId,
    ok: options.ok,
    fetchedCount: options.fetched,
    insertedCount: options.fetched,
    error: options.error ?? null,
    finalUrl: null,
    startedAt: options.startedAt,
    finishedAt: options.finishedAt,
  });
}

describe("observability", { concurrency: false }, () => {
  it("flags an empty database as not yet verified", async () => {
    await useMemoryDb();
    const board = await getBoardState(NOW);
    assert.equal(board.freshness?.lastRoundAgeMs, null);
    assert.equal(board.freshness?.stale, false);
    assert.ok(board.anomalies?.some((item) => item.includes("还没有完成任何一轮")));
    const report = toHealthReport(board);
    assert.equal(report.freshness.stale, false);
    assert.equal(report.anomalies.length, board.anomalies?.length);
  });

  it("marks stale and severe rounds and exposes the age on the health report", async () => {
    await useMemoryDb();
    const roundId = await insertRound("schedule", NOW - 5 * HOUR);
    await run({ roundId, sourceId: "v2ex", ok: false, fetched: 0, startedAt: NOW - 5 * HOUR, finishedAt: NOW - 5 * HOUR, error: "超时" });
    await finishRound(roundId, NOW - 5 * HOUR, "failed");
    const board = await getBoardState(NOW);
    assert.equal(board.freshness?.stale, true);
    assert.equal(board.freshness?.severe, true);
    assert.equal(board.freshness?.lastRoundAgeMs, 5 * HOUR);
    assert.ok(board.anomalies?.some((item) => item.includes("超过 4 小时")));
    assert.ok(board.anomalies?.some((item) => item.includes("所有来源都失败")));
    assert.equal(toHealthReport(board).freshness.severe, true);
  });

  it("reports a source that succeeded but parsed zero items", async () => {
    await useMemoryDb();
    const roundId = await insertRound("schedule", NOW - 1000);
    await run({ roundId, sourceId: "appinn", ok: true, fetched: 0, startedAt: NOW - 1000, finishedAt: NOW });
    await finishRound(roundId, NOW, "success");
    const board = await getBoardState(NOW);
    assert.equal(board.freshness?.stale, false);
    assert.ok(board.anomalies?.some((item) => item.includes("小众软件") && item.includes("0 条")));
  });

  it("reports a sharp drop from the previous finished round", async () => {
    await useMemoryDb();
    const first = await insertRound("schedule", NOW - 3 * HOUR);
    await run({ roundId: first, sourceId: "v2ex", ok: true, fetched: 50, startedAt: NOW - 3 * HOUR, finishedAt: NOW - 3 * HOUR });
    await finishRound(first, NOW - 3 * HOUR, "success");
    const second = await insertRound("schedule", NOW - 1000);
    await run({ roundId: second, sourceId: "v2ex", ok: true, fetched: 0, startedAt: NOW - 1000, finishedAt: NOW });
    await finishRound(second, NOW, "success");
    const board = await getBoardState(NOW);
    assert.ok(board.anomalies?.some((item) => item.includes("V2EX推广") && item.includes("降到 0")));
  });
});
