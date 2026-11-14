import { h } from "../lib/dom";

let region: HTMLElement | null = null;

export function toast(message: string, tone: "success" | "error" | "info" = "success"): void {
  region ??= document.getElementById("toasts");
  if (!region) return;
  const el = h("div", { class: `toast toast-${tone}` }, message);
  region.append(el);
  setTimeout(() => el.remove(), 3500);
}
