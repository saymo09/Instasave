import { h, formatDuration, type Child } from "../lib/dom";
import { icon } from "../lib/icons";
import { mediaUrl, zipUrl } from "../lib/api";
import { startDownload } from "../lib/downloads";
import { copyText, shareFile, shareLink } from "../lib/share";
import { toast } from "./toast";
import type { MediaItem, ResolveResult } from "../lib/types";

const TYPE_LABEL: Record<string, string> = {
  post: "Publicação", image: "Imagem", video: "Vídeo", reel: "Reel", carousel: "Carrossel", tv: "Vídeo",
};
const STATUS_LABEL = { available: "Disponível", partial: "Parcial", unavailable: "Indisponível" } as const;

export function captionBox(text: string, opts: { title?: string } = {}): HTMLElement {
  const btn = h("button", { class: "btn btn-secondary", type: "button" }, icon("copy", 18), "Copiar legenda");
  btn.addEventListener("click", async () => {
    const ok = await copyText(text);
    toast(ok ? "Legenda copiada." : "Não foi possível copiar. Selecione o texto e copie manualmente.", ok ? "success" : "error");
    if (ok) {
      btn.replaceChildren(icon("check", 18), "Copiado");
      setTimeout(() => btn.replaceChildren(icon("copy", 18), "Copiar legenda"), 2000);
    }
  });
  return h("section", { class: "card caption" },
    h("h3", {}, opts.title ?? "Legenda"),
    h("div", { class: "caption-text", tabindex: 0, role: "region", "aria-label": "Texto da legenda" }, text),
    h("div", { class: "row" }, btn, h("span", { class: "muted small" }, `${[...text].length} caracteres`)));
}

function thumbFor(item: MediaItem): string | null {
  return item.thumbnail_token ? mediaUrl(item.thumbnail_token) : null;
}

function preview(item: MediaItem, label: string): HTMLElement {
  const box = h("div", { class: "preview", "data-kind": item.kind });
  if (item.kind === "image") {
    const img = h("img", { src: mediaUrl(item.token), alt: label, loading: "lazy", decoding: "async" });
    img.addEventListener("error", () => box.replaceChildren(h("p", { class: "muted pad" }, "Não foi possível carregar a prévia. O download ainda pode funcionar.")));
    box.append(img);
  } else {
    const thumb = thumbFor(item);
    const play = h("button", { class: "play", type: "button", "aria-label": `Carregar e reproduzir prévia: ${label}` },
      thumb ? h("img", { src: thumb, alt: "", loading: "lazy" }) : null,
      h("span", { class: "play-icon" }, icon("play", 28)),
      h("span", { class: "play-hint" }, "Toque para carregar a prévia"));
    play.addEventListener("click", () => {
      const v = h("video", { controls: true, playsinline: true, autoplay: true, src: mediaUrl(item.token), "aria-label": label });
      v.addEventListener("error", () => box.replaceChildren(h("p", { class: "muted pad" }, "Não foi possível carregar a prévia do vídeo. Tente baixar o arquivo.")));
      box.replaceChildren(v);
    });
    box.append(play);
  }
  return box;
}

function downloadItem(r: ResolveResult, item: MediaItem): void {
  const label = `${TYPE_LABEL[item.kind] ?? item.kind} ${item.index}${r.media_items.length > 1 ? ` de ${r.media_items.length}` : ""} · ${r.shortcode}`;
  startDownload(label, mediaUrl(item.token, true), item.filename);
}

async function shareItem(r: ResolveResult, item: MediaItem): Promise<void> {
  if (typeof navigator.canShare !== "function") return shareLink(r.source_url);
  toast("Preparando arquivo para compartilhar…", "info");
  try {
    const res = await fetch(mediaUrl(item.token, true));
    if (!res.ok) throw new Error("fail");
    await shareFile(await res.blob(), item.filename, r.source_url);
  } catch {
    toast("Não foi possível preparar o arquivo para compartilhar.", "error");
  }
}

