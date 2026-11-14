/** Histórico local em IndexedDB (com fallback em memória se o armazenamento estiver bloqueado). */
export interface HistoryEntry {
  id: string; // shortcode
  url: string;
  postType: string;
  status: "available" | "partial" | "unavailable" | "error";
  mediaCount: number | null;
  hasCaption: boolean | null;
  createdAt: number;
}

const DB = "instasave";
const STORE = "history";
let memory: Map<string, HistoryEntry> | null = null;
let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("no idb"));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(r.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

async function guard<T>(idb: () => Promise<T>, mem: (m: Map<string, HistoryEntry>) => T): Promise<T> {
  if (!memory) {
    try {
      return await idb();
    } catch {
      memory = new Map();
    }
  }
  return mem(memory);
}

export const isHistoryInMemory = (): boolean => memory !== null;

export async function listHistory(): Promise<HistoryEntry[]> {
  const all = await guard(() => tx<HistoryEntry[]>("readonly", (s) => s.getAll()), (m) => [...m.values()]);
  return all.sort((a, b) => b.createdAt - a.createdAt);
}
export const putHistory = (e: HistoryEntry): Promise<void> =>
  guard(async () => void (await tx("readwrite", (s) => s.put(e))), (m) => void m.set(e.id, e));
export const deleteHistory = (id: string): Promise<void> =>
  guard(async () => void (await tx("readwrite", (s) => s.delete(id))), (m) => void m.delete(id));
export const clearHistory = (): Promise<void> =>
  guard(async () => void (await tx("readwrite", (s) => s.clear())), (m) => m.clear());
