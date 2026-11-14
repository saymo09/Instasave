export type Theme = "auto" | "light" | "dark";
export interface Settings {
  theme: Theme;
  saveHistory: boolean;
}
const KEY = "instasave:settings:v1";
const DEFAULTS: Settings = { theme: "auto", saveHistory: true };
let current: Settings = load();
const listeners = new Set<() => void>();

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Settings>;
      return {
        theme: p.theme === "light" || p.theme === "dark" ? p.theme : "auto",
        saveHistory: p.saveHistory !== false,
      };
    }
  } catch {
    /* storage indisponível */
  }
  return { ...DEFAULTS };
}

export const getSettings = (): Settings => current;

export function updateSettings(patch: Partial<Settings>): void {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* mantém em memória */
  }
  applyTheme();
  listeners.forEach((l) => l());
}

export function subscribeSettings(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function resetSettings(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  current = { ...DEFAULTS };
  applyTheme();
  listeners.forEach((l) => l());
}

export function applyTheme(): void {
  const root = document.documentElement;
  if (current.theme === "auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", current.theme);
  const dark = current.theme === "dark" || (current.theme === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#09090D" : "#F7F7FB");
}