function actionsFor(r: ResolveResult, item: MediaItem): HTMLElement {
  return h("div", { class: "row wrap" },
    h("button", { class: "btn btn-primary", type: "button", onclick: () => { downloadItem(r, item); toast("Download iniciado. Acompanhe em Downloads.", "info"); } },
      icon("download", 18), item.kind === "video" ? "Baixar vídeo (MP4)" : "Baixar imagem"),
    h("button", { class: "btn btn-secondary", type: "button", onclick: () => void shareItem(r, item) }, icon("share", 18), "Compartilhar"));
}

function gallery(r: ResolveResult): HTMLElement {
  const items = r.media_items;
  let idx = 0;
  const selected = new Set<number>();
  const root = h("section", { class: "card gallery", "aria-label": `Carrossel com ${items.length} mídias` });

  const render = (): void => {
    const item = items[idx]!;
    const label = `${TYPE_LABEL[item.kind]} ${item.index} de ${items.length}`;
    const go = (d: number): void => { idx = (idx + items.length + d) % items.length; render(); (root.querySelector(".viewer") as HTMLElement | null)?.focus(); };
    const viewer = h("div", { class: "viewer", tabindex: 0, "aria-label": `${label}. Use as setas para navegar.` },
      preview(item, label),
      items.length > 1 && h("button", { class: "nav nav-l", type: "button", "aria-label": "Mídia anterior", onclick: () => go(-1) }, icon("left", 22)),
      items.length > 1 && h("button", { class: "nav nav-r", type: "button", "aria-label": "Próxima mídia", onclick: () => go(1) }, icon("right", 22)),
      h("span", { class: "counter" }, `${item.index}/${items.length}`));
    viewer.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    });
    const strip = h("div", { class: "strip", role: "list" }, ...items.map((it, i) => {
      const t = thumbFor(it);
      const b = h("button", {
        class: `thumb${i === idx ? " active" : ""}${selected.has(it.index) ? " selected" : ""}`, type: "button", role: "listitem",
        "aria-label": `Mídia ${it.index} de ${items.length}, ${it.kind === "video" ? "vídeo" : "imagem"}${selected.has(it.index) ? ", selecionada" : ""}`,
        "aria-current": i === idx ? "true" : null,
        onclick: () => { idx = i; render(); },
      }, t ? h("img", { src: t, alt: "", loading: "lazy" }) : h("span", { class: "thumb-ph" }, icon(it.kind === "video" ? "video" : "image", 20)),
      it.kind === "video" && h("span", { class: "thumb-badge" }, icon("video", 12)));
      return b;
    }));
    const sel = h("input", { type: "checkbox", id: "sel-item" }) as HTMLInputElement;
    sel.checked = selected.has(item.index);
    sel.addEventListener("change", () => { sel.checked ? selected.add(item.index) : selected.delete(item.index); render(); });
    const all = h("button", { class: "btn btn-ghost small", type: "button", onclick: () => { if (selected.size === items.length) selected.clear(); else items.forEach((x) => selected.add(x.index)); render(); } },
      selected.size === items.length ? "Limpar seleção" : "Selecionar todos");
    const zipBtn = r.zip_token
      ? h("button", { class: "btn btn-primary", type: "button", onclick: () => { startDownload(`ZIP · ${items.length} itens · ${r.shortcode}`, zipUrl(r.zip_token!), `instasave-${r.shortcode}.zip`); toast("Preparando ZIP. Acompanhe em Downloads.", "info"); } }, icon("zip", 18), "Baixar tudo (ZIP)")
      : null;
    const dlSel = h("button", { class: "btn btn-secondary", type: "button", disabled: selected.size === 0, "aria-describedby": selected.size === 0 ? "sel-hint" : null,
      onclick: () => { items.filter((x) => selected.has(x.index)).forEach((x) => downloadItem(r, x)); toast(`${selected.size} download(s) iniciado(s).`, "info"); } },
      icon("download", 18), `Baixar selecionados (${selected.size})`);
    root.replaceChildren(
      h("div", { class: "row between" }, h("h3", {}, `Carrossel · ${items.length} mídias`), h("span", { class: "muted small" }, `${items.filter((x) => x.kind === "image").length} img · ${items.filter((x) => x.kind === "video").length} vídeo`)),
      viewer, strip,
      h("div", { class: "row wrap between" }, h("label", { class: "check", for: "sel-item" }, sel, `Selecionar item ${item.index}`), all),
      h("div", { class: "row wrap" }, h("button", { class: "btn btn-primary", type: "button", onclick: () => { downloadItem(r, item); toast("Download iniciado. Acompanhe em Downloads.", "info"); } }, icon("download", 18), `Baixar item ${item.index}`),
        h("button", { class: "btn btn-secondary", type: "button", onclick: () => void shareItem(r, item) }, icon("share", 18), "Compartilhar")),
      h("div", { class: "row wrap" }, dlSel, zipBtn),
      selected.size === 0 ? h("p", { id: "sel-hint", class: "muted small" }, "Selecione itens para baixar vários de uma vez.") : "",
    );
  };
  render();
  return root;
}

