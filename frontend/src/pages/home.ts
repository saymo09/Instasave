import { h, clear } from "../lib/dom";
import { icon } from "../lib/icons";
import { logo } from "../components/logo";
import { captionBox, renderResult } from "../components/result";
import { checkInstagramUrl } from "../lib/url";
import { getView, processUrl, resetView, subscribeView } from "../lib/process";
import { readClipboard } from "../lib/share";
import { toast } from "../components/toast";

export function mount(root: HTMLElement): () => void {
  const input = h("input", {
    id: "link", name: "link", type: "url", inputmode: "url", autocomplete: "off", autocapitalize: "off", spellcheck: "false",
    placeholder: "https://www.instagram.com/reel/…", "aria-describedby": "link-hint", class: "input",
  }) as HTMLInputElement;
  const hint = h("p", { id: "link-hint", class: "hint", "aria-live": "polite" });
  const submit = h("button", { class: "btn btn-primary btn-lg", type: "submit" }, icon("download", 20), "Processar link") as HTMLButtonElement;
  const status = h("div", { class: "status", "aria-live": "polite" });
  const area = h("div", { class: "results" });

  const updateHint = (): void => {
    const v = input.value.trim();
    hint.className = "hint";
    if (!v) { hint.textContent = "Cole um link de publicação, Reel ou vídeo do Instagram."; return; }
    const c = checkInstagramUrl(v);
    if (c.ok) { hint.textContent = `Link reconhecido: ${c.kind === "reel" ? "Reel" : c.kind === "tv" ? "vídeo" : "publicação"}.`; hint.classList.add("ok"); }
    else { hint.textContent = c.message; hint.classList.add("bad"); }
  };
  input.addEventListener("input", updateHint);

  const paste = h("button", { class: "btn btn-secondary", type: "button", "aria-label": "Colar link da área de transferência" }, icon("paste", 18), "Colar");
  paste.addEventListener("click", async () => {
    const t = await readClipboard();
    if (t === null) return toast("Não foi possível ler a área de transferência. Cole o link manualmente no campo.", "info");
    input.value = t.trim();
    updateHint();
    if (checkInstagramUrl(input.value).ok) void processUrl(input.value);
    else if (!input.value) toast("A área de transferência está vazia.", "info");
  });

  const form = h("form", { class: "card form", novalidate: true, autocomplete: "off" },
    h("label", { for: "link", class: "label" }, "Link da publicação"),
    h("div", { class: "input-row" }, input, paste), hint, submit);
  form.addEventListener("submit", (e) => { e.preventDefault(); void processUrl(input.value); });

  // legenda manual
  const manual = h("textarea", { id: "manual", class: "input textarea", rows: 5, placeholder: "Cole aqui uma legenda para copiá-la com emojis e quebras de linha preservados…", "aria-label": "Legenda manual" }) as HTMLTextAreaElement;
  const manualOut = h("div", {});
  const showManual = (): void => { manualOut.replaceChildren(manual.value.trim() ? captionBox(manual.value, { title: "Prévia da legenda" }) : ""); };
  manual.addEventListener("input", showManual);
  const details = h("details", { class: "card details" }, h("summary", {}, "Legenda manual (opcional)"),
    h("p", { class: "muted small" }, "Use quando a legenda não puder ser obtida automaticamente. O texto fica apenas no seu aparelho."), manual, manualOut);

  const draw = (): void => {
    const v = getView();
    clear(status); clear(area);
    submit.disabled = v.phase === "validating" || v.phase === "processing";
    switch (v.phase) {
      case "idle":
        area.append(h("div", { class: "card empty" }, icon("download", 32),
          h("h2", {}, "Pronto para começar"),
          h("p", { class: "muted" }, "Links aceitos: publicações (/p/), Reels (/reel/) e vídeos (/tv/) públicos do Instagram.")));
        break;
      case "validating":
      case "processing":
        status.append(h("div", { class: "card loading", role: "status" }, h("span", { class: "spinner", "aria-hidden": "true" }),
          h("div", {}, h("strong", {}, v.phase === "validating" ? "Validando link…" : "Processando publicação…"),
            h("p", { class: "muted small" }, "Consultando a publicação. Isso pode levar alguns segundos.")),
          h("button", { class: "btn btn-ghost", type: "button", onclick: () => resetView() }, "Cancelar")));
        area.append(h("div", { class: "card skeleton", "aria-hidden": "true" }, h("div", { class: "sk sk-media" }), h("div", { class: "sk sk-line" }), h("div", { class: "sk sk-line short" })));
        break;
      case "error":
        status.append(h("div", { class: "notice notice-error", role: "alert" }, icon("alert", 20),
          h("div", {}, h("strong", {}, "Não foi possível continuar"), h("p", {}, v.error ?? "Erro inesperado."),
            checkInstagramUrl(v.url).ok && h("button", { class: "btn btn-secondary", type: "button", onclick: () => void processUrl(v.url) }, icon("retry", 18), "Tentar novamente"))));
        break;
      default:
        if (v.result) area.append(renderResult(v.result));
    }
  };

  if (getView().phase !== "idle") input.value = getView().url;
  updateHint();
  draw();
  const off = subscribeView(() => { draw(); if (getView().phase !== "idle" && !input.value) input.value = getView().url; });

  root.append(
    h("section", { class: "hero" }, logo(56), h("div", {}, h("h1", { tabindex: -1, id: "page-title" }, "InstaSave"),
      h("p", { class: "muted" }, "Cole um link público do Instagram, veja o que está disponível e baixe ou copie a legenda."))),
    form, status, area, details,
    h("p", { class: "legal small muted" }, "Baixe ou compartilhe apenas conteúdo que você tem direito ou autorização para usar. InstaSave é independente e não é afiliado ao Instagram."),
  );
  return () => { off(); };
}
