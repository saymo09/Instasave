import "./styles.css";
import { h, clear } from "./lib/dom";
import { icon } from "./lib/icons";
import { applyTheme } from "./lib/settings";
import { activeDownloads, subscribeDownloads } from "./lib/downloads";
import { captureInstallPrompt } from "./lib/install";
import { logo } from "./components/logo";
import * as home from "./pages/home";
import * as history from "./pages/history";
import * as downloads from "./pages/downloads";
import * as settings from "./pages/settings";

interface Route { path: string; label: string; icon: string; mount: (el: HTMLElement) => () => void }
const routes: Route[] = [
  { path: "#/", label: "Início", icon: "home", mount: home.mount },
  { path: "#/historico", label: "Histórico", icon: "history", mount: history.mount },
  { path: "#/downloads", label: "Downloads", icon: "download", mount: downloads.mount },
  { path: "#/config", label: "Config.", icon: "settings", mount: settings.mount },
];

applyTheme();
captureInstallPrompt();
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);

const view = h("main", { id: "view", class: "view" });
const offline = h("div", { class: "offline-banner", role: "status", hidden: true }, icon("cloudoff", 18), "Você está offline. Processar e baixar exigem conexão.");
const badge = h("span", { class: "nav-badge", hidden: true, "aria-label": "downloads ativos" });
const links = routes.map((r) => {
  const a = h("a", { class: "nav-item", href: r.path }, icon(r.icon, 22), h("span", {}, r.label));
  if (r.path === "#/downloads") a.append(badge);
  return a;
});
document.getElementById("app")!.append(
  h("a", { class: "skip", href: "#view" }, "Pular para o conteúdo"),
  h("header", { class: "topbar" }, logo(28), h("span", { class: "brand" }, "InstaSave")),
  offline, view,
  h("nav", { class: "bottom-nav", "aria-label": "Principal" }, ...links),
);

let cleanup: (() => void) | null = null;
function render(): void {
  const current = routes.find((r) => r.path === (location.hash || "#/")) ?? routes[0]!;
  cleanup?.();
  clear(view);
  view.classList.remove("enter");
  void view.offsetWidth;
  view.classList.add("enter");
  cleanup = current.mount(view);
  links.forEach((a, i) => { if (routes[i] === current) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  document.title = `${current.label === "Início" ? "" : current.label + " · "}InstaSave`;
  window.scrollTo(0, 0);
  (document.getElementById("page-title") as HTMLElement | null)?.focus({ preventScroll: true });
}
window.addEventListener("hashchange", render);
render();

const updateBadge = (): void => { const n = activeDownloads(); badge.hidden = n === 0; badge.textContent = String(n); };
subscribeDownloads(updateBadge);
const net = (): void => { offline.hidden = navigator.onLine; };
window.addEventListener("online", net);
window.addEventListener("offline", net);
net();

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
  window.addEventListener("load", () => { navigator.serviceWorker.register("/sw.js").catch(() => { /* PWA opcional */ }); });
}
