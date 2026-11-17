import Dexie from "dexie";
import { type AppDb, createDb } from "../db/db";

const opened: AppDb[] = [];

/** 每个用例独立的数据库，避免串数据（技术方案 §9.3）。 */
export function makeTestDb(): AppDb {
  const database = createDb(`test-${crypto.randomUUID()}`);
  opened.push(database);
  return database;
}

export async function cleanupTestDbs(): Promise<void> {
  for (const database of opened.splice(0)) {
    database.close();
    await Dexie.delete(database.name);
  }
}
