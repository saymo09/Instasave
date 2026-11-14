import { resolveUrl } from "./api";
import { putHistory } from "./db";
import { checkInstagramUrl } from "./url";
import { ApiError, type ResolveResult } from "./types";
import { getSettings } from "./settings";

export type Phase = "idle" | "validating" | "processing" | "available" | "partial" | "unavailable" | "error";

export interface ViewState {
  phase: Phase;
  url: string;
  result?: ResolveResult;
  error?: string;
}

let state: ViewState = { phase: "idle", url: "" };
const listeners = new Set<() => void>();
let controller: AbortController | null = null;

export const getView = (): ViewState => state;
export const subscribeView = (fn: () => void): (() => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
function set(s: ViewState): void {
  state = s;
  listeners.forEach((l) => l());
}

export function resetView(): void {
  controller?.abort();
  set({ phase: "idle", url: "" });
}

export async function processUrl(raw: string): Promise<void> {
  controller?.abort();
  set({ phase: "validating", url: raw });
  const check = checkInstagramUrl(raw);
  if (!check.ok) return set({ phase: "error", url: raw, error: check.message });
  if (!navigator.onLine) return set({ phase: "error", url: raw, error: "Sem conexão. O processamento precisa de internet." });
  const ctl = (controller = new AbortController());
  set({ phase: "processing", url: check.url });
  try {
    const result = await resolveUrl(check.url, ctl.signal);
    if (ctl.signal.aborted) return;
    set({ phase: result.status, url: check.url, result });
    await record(check.url, result.shortcode, result.post_type, result.status, result.media_items.length, result.caption !== null);
  } catch (e) {
    if (ctl.signal.aborted) return;
    const msg = e instanceof ApiError ? e.message : "Ocorreu um erro inesperado. Tente novamente.";
    set({ phase: "error", url: check.url, error: msg });
    await record(check.url, check.shortcode, check.kind, "error", null, null);
  }
}

async function record(url: string, id: string, postType: string, status: "available" | "partial" | "unavailable" | "error", mediaCount: number | null, hasCaption: boolean | null): Promise<void> {
  if (!getSettings().saveHistory) return;
  await putHistory({ id, url, postType, status, mediaCount, hasCaption, createdAt: Date.now() });
}
