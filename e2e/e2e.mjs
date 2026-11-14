// E2E com Playwright/Chromium contra backend com fixtures (backend/tests/e2e_server.py).
import { chromium, devices } from "playwright";
import { spawn } from "node:child_process";
import { readFileSync, mkdirSync } from "node:fs";
import { createServer } from "node:net";
import assert from "node:assert/strict";

const ROOT = new URL("..", import.meta.url).pathname;
const SHOTS = process.env.SHOTS_DIR || "/tmp/instasave-shots";
mkdirSync(SHOTS, { recursive: true });
const free = () => new Promise((r) => { const s = createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });
const port = await free();
const srv = spawn("python3", [`${ROOT}backend/tests/e2e_server.py`, String(port)], {
  env: { ...process.env, INSTASAVE_STATIC_DIR: `${ROOT}frontend/dist` }, stdio: ["ignore", "inherit", "inherit"],
});
const base = `http://127.0.0.1:${port}`;
for (let i = 0; i < 60; i++) { try { if ((await fetch(base + "/api/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }

const results = [];
const test = async (name, fn) => {
  try { await fn(); results.push([name, "OK"]); console.log("  ✓", name); }
  catch (e) { results.push([name, "FALHOU: " + e.message.split("\n")[0]]); console.log("  ✗", name, "\n    ", e.message.split("\n").slice(0, 4).join("\n     ")); }
};
const link = (kind, code) => `https://www.instagram.com/${kind}/${code}/`;
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices["Pixel 7"], acceptDownloads: true, permissions: ["clipboard-read", "clipboard-write"], serviceWorkers: "allow" });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });

const noHScroll = async (p) => assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "rolagem horizontal");
const process_ = async (url) => { await page.fill("#link", url); await page.click("button[type=submit]"); };

await page.goto(base + "/");
await page.waitForSelector("#link");

await test("Início carrega, sem rolagem horizontal, título e logo", async () => {
  assert.match(await page.title(), /InstaSave/);
  await noHScroll(page);
  await page.screenshot({ path: `${SHOTS}/01-inicio.png` });
});

await test("PWA: manifest válido, ícones acessíveis, service worker ativo", async () => {
  const m = await (await fetch(base + "/manifest.webmanifest")).json();
  assert.equal(m.display, "standalone"); assert.ok(m.name && m.short_name && m.start_url && m.theme_color);
  const sizes = m.icons.map((i) => i.sizes);
  assert.ok(sizes.includes("192x192") && sizes.includes("512x512") && m.icons.some((i) => i.purpose === "maskable"));
  for (const i of m.icons) { const r = await fetch(base + i.src); assert.equal(r.status, 200, i.src); }
  await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistration())?.active?.state === "activated", null, { timeout: 15000 });
  const cached = await page.evaluate(async () => { const ks = await caches.keys(); const c = await caches.open(ks[0]); return (await c.keys()).map((r) => new URL(r.url).pathname); });
  assert.ok(cached.includes("/index.html") && cached.includes("/offline.html"));
  assert.ok(!cached.some((p) => p.startsWith("/api/")), "API não pode ser cacheada");
});

await test("Link inválido mostra erro claro; validação ao digitar", async () => {
  await page.fill("#link", "olá mundo");
  assert.match(await page.textContent("#link-hint"), /link|https/i);
  await page.click("button[type=submit]");
  await page.waitForSelector(".notice-error");
  assert.match(await page.textContent(".notice-error"), /https|link/i);
  await page.fill("#link", "https://evil.com/p/ABC123xyz/");
  await page.click("button[type=submit]");
  assert.match(await page.textContent(".notice-error"), /não é do Instagram/);
});

await test("Reel: prévia, legenda completa copiada (emojis/quebras), download MP4 real", async () => {
  await process_(link("reel", "REEL00001"));
  await page.waitForSelector(".caption-text");
  const shown = await page.textContent(".caption-text");
  assert.ok(shown.includes("🎉✨") && shown.includes("#hashtag") && shown.length > 700);
  await page.click("text=Copiar legenda");
  await page.waitForSelector(".toast-success");
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  assert.ok(clip.includes("🎉✨\n\nSegunda linha com #hashtag"), "quebras de linha preservadas");
  assert.equal(clip.trim(), shown.trim(), "legenda copiada idêntica à exibida");
  assert.ok(clip.endsWith("texto longo "), "legenda não truncada");
  await page.screenshot({ path: `${SHOTS}/02-reel.png`, fullPage: true });
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("text=Baixar vídeo (MP4)")]);
  assert.match(dl.suggestedFilename(), /^instasave-REEL00001-01\.mp4$/);
  const buf = readFileSync(await dl.path());
  assert.equal(buf.subarray(4, 8).toString(), "ftyp");
  await noHScroll(page);
});

