import { Pool, type PoolClient } from "pg";
import { DANGLING_ROUND_MS } from "./config";

export type DealRow = {
  id: number;
  canonicalUrl: string;
  url: string;
  title: string;
  summary: string;
  category: string;
  sourceId: string;
  publishedAt: number | null;
  expiresAt: number | null;
  firstSeenAt: number;
  firstSeenRoundId: number;
  updatedAt: number;
};

export type RoundRow = {
  id: number;
  trigger: string;
  startedAt: number;
  finishedAt: number | null;
  status: string;
};

export type SourceRunRow = {
  id: number;
  roundId: number;
  sourceId: string;
  ok: boolean;
  fetchedCount: number;
  insertedCount: number;
  error: string | null;
  finalUrl: string | null;
  startedAt: number;
  finishedAt: number | null;
};

type QueryResult = { rows: Record<string, unknown>[] };

export type SqlDatabase = {
  query(text: string, params?: unknown[]): Promise<QueryResult>;
  begin(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  close(): Promise<void>;
};

type GlobalDb = typeof globalThis & { __perkradarDb?: SqlDatabase };

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS deals (
      id BIGSERIAL PRIMARY KEY,
      canonical_url TEXT NOT NULL UNIQUE,
      url TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL,
      source_id TEXT NOT NULL,
      published_at BIGINT,
      expires_at BIGINT,
      first_seen_at BIGINT NOT NULL,
      first_seen_round_id BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    )`,
  `CREATE TABLE IF NOT EXISTS rounds (
      id BIGSERIAL PRIMARY KEY,
      trigger TEXT NOT NULL,
      started_at BIGINT NOT NULL,
      finished_at BIGINT,
      status TEXT NOT NULL
    )`,
  `CREATE TABLE IF NOT EXISTS source_runs (
      id BIGSERIAL PRIMARY KEY,
      round_id BIGINT NOT NULL,
      source_id TEXT NOT NULL,
      ok BOOLEAN NOT NULL,
      fetched_count INTEGER NOT NULL DEFAULT 0,
      inserted_count INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      final_url TEXT,
      started_at BIGINT NOT NULL,
      finished_at BIGINT
    )`,
  `CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`,
  `CREATE INDEX IF NOT EXISTS idx_deals_source ON deals(source_id)`,
  `CREATE INDEX IF NOT EXISTS idx_source_runs_round ON source_runs(round_id)`,
];

let current: SqlDatabase | null = null;
let opening: Promise<SqlDatabase> | null = null;

export async function migrateSchema(db: Pick<SqlDatabase, "query">): Promise<void> {
  for (const statement of SCHEMA_STATEMENTS) {
    await db.query(statement);
  }
}

function asRecordRows(rows: unknown[]): Record<string, unknown>[] {
  return rows.map((row) => row as Record<string, unknown>);
}

export function wrapPool(pool: Pool): SqlDatabase {
  let tx: PoolClient | null = null;
  return {
    async query(text, params) {
      const target = tx ?? pool;
      const result = await target.query(text, params);
      return { rows: asRecordRows(result.rows) };
    },
    async begin() {
      if (tx) throw new Error("transaction already open");
      tx = await pool.connect();
      try {
        await tx.query("BEGIN");
      } catch (error) {
        tx.release();
        tx = null;
        throw error;
      }
    },
    async commit() {
      if (!tx) throw new Error("no transaction");
      try {
        await tx.query("COMMIT");
      } finally {
        tx.release();
        tx = null;
      }
    },
    async rollback() {
      if (!tx) throw new Error("no transaction");
      try {
        await tx.query("ROLLBACK");
      } finally {
        tx.release();
        tx = null;
      }
    },
    async close() {
      if (tx) {
        try {
          await tx.query("ROLLBACK");
        } catch {
          // The transaction may already be closed.
        }
        try {
          tx.release();
        } catch {
          // Ignore a client that was already released.
        }
        tx = null;
      }
      await pool.end();
    },
  };
}

export function wrapEmbeddedPostgres(client: {
  query(text: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
  close(): Promise<void>;
}): SqlDatabase {
  let inTx = false;
  return {
    async query(text, params) {
      const result = await client.query(text, params);
      return { rows: asRecordRows(result.rows) };
    },
    async begin() {
      if (inTx) throw new Error("transaction already open");
      await client.query("BEGIN");
      inTx = true;
    },
    async commit() {
      if (!inTx) throw new Error("no transaction");
      try {
        await client.query("COMMIT");
      } finally {
        inTx = false;
      }
    },
    async rollback() {
      if (!inTx) throw new Error("no transaction");
      try {
        await client.query("ROLLBACK");
      } finally {
        inTx = false;
      }
    },
    async close() {
      if (inTx) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // The transaction may already be closed.
        }
        inTx = false;
      }
      await client.close();
    },
  };
}

export async function setActiveDatabase(db: SqlDatabase | null): Promise<void> {
  if (current && current !== db) {
    try {
      await current.close();
    } catch {
      // The previous handle may already be closed in tests.
    }
  }
  current = db;
}

export async function openPostgresDatabase(connectionString: string): Promise<SqlDatabase> {
  const pool = new Pool({ connectionString, max: 5 });
  try {
    const db = wrapPool(pool);
    await migrateSchema(db);
    return db;
  } catch {
    try {
      await pool.end();
    } catch {
      // Ignore cleanup errors so the original connection failure is not hidden.
    }
    throw new Error("Failed to connect to PostgreSQL or migrate schema");
  }
}

export async function getDb(): Promise<SqlDatabase> {
  if (current) return current;
  if (process.env.PERKRADAR_TEST === "1") {
    throw new Error("Test requested the live database; call useMemoryDb() first");
  }
  const g = globalThis as GlobalDb;
  if (g.__perkradarDb) {
    current = g.__perkradarDb;
    return current;
  }
  if (opening) return opening;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required");
  }
  opening = openPostgresDatabase(url)
    .then((db) => {
      current = db;
      g.__perkradarDb = db;
      opening = null;
      return db;
    })
    .catch((error) => {
      opening = null;
      throw error;
    });
  return opening;
}

async function exec(text: string, params: unknown[] = []): Promise<QueryResult> {
  return (await getDb()).query(text, params);
}

function asNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asOk(value: unknown): boolean {
  return value === true || value === "t" || value === "true" || Number(value) === 1;
}

function mapDeal(row: Record<string, unknown>): DealRow {
  return {
    id: asNumber(row.id) ?? 0,
    canonicalUrl: String(row.canonical_url),
    url: String(row.url),
    title: String(row.title),
    summary: String(row.summary ?? ""),
    category: String(row.category),
    sourceId: String(row.source_id),
    publishedAt: asNumber(row.published_at),
    expiresAt: asNumber(row.expires_at),
    firstSeenAt: asNumber(row.first_seen_at) ?? 0,
    firstSeenRoundId: asNumber(row.first_seen_round_id) ?? 0,
    updatedAt: asNumber(row.updated_at) ?? 0,
  };
}

function mapSourceRun(row: Record<string, unknown>): SourceRunRow {
  return {
    id: asNumber(row.id) ?? 0,
    roundId: asNumber(row.round_id) ?? 0,
    sourceId: String(row.source_id),
    ok: asOk(row.ok),
    fetchedCount: asNumber(row.fetched_count) ?? 0,
    insertedCount: asNumber(row.inserted_count) ?? 0,
    error: row.error == null ? null : String(row.error),
    finalUrl: row.final_url == null ? null : String(row.final_url),
    startedAt: asNumber(row.started_at) ?? 0,
    finishedAt: asNumber(row.finished_at),
  };
}

function mapRound(row: Record<string, unknown>): RoundRow {
  return {
    id: asNumber(row.id) ?? 0,
    trigger: String(row.trigger),
    startedAt: asNumber(row.started_at) ?? 0,
    finishedAt: asNumber(row.finished_at),
    status: String(row.status),
  };
}

export async function getMeta(key: string): Promise<string | null> {
  const result = await exec("SELECT value FROM meta WHERE key = $1", [key]);
  const row = result.rows[0];
  return row ? String(row.value) : null;
}

export async function setMeta(key: string, value: string): Promise<void> {
  await exec(
    "INSERT INTO meta (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value",
    [key, value],
  );
}

export async function listDeals(): Promise<DealRow[]> {
  const result = await exec(
    "SELECT * FROM deals ORDER BY COALESCE(published_at, first_seen_at) DESC, id DESC",
  );
  return result.rows.map(mapDeal);
}

export async function findDealByCanonical(canonicalUrl: string): Promise<DealRow | null> {
  const result = await exec("SELECT * FROM deals WHERE canonical_url = $1", [canonicalUrl]);
  const row = result.rows[0];
  return row ? mapDeal(row) : null;
}

export async function insertDeal(input: Omit<DealRow, "id">): Promise<number> {
  const result = await exec(
    `INSERT INTO deals (
        canonical_url, url, title, summary, category, source_id,
        published_at, expires_at, first_seen_at, first_seen_round_id, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id`,
    [
      input.canonicalUrl,
      input.url,
      input.title,
      input.summary,
      input.category,
      input.sourceId,
      input.publishedAt,
      input.expiresAt,
      input.firstSeenAt,
      input.firstSeenRoundId,
      input.updatedAt,
    ],
  );
  return asNumber(result.rows[0]?.id) ?? 0;
}

export async function updateDeal(
  id: number,
  input: {
    url: string;
    title: string;
    summary: string;
    category: string;
    publishedAt: number | null;
    expiresAt: number | null;
    updatedAt: number;
  },
): Promise<void> {
  await exec(
    `UPDATE deals
       SET url = $1, title = $2, summary = $3, category = $4, published_at = $5, expires_at = $6, updated_at = $7
       WHERE id = $8`,
    [
      input.url,
      input.title,
      input.summary,
      input.category,
      input.publishedAt,
      input.expiresAt,
      input.updatedAt,
      id,
    ],
  );
}

export async function deleteDeal(id: number): Promise<void> {
  await exec("DELETE FROM deals WHERE id = $1", [id]);
}

export async function insertRound(trigger: string, startedAt: number): Promise<number> {
  const result = await exec(
    "INSERT INTO rounds (trigger, started_at, status) VALUES ($1, $2, 'running') RETURNING id",
    [trigger, startedAt],
  );
  return asNumber(result.rows[0]?.id) ?? 0;
}

export async function finishRound(id: number, finishedAt: number, status: string): Promise<void> {
  await exec("UPDATE rounds SET finished_at = $1, status = $2 WHERE id = $3", [finishedAt, status, id]);
}

export async function insertSourceRun(input: Omit<SourceRunRow, "id">): Promise<void> {
  await exec(
    `INSERT INTO source_runs (
        round_id, source_id, ok, fetched_count, inserted_count, error, final_url, started_at, finished_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      input.roundId,
      input.sourceId,
      input.ok,
      input.fetchedCount,
      input.insertedCount,
      input.error,
      input.finalUrl,
      input.startedAt,
      input.finishedAt,
    ],
  );
}

