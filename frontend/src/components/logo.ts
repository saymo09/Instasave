export function logo(size = 40): HTMLElement {
  const s = document.createElement("span");
  s.className = "logo-mark";
  s.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8B5CF6"/><stop offset="1" stop-color="#EC4899"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="url(#lg)"/><path d="M32 14v24M21 29l11 11 11-11" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M17 48h30" stroke="#fff" stroke-width="5" stroke-linecap="round"/></svg>`;
  return s;
}
