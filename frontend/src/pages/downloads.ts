import { h, clear, formatBytes } from "../lib/dom";
import { icon } from "../lib/icons";
import { cancelDownload, clearFinished, getDownloads, removeDownload, retryDownload, saveBlob, subscribeDownloads, type DlState, type DownloadRecord } from "../lib/downloads";
import { shareFile } from "../lib/share";

const LABEL: Record<DlState, string> = {
  waiting: "Aguardando", preparing: "Preparando arquivo", downloading: "Baixando", done: "Concluído", failed: "Falhou", canceled: "Cancelado",
};

function row(r: DownloadRecord): HTMLElement {
  const pct = r.total ? Math.min(100, Math.round((r.loaded / r.total) * 100)) : null;
  const busy = r.state === "waiting" || r.state === "preparing" || r.state === "downloading";
  return h("article", { class: `card item dl dl-${r.state}`, "data-id": r.id },
    h("div", { class: "row between wrap" }, h("strong", { class: "wrap-text" }, r.label), h("span", { class: `badge badge-dl-${r.state}` }, LABEL[r.state])),
    r.filename !== r.fallbackName || r.state === "done" ? h("p", { class: "muted small wrap-text" }, r.filename) : null,
    busy && h("div", { class: `progress${pct === null ? " indeterminate" : ""}`, role: "progressbar", "aria-label": `Progresso de ${r.label}`, "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": pct ?? undefined },
      h("span", { style: pct === null ? "" : `width:${pct}%` })),
    r.state === "downloading" && h("p", { class: "muted small" }, r.total ? `${formatBytes(r.loaded)} de ${formatBytes(r.total)} (${pct}%)` : formatBytes(r.loaded)),
    r.error && h("p", { class: "error-text", role: "alert" }, r.error),
    h("div", { class: "row wrap" },
      busy && h("button", { class: "btn btn-ghost", type: "button", onclick: () => cancelDownload(r.id) }, icon("x", 18), "Cancelar"),
      (r.state === "failed" || r.state === "canceled") && h("button", { class: "btn btn-secondary", type: "button", onclick: () => retryDownload(r.id) }, icon("retry", 18), "Tentar novamente"),
      r.state === "done" && r.blob && h("button", { class: "btn btn-secondary", type: "button", onclick: () => saveBlob(r.blob!, r.filename) }, icon("download", 18), "Salvar novamente"),
      r.state === "done" && r.blob && h("button", { class: "btn btn-ghost", type: "button", onclick: () => void shareFile(r.blob!, r.filename) }, icon("share", 18), "Compartilhar"),
      !busy && h("button", { class: "btn btn-danger-ghost", type: "button", "aria-label": `Remover ${r.label} da lista`, onclick: () => removeDownload(r.id) }, icon("trash", 18), "Remover")));
}

export function mount(root: HTMLElement): () => void {
  const list = h("div", { class: "stack" });
  const clearBtn = h("button", { class: "btn btn-ghost", type: "button", onclick: () => clearFinished() }, "Limpar finalizados") as HTMLButtonElement;
  const draw = (): void => {
    const all = getDownloads();
    clear(list);
    clearBtn.disabled = !all.some((r) => r.state === "done" || r.state === "failed" || r.state === "canceled");
    if (!all.length) {
      list.append(h("div", { class: "card empty" }, icon("download", 32), h("h2", {}, "Nenhum download nesta sessão"),
        h("p", { class: "muted" }, "Quando você baixar uma mídia, o andamento aparece aqui. No Android, os arquivos vão para a pasta Downloads do navegador.")));
      return;
    }
    all.forEach((r) => list.append(row(r)));
  };
  draw();
  const off = subscribeDownloads(draw);
  root.append(h("div", { class: "row between wrap" }, h("h1", { tabindex: -1, id: "page-title" }, "Downloads"), clearBtn), list,
    h("p", { class: "muted small" }, "A lista vale apenas para esta sessão do app; os arquivos baixados ficam no seu aparelho."));
  return off;
}
