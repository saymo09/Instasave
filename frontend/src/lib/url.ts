/** Validação no cliente (UX). O servidor revalida tudo — esta é só a primeira linha. */
export type UrlCheck =
  | { ok: true; url: string; kind: "post" | "reel" | "tv"; shortcode: string }
  | { ok: false; message: string };

const PATH = /^\/(?:([A-Za-z0-9._]{1,30})\/)?(p|reel|reels|tv)\/([A-Za-z0-9_-]{5,40})\/?$/;
const RESERVED = new Set(["share", "stories", "explore", "accounts", "direct"]);

export function checkInstagramUrl(raw: string): UrlCheck {
  const text = (raw ?? "").trim();
  if (!text) return { ok: false, message: "Cole o link de uma publicação do Instagram." };
  if (text.length > 2048 || /\s/.test(text)) return { ok: false, message: "O texto colado não parece ser um link único." };
  if (!text.includes("://")) return { ok: false, message: "O link precisa começar com https://" };
  let u: URL;
  try {
    u = new URL(text);
  } catch {
    return { ok: false, message: "O link está malformado." };
  }
  if (u.protocol !== "https:") return { ok: false, message: "Use um link https:// do Instagram." };
  if (u.username || u.password || text.split("/")[2]?.includes("@")) return { ok: false, message: "Links com credenciais não são aceitos." };
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (host !== "instagram.com" && host !== "www.instagram.com")
    return { ok: false, message: "Este link não é do Instagram. Só aceitamos instagram.com." };
  if (u.port && u.port !== "443") return { ok: false, message: "Portas personalizadas não são aceitas." };
  const m = PATH.exec(u.pathname.replace(/\/{2,}/g, "/"));
  if (!m || RESERVED.has((m[1] ?? "").toLowerCase())) {
    const p = u.pathname.toLowerCase();
    if (p.startsWith("/stories")) return { ok: false, message: "Stories não são suportados." };
    if (p.startsWith("/share")) return { ok: false, message: "Links curtos de compartilhamento não são suportados. Abra o link, copie o endereço completo da publicação e cole aqui." };
    return { ok: false, message: "Tipo de link não suportado. Use links de publicação (/p/), Reel (/reel/) ou vídeo (/tv/)." };
  }
  const kind = m[2] === "p" ? "post" : m[2] === "tv" ? "tv" : "reel";
  const seg = kind === "post" ? "p" : kind;
  return { ok: true, kind, shortcode: m[3]!, url: `https://www.instagram.com/${seg}/${m[3]}/` };
}