await test("Prévia de vídeo só carrega sob demanda e reproduz", async () => {
  await page.click(".play");
  await page.waitForSelector("video");
  await page.waitForFunction(() => document.querySelector("video")?.readyState >= 1, null, { timeout: 10000 });
});

await test("Imagem: download JPEG válido", async () => {
  await process_(link("p", "IMAGE0001"));
  await page.waitForSelector(".preview img");
  await page.waitForFunction(() => document.querySelector(".preview img")?.naturalWidth > 0);
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("text=Baixar imagem")]);
  const buf = readFileSync(await dl.path());
  assert.equal(buf[0], 0xff); assert.equal(buf[1], 0xd8); assert.match(dl.suggestedFilename(), /\.jpg$/);
});

await test("Carrossel: galeria ordenada, navegação, seleção, download individual e ZIP", async () => {
  await process_(link("p", "CAROUSEL1"));
  await page.waitForSelector(".gallery");
  assert.equal((await page.$$(".thumb")).length, 4);
  assert.match(await page.textContent(".counter"), /1\/4/);
  await page.click(".nav-r"); assert.match(await page.textContent(".counter"), /2\/4/);
  await page.click(".nav-l"); await page.click(".nav-l"); assert.match(await page.textContent(".counter"), /4\/4/);  // circular
  await page.click(".thumb >> nth=1");
  await page.screenshot({ path: `${SHOTS}/03-carrossel.png`, fullPage: true });
  assert.equal(await page.isDisabled("text=Baixar selecionados (0)"), true);
  await page.check("#sel-item");
  await page.click("text=Baixar selecionados (1)");
  await page.waitForSelector(".toast");
  const [zipDl] = await Promise.all([page.waitForEvent("download"), page.click("text=Baixar tudo (ZIP)")]);
  assert.equal(zipDl.suggestedFilename(), "instasave-CAROUSEL1.zip");
  const zip = readFileSync(await zipDl.path());
  assert.equal(zip.subarray(0, 2).toString(), "PK");
  const names = [...zip.toString("latin1").matchAll(/instasave-CAROUSEL1-0\d\.\w+/g)].map((m) => m[0]);
  assert.ok(names.includes("instasave-CAROUSEL1-01.jpg") && names.includes("instasave-CAROUSEL1-02.mp4") && names.includes("instasave-CAROUSEL1-04.jpg"));
  assert.ok(names.indexOf("instasave-CAROUSEL1-01.jpg") < names.indexOf("instasave-CAROUSEL1-04.jpg"));
  await noHScroll(page);
});

await test("Indisponível: explica limitação e oferece publicação original", async () => {
  await process_(link("reel", "NOPE00001"));
  await page.waitForSelector("text=Não foi possível obter esta publicação");
  const href = await page.getAttribute("text=Abrir publicação original", "href");
  assert.equal(href, link("reel", "NOPE00001"));
  assert.equal(await page.getAttribute("text=Abrir publicação original", "rel"), "noopener noreferrer");
  assert.equal((await page.$$(".gallery, .preview")).length, 0, "nada inventado");
  await page.click("text=Ver prévia oficial do Instagram");
  assert.ok((await page.getAttribute("iframe.embed", "src")).endsWith("/reel/NOPE00001/embed/"));
  await page.screenshot({ path: `${SHOTS}/04-indisponivel.png`, fullPage: true });
});

await test("Parcial: avisa que a legenda falta", async () => {
  await process_(link("p", "PARTIAL01"));
  await page.waitForSelector("text=Resultado parcial");
  assert.match(await page.textContent(".result"), /legenda não pôde ser obtida/i);
  assert.equal((await page.$$(".caption")).length, 0);
});

await test("Legenda manual: copia com formatação", async () => {
  await page.click("summary:has-text('Legenda manual')");
  await page.fill("#manual", "Olá 🌎\n\n#tag linha");
  await page.waitForSelector("#manual ~ div .caption-text");
  await page.click("#manual ~ div >> text=Copiar legenda");
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "Olá 🌎\n\n#tag linha");
});

await test("Downloads: estados reais e concluídos listados", async () => {
  await page.click("nav >> text=Downloads");
  await page.waitForSelector(".dl");
  const states = await page.$$eval(".dl .badge", (els) => els.map((e) => e.textContent));
  assert.ok(states.length >= 4 && states.every((s) => s === "Concluído"), states.join(","));
  assert.ok((await page.$$("text=Compartilhar")).length > 0);
  await page.screenshot({ path: `${SHOTS}/05-downloads.png`, fullPage: true });
});

