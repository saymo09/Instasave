// Build sem Vite: esbuild (bundle TS/CSS com hash) + geração de index.html e service worker.
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL(".", import.meta.url).pathname;
const dist = join(root, "dist");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const result = await build({
  entryPoints: [join(root, "src/main.ts")],
  outdir: join(dist, "assets"),
  entryNames: "[name]-[hash]",
  bundle: true, minify: true, sourcemap: false, format: "esm", target: ["chrome100", "safari15"],
  metafile: true, logLevel: "warning", legalComments: "none",
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
});
const outs = Object.keys(result.metafile.outputs).map((p) => relative(dist, p).replaceAll("\\", "/"));
const js = outs.find((o) => o.endsWith(".js"));
const css = outs.find((o) => o.endsWith(".css"));
if (!js || !css) throw new Error("bundle incompleto");

cpSync(join(root, "public"), dist, { recursive: true });
const html = readFileSync(join(root, "src/index.template.html"), "utf8").replace("__CSS__", css).replace("__JS__", js);
writeFileSync(join(dist, "index.html"), html);

function walk(d) {
  return readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
}
const skip = new Set(["sw.js"]);
const precache = ["/", ...walk(dist).map((p) => "/" + relative(dist, p).replaceAll("\\", "/")).filter((p) => !skip.has(p.slice(1)) && !p.endsWith(".map"))];
const build_id = createHash("sha256").update(precache.map((p) => p + (p === "/" ? "" : statSync(join(dist, p.slice(1))).size)).join("|")).update(html).digest("hex").slice(0, 10);
const sw = readFileSync(join(dist, "sw.js"), "utf8").replace("__BUILD__", build_id).replace("__PRECACHE__", JSON.stringify(precache));
writeFileSync(join(dist, "sw.js"), sw);
console.log(`build ok: ${js}, ${css}, ${precache.length} arquivos pré-cacheados (v${build_id})`);
