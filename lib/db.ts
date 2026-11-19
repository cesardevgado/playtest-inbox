import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import path from "node:path";
import fs from "node:fs";
export type Row = Record<string, any>;
export type DB = {
  query: (sql: string, params?: any[]) => Promise<{ rows: Row[] }>;
};
const schema = `
CREATE TABLE IF NOT EXISTS projects(id text PRIMARY KEY,name text NOT NULL,mode text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS builds(id text PRIMARY KEY,project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,name text NOT NULL,sequence int NOT NULL,token text UNIQUE NOT NULL, UNIQUE(project_id,sequence),UNIQUE(project_id,name));
CREATE TABLE IF NOT EXISTS issues(id text PRIMARY KEY,project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,title text NOT NULL,steps text NOT NULL,expected text NOT NULL,actual text NOT NULL,status text NOT NULL CHECK(status IN ('reported','ready','verified','reopened')),reported_build_id text NOT NULL REFERENCES builds(id),target_build_id text REFERENCES builds(id),report_token text UNIQUE NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS events(id text PRIMARY KEY,sequence bigserial,issue_id text NOT NULL REFERENCES issues(id) ON DELETE CASCADE,kind text NOT NULL,build_id text NOT NULL REFERENCES builds(id),note text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS issues_project_idx ON issues(project_id);
CREATE INDEX IF NOT EXISTS events_issue_idx ON events(issue_id);
`;
type Store = {
  db: DB;
  transaction: <T>(fn: (db: DB) => Promise<T>) => Promise<T>;
  ready: Promise<unknown>;
};
const g = globalThis as unknown as { store?: Store };
export function store(): Store {
  if (g.store) return g.store;
  if (process.env.DATABASE_URL) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    g.store = {
      db: pool,
      ready: pool.query(schema),
      transaction: async (fn) => {
        const c = await pool.connect();
        try {
          await c.query("BEGIN");
          const value = await fn(c);
          await c.query("COMMIT");
          return value;
        } catch (e) {
          await c.query("ROLLBACK");
          throw e;
        } finally {
          c.release();
        }
      },
    };
  } else {
    const dir =
      process.env.PGLITE_PATH || path.join(process.cwd(), ".data", "postgres");
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    const pg = new PGlite(dir);
    g.store = {
      db: pg as DB,
      ready: pg.exec(schema),
      transaction: (fn) => pg.transaction((tx) => fn(tx as DB)),
    };
  }
  return g.store!;
}
export async function query(sql: string, params: any[] = []) {
  const s = store();
  await s.ready;
  return (await s.db.query(sql, params)).rows;
}
export async function transaction<T>(fn: (db: DB) => Promise<T>) {
  const s = store();
  await s.ready;
  return s.transaction(fn);
}