/** Runs from the most recent finished round before `roundId`, for anomaly checks. */
export async function previousSourceRuns(roundId: number): Promise<SourceRunRow[]> {
  const result = await exec("SELECT MAX(id) AS id FROM rounds WHERE status != 'running' AND id < $1", [
    roundId,
  ]);
  const id = asNumber(result.rows[0]?.id);
  return id == null ? [] : listSourceRuns(id);
}

/** Return recent completed runs for one source, bounded for predictable health reads. */
export async function recentSourceRuns(sourceId: string, limit = 8): Promise<SourceRunRow[]> {
  const bounded = Math.max(1, Math.min(32, Math.floor(limit)));
  const result = await exec(
    `SELECT sr.*
       FROM source_runs sr
       JOIN rounds r ON r.id = sr.round_id
       WHERE sr.source_id = $1 AND r.status != 'running'
       ORDER BY sr.round_id DESC, sr.id DESC
       LIMIT $2`,
    [sourceId, bounded],
  );
  return result.rows.map(mapSourceRun);
}

export async function latestFinishedRound(): Promise<RoundRow | null> {
  const result = await exec("SELECT * FROM rounds WHERE status != 'running' ORDER BY id DESC LIMIT 1");
  const row = result.rows[0];
  return row ? mapRound(row) : null;
}

