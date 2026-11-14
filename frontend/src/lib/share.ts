import { toast } from "../components/toast";

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* tenta o fallback */
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
  document.body.append(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}

export async function readClipboard(): Promise<string | null> {
  try {
    return (await navigator.clipboard?.readText()) ?? null;
  } catch {
    return null;
  }
}

/** Compartilha arquivo (Web Share API nível 2) → senão link → senão copia o link. */
export async function shareFile(blob: Blob, filename: string, fallbackUrl?: string): Promise<void> {
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "InstaSave" });
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) toast("Não foi possível compartilhar o arquivo.", "error");
    }
    return;
  }
  if (fallbackUrl) return shareLink(fallbackUrl);
  toast("Este navegador não compartilha arquivos. Use o botão de baixar.", "info");
}

export async function shareLink(url: string): Promise<void> {
  if (navigator.share) {
    try {
      await navigator.share({ url });
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) toast("Não foi possível compartilhar.", "error");
    }
    return;
  }
  toast((await copyText(url)) ? "Compartilhamento indisponível aqui — link copiado." : "Não foi possível copiar o link.", "info");
}
