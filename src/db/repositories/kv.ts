import type { AppDb } from "../db";

export async function getKv<T>(db: AppDb, key: string): Promise<T | undefined> {
  const row = await db.kv.get(key);
  return row?.value as T | undefined;
}

export async function setKv(db: AppDb, key: string, value: unknown): Promise<void> {
  await db.kv.put({ key, value });
}

export async function deleteKv(db: AppDb, key: string): Promise<void> {
  await db.kv.delete(key);
}
