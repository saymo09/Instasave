import { ApiError, type ResolveResult } from "./types";

async function parseError(res: Response): Promise<ApiError> {
  try {
    const j = (await res.json()) as { error?: { code?: string; message?: string } };
    if (j.error?.message) return new ApiError(j.error.code ?? "error", j.error.message, res.status);
  } catch {
    /* corpo não-JSON */
  }
  return new ApiError("error", "Ocorreu um erro inesperado. Tente novamente.", res.status);
}

export function offlineError(): ApiError {
  return new ApiError("network", "Sem conexão com o servidor. Verifique sua internet e tente novamente.");
}

export async function resolveUrl(url: string, signal?: AbortSignal): Promise<ResolveResult> {
  let res: Response;
  try {
    res = await fetch("/api/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw offlineError();
  }
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as ResolveResult;
}

export const mediaUrl = (token: string, download = false): string =>
  `/api/media/${encodeURIComponent(token)}${download ? "?download=1" : ""}`;
export const zipUrl = (token: string): string => `/api/zip/${encodeURIComponent(token)}`;

export async function fetchHealth(): Promise<{ version: string; providers: { name: string; available: boolean }[] } | null> {
  try {
    const r = await fetch("/api/health");
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

export { parseError };
