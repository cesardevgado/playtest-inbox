import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { DB, Store } from "./db";

export function makeDemoStore(schema: string): Store {
  const sqlite = new DatabaseSync(":memory:", {
    enableForeignKeyConstraints: true,
  });
  sqlite.exec(schema);

  // Reads and transactions share one queue, so no HTTP request can use the
  // connection midway through another request's transaction.
  let tail: Promise<void> = Promise.resolve();
  function serialize<T>(work: () => Promise<T>): Promise<T> {
    const next = tail.then(work);
    tail = next.then(
      () => {},
      () => {},
    );
    return next;
  }

  const connection: DB = {
    async query(sql, params: SQLInputValue[] = []) {
      const statement = sqlite.prepare(sql);
      const rows = params.length
        ? statement.all(
            Object.fromEntries(params.map((value, i) => [`$${i + 1}`, value])),
          )
        : statement.all();
      return { rows };
    },
  };

  return {
    db: {
      query: (sql, params) => serialize(() => connection.query(sql, params)),
    },
    ready: Promise.resolve(),
    transaction: (work) =>
      serialize(async () => {
        sqlite.exec("BEGIN IMMEDIATE");
        try {
          const result = await work(connection);
          sqlite.exec("COMMIT");
          return result;
        } catch (error) {
          sqlite.exec("ROLLBACK");
          throw error;
        }
      }),
  };
}
