interface BIPEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
let deferred: BIPEvent | null = null;

export function captureInstallPrompt(): void {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e as BIPEvent; });
  window.addEventListener("appinstalled", () => { deferred = null; });
}
export const canInstall = (): boolean => deferred !== null;
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  await deferred.prompt();
  const r = await deferred.userChoice;
  deferred = null;
  return r.outcome === "accepted";
}
