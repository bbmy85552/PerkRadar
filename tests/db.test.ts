import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  beginImmediate,
  commit,
  findDealByCanonical,
  getMeta,
  insertDeal,
  insertRound,
  listDeals,
  recoverDanglingRounds,
  rollback,
  setMeta,
} from "../src/lib/db";
import { useMemoryDb } from "./helpers";

describe("db", { concurrency: false }, () => {
  it("migrates schema, upserts meta, and enforces unique canonical URLs", async () => {
    await useMemoryDb();
    await setMeta("hello", "one");
    await setMeta("hello", "two");
    assert.equal(await getMeta("hello"), "two");
    await insertDeal({
      canonicalUrl: "https://example.com/a",
      url: "https://example.com/a",
      title: "SYNTHETIC unique",
      summary: "",
      category: "其他",
      sourceId: "v2ex",
      publishedAt: null,
      expiresAt: null,
      firstSeenAt: 1,
      firstSeenRoundId: 1,
      updatedAt: 1,
    });
    await assert.rejects(
      () =>
        insertDeal({
          canonicalUrl: "https://example.com/a",
          url: "https://example.com/a",
          title: "SYNTHETIC duplicate",
          summary: "",
          category: "其他",
          sourceId: "v2ex",
          publishedAt: null,
          expiresAt: null,
          firstSeenAt: 2,
          firstSeenRoundId: 2,
          updatedAt: 2,
        }),
    );
    assert.equal((await findDealByCanonical("https://example.com/a"))?.title, "SYNTHETIC unique");
  });

  it("rolls back an open transaction and recovers dangling rounds", async () => {
    await useMemoryDb();
    await beginImmediate();
    await insertDeal({
      canonicalUrl: "https://example.com/tx",
      url: "https://example.com/tx",
      title: "SYNTHETIC rollback",
      summary: "",
      category: "其他",
      sourceId: "v2ex",
      publishedAt: null,
      expiresAt: null,
      firstSeenAt: 1,
      firstSeenRoundId: 1,
      updatedAt: 1,
    });
    await rollback();
    assert.equal((await listDeals()).length, 0);

    await beginImmediate();
    await insertDeal({
      canonicalUrl: "https://example.com/commit",
      url: "https://example.com/commit",
      title: "SYNTHETIC commit",
      summary: "",
      category: "其他",
      sourceId: "v2ex",
      publishedAt: null,
      expiresAt: null,
      firstSeenAt: 1,
      firstSeenRoundId: 1,
      updatedAt: 1,
    });
    await commit();
    assert.equal((await listDeals()).length, 1);

    const startedAt = 1_000;
    const id = await insertRound("schedule", startedAt);
    assert.ok(id > 0);
    await recoverDanglingRounds(startedAt + 60_000);
    // Still running: 3 minutes have not passed.
    await recoverDanglingRounds(startedAt + 3 * 60_000);
    const { latestFinishedRound } = await import("../src/lib/db");
    const finished = await latestFinishedRound();
    assert.equal(finished?.id, id);
    assert.equal(finished?.status, "failed");
  });
});
