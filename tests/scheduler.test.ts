import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { REFRESH_INTERVAL_MS } from "../src/lib/config";
import { getMeta } from "../src/lib/db";
import { shouldStartScheduler, startScheduler, stopSchedulerForTests } from "../src/lib/scheduler";
import type { BoardState } from "../src/lib/types";
import { useMemoryDb } from "./helpers";

function withEnv(values: Record<string, string | undefined>, run: () => void): void {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe("scheduler", { concurrency: false }, () => {
  it("stays off unless ENABLE_SCHEDULER=1 is set", () => {
    withEnv(
      { ENABLE_SCHEDULER: undefined, DISABLE_SCHEDULER: undefined, NEXT_PHASE: undefined, npm_lifecycle_event: undefined },
      () => assert.equal(shouldStartScheduler(), false),
    );
    withEnv({ ENABLE_SCHEDULER: "1", DISABLE_SCHEDULER: undefined, NEXT_PHASE: undefined, npm_lifecycle_event: undefined }, () =>
      assert.equal(shouldStartScheduler(), true),
    );
    withEnv({ ENABLE_SCHEDULER: "1", DISABLE_SCHEDULER: "1", NEXT_PHASE: undefined, npm_lifecycle_event: undefined }, () =>
      assert.equal(shouldStartScheduler(), false),
    );
    withEnv({ ENABLE_SCHEDULER: "1", DISABLE_SCHEDULER: undefined, NEXT_PHASE: "phase-production-build", npm_lifecycle_event: undefined }, () =>
      assert.equal(shouldStartScheduler(), false),
    );
    withEnv({ ENABLE_SCHEDULER: "1", DISABLE_SCHEDULER: undefined, NEXT_PHASE: undefined, npm_lifecycle_event: "build" }, () =>
      assert.equal(shouldStartScheduler(), false),
    );
  });

  it("uses a two-hour server interval and fires the supplied run once on boot", async () => {
    await useMemoryDb();
    assert.equal(REFRESH_INTERVAL_MS, 7_200_000);
    let calls = 0;
    withEnv({ ENABLE_SCHEDULER: "1", DISABLE_SCHEDULER: undefined, NEXT_PHASE: undefined, npm_lifecycle_event: undefined }, () => {
      startScheduler({
        bootDelayMs: 20,
        intervalMs: 60_000,
        run: async () => {
          calls += 1;
          return {} as BoardState;
        },
      });
      startScheduler({
        bootDelayMs: 1,
        run: async () => {
          calls += 100;
          return {} as BoardState;
        },
      });
    });
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(calls, 1);
    assert.ok(await getMeta("next_refresh_at"));
    stopSchedulerForTests();
  });
});