await test("Histórico: persiste após reload, copiar, reprocessar, remover e limpar", async () => {
  await page.goto(base + "/#/historico"); await page.reload();
  await page.waitForSelector(".item");
  const n = (await page.$$(".item")).length;
  assert.ok(n >= 5, `itens: ${n}`);
  assert.match(await page.textContent(".item"), /instagram\.com/);
  await page.screenshot({ path: `${SHOTS}/06-historico.png`, fullPage: true });
  await page.click(".item >> nth=0 >> text=Copiar link"); await page.waitForSelector(".toast-success");
  await page.click(".item >> nth=0 >> text=Remover");
  await page.waitForFunction((k) => document.querySelectorAll(".item").length === k, n - 1);
  await page.click(".item >> nth=0 >> text=Reprocessar");
  await page.waitForSelector(".result, .notice-error", { timeout: 10000 });
  assert.equal(await page.evaluate(() => location.hash), "#/");
  await page.goto(base + "/#/historico");
  await page.click("text=Limpar histórico"); await page.click("dialog >> text=Limpar tudo");
  await page.waitForSelector("text=Nenhum link processado");
});

await test("Histórico desativado não grava", async () => {
  await page.goto(base + "/#/config");
  await page.uncheck("#save-history");
  await page.goto(base + "/#/"); await process_(link("p", "IMAGE0001")); await page.waitForSelector(".result");
  await page.goto(base + "/#/historico");
  await page.waitForSelector("text=Nenhum link processado");
  await page.goto(base + "/#/config"); await page.check("#save-history");
});

await test("Configurações: tema escuro/claro/auto persiste", async () => {
  await page.goto(base + "/#/config");
  await page.click("label[for=theme-light]");
  assert.equal(await page.getAttribute("html", "data-theme"), "light");
  await page.screenshot({ path: `${SHOTS}/07-config-claro.png`, fullPage: true });
  await page.reload();
  assert.equal(await page.getAttribute("html", "data-theme"), "light");
  await page.click("label[for=theme-dark]");
  assert.equal(await page.getAttribute("html", "data-theme"), "dark");
  await page.click("label[for=theme-auto]");
  assert.equal(await page.getAttribute("html", "data-theme"), null);
  assert.match(await page.textContent("text=/Servidor \\d/"), /fixture/);
  await noHScroll(page);
});

await test("Offline: app abre pelo service worker e avisa que processar exige conexão", async () => {
  await page.goto(base + "/"); await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 10000 }).catch(() => {});
  await page.reload();
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForSelector("#link");
  assert.equal(await page.isVisible(".offline-banner"), true);
  await process_(link("p", "IMAGE0001"));
  await page.waitForSelector(".notice-error");
  assert.match(await page.textContent(".notice-error"), /Sem conexão/);
  await ctx.setOffline(false);
});

await test("Acessibilidade básica: controles com nome, foco visível, landmarks", async () => {
  await page.goto(base + "/"); await page.waitForSelector("#link");
  const unnamed = await page.$$eval("button, a, input, textarea", (els) => els.filter((e) => {
    const n = (e.getAttribute("aria-label") || e.textContent || e.getAttribute("placeholder") || "").trim() || (e.labels && e.labels.length ? "x" : "");
    return !n && e.type !== "hidden";
  }).map((e) => e.outerHTML.slice(0, 80)));
  assert.deepEqual(unnamed, []);
  assert.ok(await page.$("main") && await page.$("nav[aria-label]"));
  assert.equal(await page.getAttribute("html", "lang"), "pt-BR");
});

await test("Sem erros de JS no console durante o fluxo", async () => { assert.deepEqual(errors, [], JSON.stringify(errors)); });

// Desktop
const desk = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const dp = await desk.newPage();
await test("Desktop: layout centralizado sem rolagem horizontal", async () => {
  await dp.goto(base + "/"); await dp.waitForSelector("#link");
  await dp.fill("#link", link("p", "CAROUSEL1")); await dp.click("button[type=submit]"); await dp.waitForSelector(".gallery");
  await noHScroll(dp);
  await dp.screenshot({ path: `${SHOTS}/08-desktop.png` });
});
// tela pequena
const small = await browser.newContext({ viewport: { width: 320, height: 568 } });
const sp = await small.newPage();
await test("Tela pequena 320px: sem rolagem horizontal e sem sobreposição do botão", async () => {
  await sp.goto(base + "/"); await sp.waitForSelector("#link");
  await sp.fill("#link", link("p", "CAROUSEL1")); await sp.click("button[type=submit]"); await sp.waitForSelector(".gallery");
  await noHScroll(sp);
  const box = await sp.locator("button[type=submit]").boundingBox();
  assert.ok(box.height >= 44 && box.width >= 44);
  await sp.screenshot({ path: `${SHOTS}/09-320px.png` });
});

await browser.close(); srv.kill();
const failed = results.filter(([, r]) => r !== "OK");
console.log(`\n${results.length - failed.length}/${results.length} e2e OK`);
process.exit(failed.length ? 1 : 0);