export async function listSourceRuns(roundId: number): Promise<SourceRunRow[]> {
  const result = await exec("SELECT * FROM source_runs WHERE round_id = $1 ORDER BY id ASC", [roundId]);
  return result.rows.map(mapSourceRun);
}

/** Mark rounds abandoned by a crashed process so the UI does not stay on "running" forever. */
export async function recoverDanglingRounds(now: number): Promise<void> {
  const result = await exec("SELECT id, started_at FROM rounds WHERE status = 'running'");
  for (const row of result.rows) {
    const started = asNumber(row.started_at) ?? 0;
    if (now - started < DANGLING_ROUND_MS) continue;
    const id = asNumber(row.id) ?? 0;
    await exec("UPDATE rounds SET status = 'failed', finished_at = $1 WHERE id = $2", [now, id]);
    await exec(
      `UPDATE source_runs
         SET ok = FALSE, error = COALESCE(error, '进程中断'), finished_at = COALESCE(finished_at, $1)
         WHERE round_id = $2 AND finished_at IS NULL`,
      [now, id],
    );
  }
}

export async function beginImmediate(): Promise<void> {
  await (await getDb()).begin();
}

export async function commit(): Promise<void> {
  await (await getDb()).commit();
}

export async function rollback(): Promise<void> {
  await (await getDb()).rollback();
}
