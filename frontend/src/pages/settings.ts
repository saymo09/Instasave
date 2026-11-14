import { h } from "../lib/dom";
import { icon } from "../lib/icons";
import { fetchHealth } from "../lib/api";
import { clearHistory } from "../lib/db";
import { getSettings, resetSettings, updateSettings, type Theme } from "../lib/settings";
import { clearFinished, getDownloads, removeDownload } from "../lib/downloads";
import { resetView } from "../lib/process";
import { confirmDialog } from "../components/modal";
import { toast } from "../components/toast";
import { canInstall, promptInstall } from "../lib/install";

declare const __APP_VERSION__: string;

export function mount(root: HTMLElement): () => void {
  const s = getSettings();
  const themes: [Theme, string][] = [["auto", "Automático"], ["dark", "Escuro"], ["light", "Claro"]];
  const themeGroup = h("div", { class: "segmented", role: "radiogroup", "aria-label": "Tema" }, ...themes.map(([v, label]) => {
    const id = `theme-${v}`;
    const r = h("input", { type: "radio", name: "theme", id, value: v }) as HTMLInputElement;
    r.checked = s.theme === v;
    r.addEventListener("change", () => updateSettings({ theme: v }));
    return h("label", { for: id, class: "seg" }, r, h("span", {}, label));
  }));

  const hist = h("input", { type: "checkbox", id: "save-history", role: "switch" }) as HTMLInputElement;
  hist.checked = s.saveHistory;
  hist.addEventListener("change", () => { updateSettings({ saveHistory: hist.checked }); toast(hist.checked ? "Histórico ativado." : "Histórico desativado. Itens já salvos permanecem até você limpá-los.", "info"); });

  const serverInfo = h("p", { class: "muted small" }, "Servidor: verificando…");
  void fetchHealth().then((hl) => {
    serverInfo.textContent = hl
      ? `Servidor ${hl.version} · extração: ${hl.providers.some((p) => p.available) ? hl.providers.filter((p) => p.available).map((p) => p.name).join(", ") : "nenhum mecanismo configurado"}`
      : "Servidor: indisponível no momento.";
  });

  const installBtn = h("button", { class: "btn btn-secondary", type: "button", onclick: async () => { if (!(await promptInstall())) toast("Instalação não iniciada.", "info"); } }, icon("download", 18), "Instalar app");
  if (!canInstall()) installBtn.hidden = true;

  const wipe = h("button", { class: "btn btn-danger-ghost", type: "button" }, icon("trash", 18), "Apagar todos os dados locais");
  wipe.addEventListener("click", async () => {
    if (!(await confirmDialog("Apagar todos os dados locais?", "Remove histórico, preferências e a lista de downloads deste aparelho.", "Apagar tudo"))) return;
    await clearHistory();
    resetSettings();
    getDownloads().slice().forEach((d) => removeDownload(d.id));
    clearFinished();
    resetView();
    hist.checked = true;
    (document.getElementById("theme-auto") as HTMLInputElement | null)?.click();
    toast("Dados locais apagados.");
  });
  const clearH = h("button", { class: "btn btn-danger-ghost", type: "button" }, icon("trash", 18), "Limpar histórico");
  clearH.addEventListener("click", async () => { if (await confirmDialog("Limpar histórico?", "Todos os links salvos serão removidos.", "Limpar")) { await clearHistory(); toast("Histórico limpo."); } });

  root.append(
    h("h1", { tabindex: -1, id: "page-title" }, "Configurações"),
    h("section", { class: "card stack" }, h("h2", {}, "Aparência"), themeGroup),
    h("section", { class: "card stack" }, h("h2", {}, "Privacidade e dados"),
      h("label", { class: "switch-row", for: "save-history" }, h("span", {}, h("strong", {}, "Salvar histórico"), h("small", { class: "muted block" }, "Guarda links processados somente neste aparelho.")), hist),
      h("div", { class: "row wrap" }, clearH, wipe),
      h("ul", { class: "plain" },
        h("li", {}, "O histórico e as preferências ficam no seu aparelho; nada é enviado a terceiros."),
        h("li", {}, "Sem anúncios, rastreadores ou telemetria."),
        h("li", {}, "O InstaSave nunca pede login, senha ou cookies do Instagram."),
        h("li", {}, "Arquivos passam temporariamente pelo servidor para serem entregues e são apagados em seguida."))),
    h("section", { class: "card stack" }, h("h2", {}, "Instalação"), installBtn,
      h("p", { class: "muted small" }, "No Android (Chrome): menu ⋮ → “Instalar app” ou “Adicionar à tela inicial”.")),
    h("section", { class: "card stack" }, h("h2", {}, "Ajuda e solução de problemas"),
      h("details", {}, h("summary", {}, "O link foi recusado"), h("p", { class: "muted" }, "Use o endereço completo da publicação (instagram.com/p/…, /reel/… ou /tv/…). Links curtos de compartilhamento, Stories e perfis não são suportados.")),
      h("details", {}, h("summary", {}, "“Não foi possível obter esta publicação”"), h("p", { class: "muted" }, "A publicação pode ser privada, ter sido removida, exigir login ou o Instagram pode limitar acessos automatizados. O InstaSave não contorna essas proteções. Abra a publicação original ou cole a legenda manualmente.")),
      h("details", {}, h("summary", {}, "O download não aparece"), h("p", { class: "muted" }, "No Android, procure em Downloads do navegador. Se falhar, abra a aba Downloads e toque em “Tentar novamente”. Links de mídia expiram em cerca de 30 minutos: reprocesse o link.")),
      h("details", {}, h("summary", {}, "Sem internet"), h("p", { class: "muted" }, "O app abre offline, mas processar e baixar exigem conexão com o servidor.")),
      h("details", {}, h("summary", {}, "Uso responsável"), h("p", { class: "muted" }, "Baixe ou compartilhe apenas conteúdo que você tem direito ou autorização para usar e respeite as regras do Instagram e os direitos autorais."))),
    h("section", { class: "card stack" }, h("h2", {}, "Sobre"), h("p", {}, `InstaSave v${__APP_VERSION__}`), serverInfo,
      h("p", { class: "muted small" }, "Ferramenta pessoal independente. Não é um produto oficial nem afiliado ao Instagram ou à Meta.")),
  );
  return () => {};
}
