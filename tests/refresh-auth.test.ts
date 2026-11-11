import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  configuredRefreshSecret,
  hasValidRefreshSecret,
  isSameOriginRefresh,
  providedRefreshSecret,
  secretsMatch,
} from "../src/lib/refresh-auth";

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

describe("refresh-auth", { concurrency: false }, () => {
  it("reads CRON_SECRET or REFRESH_SECRET and matches bearer or header values", () => {
    withEnv({ CRON_SECRET: "alpha-secret", REFRESH_SECRET: "ignored-when-cron-set" }, () => {
      assert.equal(configuredRefreshSecret(), "alpha-secret");
      assert.equal(
        providedRefreshSecret(new Headers({ authorization: "Bearer alpha-secret" })),
        "alpha-secret",
      );
      assert.equal(providedRefreshSecret(new Headers({ "x-cron-secret": "alpha-secret" })), "alpha-secret");
      assert.equal(providedRefreshSecret(new Headers({ "x-refresh-secret": "alpha-secret" })), "alpha-secret");
      assert.equal(hasValidRefreshSecret(new Headers({ authorization: "Bearer alpha-secret" })), true);
      assert.equal(hasValidRefreshSecret(new Headers({ authorization: "Bearer wrong" })), false);
      assert.equal(hasValidRefreshSecret(new Headers()), false);
    });
    withEnv({ CRON_SECRET: undefined, REFRESH_SECRET: "beta-secret" }, () => {
      assert.equal(configuredRefreshSecret(), "beta-secret");
      assert.equal(hasValidRefreshSecret(new Headers({ "x-refresh-secret": "beta-secret" })), true);
    });
    withEnv({ CRON_SECRET: undefined, REFRESH_SECRET: undefined }, () => {
      assert.equal(configuredRefreshSecret(), undefined);
      assert.equal(hasValidRefreshSecret(new Headers({ authorization: "Bearer anything" })), false);
    });
  });

  it("compares secrets in constant time and treats same-origin browser posts as UI refresh", () => {
    assert.equal(secretsMatch("abc", "abc"), true);
    assert.equal(secretsMatch("abc", "ab"), false);
    assert.equal(secretsMatch("abc", "abd"), false);
    assert.equal(
      isSameOriginRefresh(new Headers({ origin: "http://127.0.0.1:38471", host: "127.0.0.1:38471" })),
      true,
    );
    assert.equal(isSameOriginRefresh(new Headers({ "sec-fetch-site": "same-origin" })), true);
    assert.equal(isSameOriginRefresh(new Headers()), false);
    assert.equal(isSameOriginRefresh(new Headers({ "sec-fetch-site": "cross-site" })), false);
    assert.equal(
      isSameOriginRefresh(new Headers({ origin: "https://evil.example", host: "127.0.0.1:38471" })),
      false,
    );
  });
});
