import { h, clear } from "../lib/dom";
import { icon } from "../lib/icons";
import { clearHistory, deleteHistory, isHistoryInMemory, listHistory, type HistoryEntry } from "../lib/db";
import { copyText } from "../lib/share";
import { processUrl } from "../lib/process";
import { getSettings } from "../lib/settings";
import { confirmDialog } from "../components/modal";
import { toast } from "../components/toast";

const TYPE: Record<string, string> = { post: "Publicação", image: "Imagem", video: "Vídeo", reel: "Reel", carousel: "Carrossel", tv: "Vídeo" };
const STATUS: Record<HistoryEntry["status"], string> = { available: "Disponível", partial: "Parcial", unavailable: "Indisponível", error: "Erro" };
const fmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

export function mount(root: HTMLElement): () => void {
  const list = h("div", { class: "stack" });
  const clearBtn = h("button", { class: "btn btn-danger-ghost", type: "button" }, icon("trash", 18), "Limpar histórico") as HTMLButtonElement;
  let alive = true;

  const draw = async (): Promise<void> => {
    const items = await listHistory();
    if (!alive) return;
    clear(list);
    clearBtn.disabled = items.length === 0;
    if (!items.length) {
      list.append(h("div", { class: "card empty" }, icon("history", 32), h("h2", {}, "Nenhum link processado"),
        h("p", { class: "muted" }, getSettings().saveHistory ? "Os links que você processar aparecem aqui, somente neste aparelho." : "O histórico está desativado em Configurações.")));
      return;
    }
    for (const e of items) {
      list.append(h("article", { class: "card item" },
        h("div", { class: "row between wrap" },
          h("div", { class: "row wrap" }, h("span", { class: "badge" }, TYPE[e.postType] ?? "Publicação"), h("span", { class: `badge badge-${e.status}` }, STATUS[e.status])),
          h("time", { class: "muted small", datetime: new Date(e.createdAt).toISOString() }, fmt.format(e.createdAt))),
        h("p", { class: "url" }, e.url),
        h("p", { class: "muted small" }, e.status === "error" ? "Falha no processamento" : e.mediaCount === null ? "" : `${e.mediaCount} mídia(s) · legenda ${e.hasCaption ? "obtida" : "não obtida"}`),
        h("div", { class: "row wrap" },
          h("button", { class: "btn btn-secondary", type: "button", onclick: () => { location.hash = "#/"; void processUrl(e.url); } }, icon("retry", 18), "Reprocessar"),
          h("button", { class: "btn btn-ghost", type: "button", "aria-label": "Copiar link", onclick: async () => toast((await copyText(e.url)) ? "Link copiado." : "Não foi possível copiar.", "success") }, icon("copy", 18), "Copiar link"),
          h("button", { class: "btn btn-danger-ghost", type: "button", "aria-label": "Remover item do histórico", onclick: async () => { await deleteHistory(e.id); await draw(); toast("Item removido."); } }, icon("trash", 18), "Remover"))));
    }
  };

  clearBtn.addEventListener("click", async () => {
    if (await confirmDialog("Limpar histórico?", "Todos os links salvos neste aparelho serão removidos. Esta ação não pode ser desfeita.", "Limpar tudo")) {
      await clearHistory(); await draw(); toast("Histórico limpo.");
    }
  });
  root.append(h("div", { class: "row between wrap" }, h("h1", { tabindex: -1, id: "page-title" }, "Histórico"), clearBtn),
    isHistoryInMemory() ? h("div", { class: "notice notice-info" }, icon("info", 20), h("p", {}, "O armazenamento local está bloqueado neste navegador. O histórico vale só até fechar o app.")) : "",
    list);
  void draw();
  return () => { alive = false; };
}
