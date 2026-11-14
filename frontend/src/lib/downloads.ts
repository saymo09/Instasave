import { parseError, offlineError } from "./api";
import { ApiError } from "./types";

export type DlState = "waiting" | "preparing" | "downloading" | "done" | "failed" | "canceled";

export interface DownloadRecord {
  id: string;
  label: string;
  url: string;
  fallbackName: string;
  filename: string;
  state: DlState;
  loaded: number;
  total: number | null;
  error?: string;
  blob?: Blob;
  createdAt: number;
}

const MAX_CONCURRENT = 2;
const records: DownloadRecord[] = [];
const controllers = new Map<string, AbortController>();
const listeners = new Set<() => void>();
let seq = 0;

const emit = (): void => listeners.forEach((l) => l());
export const subscribeDownloads = (fn: () => void): (() => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
export const getDownloads = (): readonly DownloadRecord[] => records;
export const activeDownloads = (): number => records.filter((r) => r.state === "waiting" || r.state === "preparing" || r.state === "downloading").length;

export function startDownload(label: string, url: string, fallbackName: string): DownloadRecord {
  const rec: DownloadRecord = {
    id: `d${Date.now()}-${++seq}`, label, url, fallbackName, filename: fallbackName,
    state: "waiting", loaded: 0, total: null, createdAt: Date.now(),
  };
  records.unshift(rec);
  emit();
  pump();
  return rec;
}

export function retryDownload(id: string): void {
  const r = records.find((x) => x.id === id);
  if (!r || (r.state !== "failed" && r.state !== "canceled")) return;
  Object.assign(r, { state: "waiting", loaded: 0, total: null, error: undefined, blob: undefined });
  emit();
  pump();
}

export function cancelDownload(id: string): void {
  const r = records.find((x) => x.id === id);
  if (!r) return;
  controllers.get(id)?.abort();
  if (r.state === "waiting") {
    r.state = "canceled";
    emit();
  }
}

export function removeDownload(id: string): void {
  controllers.get(id)?.abort();
  const i = records.findIndex((x) => x.id === id);
  if (i >= 0) records.splice(i, 1);
  emit();
}

export function clearFinished(): void {
  for (let i = records.length - 1; i >= 0; i--) {
    const s = records[i]!.state;
    if (s === "done" || s === "failed" || s === "canceled") records.splice(i, 1);
  }
  emit();
}

function pump(): void {
  const running = records.filter((r) => r.state === "preparing" || r.state === "downloading").length;
  const next = [...records].reverse().find((r) => r.state === "waiting");
  if (next && running < MAX_CONCURRENT) {
    void run(next).finally(pump);
    pump();
  }
}

export function filenameFromDisposition(h: string | null): string | null {
  const m = /filename="([A-Za-z0-9._-]{1,100})"/.exec(h ?? "");
  return m ? m[1]! : null;
}

async function run(r: DownloadRecord): Promise<void> {
  const ctl = new AbortController();
  controllers.set(r.id, ctl);
  r.state = "preparing"; // o servidor baixa e valida o arquivo antes de responder
  emit();
  try {
    let res: Response;
    try {
      res = await fetch(r.url, { signal: ctl.signal });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") throw e;
      throw offlineError();
    }
    if (!res.ok) throw await parseError(res);
    r.filename = filenameFromDisposition(res.headers.get("content-disposition")) ?? r.fallbackName;
    const len = Number(res.headers.get("content-length"));
    r.total = Number.isFinite(len) && len > 0 ? len : null;
    r.state = "downloading";
    emit();
    const parts: BlobPart[] = [];
    if (res.body) {
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value);
        r.loaded += value.byteLength;
        emit();
      }
    } else {
      const b = await res.blob();
      parts.push(b);
      r.loaded = b.size;
    }
    if (r.loaded === 0) throw new ApiError("empty", "O arquivo recebido está vazio.");
    r.blob = new Blob(parts, { type: res.headers.get("content-type") ?? "application/octet-stream" });
    r.state = "done";
    emit();
    saveBlob(r.blob, r.filename);
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      r.state = "canceled";
    } else {
      r.state = "failed";
      r.error = e instanceof ApiError ? e.message : "Falha no download. Tente novamente.";
    }
    emit();
  } finally {
    controllers.delete(r.id);
  }
}

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
