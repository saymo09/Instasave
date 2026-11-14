import { test } from "node:test";
import assert from "node:assert/strict";
import { checkInstagramUrl } from "../src/lib/url.ts";

test("aceita e normaliza links válidos", () => {
  const cases: [string, string, string][] = [
    ["https://www.instagram.com/p/ABC123xyz/?igsh=1#x", "post", "https://www.instagram.com/p/ABC123xyz/"],
    ["  https://instagram.com/reel/ABC123xyz  ", "reel", "https://www.instagram.com/reel/ABC123xyz/"],
    ["https://www.instagram.com/reels/ABC123xyz/", "reel", "https://www.instagram.com/reel/ABC123xyz/"],
    ["https://www.instagram.com/tv/ABC123xyz/", "tv", "https://www.instagram.com/tv/ABC123xyz/"],
    ["https://www.instagram.com/user.name/p/AB-_12345/", "post", "https://www.instagram.com/p/AB-_12345/"],
  ];
  for (const [raw, kind, url] of cases) {
    const r = checkInstagramUrl(raw);
    assert.ok(r.ok, raw);
    if (r.ok) { assert.equal(r.kind, kind); assert.equal(r.url, url); }
  }
});

test("rejeita entradas inválidas ou perigosas", () => {
  const bad = ["", "   ", "olá mundo", "www.instagram.com/p/ABC123xyz/", "http://www.instagram.com/p/ABC123xyz/",
    "javascript:alert(1)", "file:///etc/passwd", "data:text/html,x", "https://user:pw@www.instagram.com/p/ABC123xyz/",
    "https://www.instagram.com@evil.com/p/ABC123xyz/", "https://www.instagram.com:8443/p/ABC123xyz/",
    "https://evil.com/p/ABC123xyz/", "https://www.instagram.com.evil.com/p/ABC123xyz/", "https://127.0.0.1/p/ABC123xyz/",
    "https://www.instagram.com/", "https://www.instagram.com/someuser/", "https://www.instagram.com/stories/u/1/",
    "https://www.instagram.com/share/reel/ABCDEFG/", "https://www.instagram.com/p/AB/", "https://www.instagram.com/p/ABC123xyz/ x"];
  for (const raw of bad) {
    const r = checkInstagramUrl(raw);
    assert.equal(r.ok, false, raw);
    if (!r.ok) assert.ok(r.message.length > 5);
  }
});