function embedBlock(r: ResolveResult): HTMLElement {
  const slot = h("div", { class: "embed-slot" });
  const btn = h("button", { class: "btn btn-secondary", type: "button" }, icon("image", 18), "Ver prévia oficial do Instagram");
  btn.addEventListener("click", () => {
    slot.replaceChildren(
      h("p", { class: "muted small" }, "Esta prévia é carregada diretamente do Instagram (ele pode registrar o acesso)."),
      h("iframe", { src: r.embed_url, title: "Prévia oficial do Instagram", loading: "lazy", sandbox: "allow-scripts allow-same-origin allow-popups", referrerpolicy: "no-referrer", class: "embed" }));
  });
  return h("div", {}, btn, slot);
}

export function renderResult(r: ResolveResult): HTMLElement {
  const typeLabel = TYPE_LABEL[r.post_type] ?? "Publicação";
  const header = h("header", { class: "card result-head" },
    h("div", { class: "row wrap" },
      h("span", { class: "badge" }, icon(r.post_type === "carousel" ? "layers" : r.post_type === "image" ? "image" : "video", 14), typeLabel),
      h("span", { class: `badge badge-${r.status}` }, STATUS_LABEL[r.status])),
    r.author && h("p", { class: "author" }, `@${r.author.replace(/^@/, "")}`),
    r.duration !== null && h("p", { class: "muted small" }, `Duração: ${formatDuration(r.duration)}`),
    r.provider && h("p", { class: "muted small" }, `Fonte: ${r.provider}`));
  const out: Child[] = [header];

  if (r.limitations.length) {
    out.push(h("div", { class: `notice notice-${r.status === "unavailable" ? "warn" : "info"}`, role: "note" },
      icon(r.status === "unavailable" ? "alert" : "info", 20),
      h("div", {}, h("strong", {}, r.status === "unavailable" ? "Não foi possível obter esta publicação" : "Resultado parcial"),
        h("ul", {}, ...r.limitations.map((l) => h("li", {}, l))))));
  }

  if (r.media_items.length === 0) {
    out.push(h("section", { class: "card" },
      h("p", {}, "Nenhuma mídia foi obtida. Você ainda pode abrir a publicação original ou colar a legenda manualmente na tela inicial."),
      h("div", { class: "row wrap" },
        h("a", { class: "btn btn-primary", href: r.source_url, target: "_blank", rel: "noopener noreferrer" }, icon("external", 18), "Abrir publicação original"),
        h("button", { class: "btn btn-ghost", type: "button", onclick: () => void shareLink(r.source_url) }, icon("share", 18), "Compartilhar link")),
      embedBlock(r)));
  } else if (r.media_items.length === 1) {
    const it = r.media_items[0]!;
    out.push(h("section", { class: "card" }, preview(it, `${typeLabel} ${r.shortcode}`), actionsFor(r, it)));
  } else {
    out.push(gallery(r));
  }

  if (r.caption) out.push(captionBox(r.caption));
  else if (r.media_items.length) out.push(h("p", { class: "muted small" }, "A legenda não pôde ser obtida. Use a área de legenda manual abaixo, se quiser."));

  if (r.media_items.length) {
    out.push(h("div", { class: "row wrap" },
      h("a", { class: "btn btn-ghost", href: r.source_url, target: "_blank", rel: "noopener noreferrer" }, icon("external", 18), "Abrir original"),
      h("button", { class: "btn btn-ghost", type: "button", onclick: () => void shareLink(r.source_url) }, icon("share", 18), "Compartilhar link")));
  }
  return h("div", { class: "result stack" }, ...out);
}
