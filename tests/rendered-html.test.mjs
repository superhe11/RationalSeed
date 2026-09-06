import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server renders the visual novel shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>Рациональное зерно — визуальная новелла<\/title>/i);
  assert.match(html, /Рациональное/);
  assert.match(html, /романтическая комедия нарушения границ/);
  assert.match(html, /\d+(?:<!-- -->)? вариантов ответа/);
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview|react-loading-skeleton/);
});

test("project contains the story, launcher, and generated art", async () => {
  const [story, launcher, image] = await Promise.all([
    readFile(new URL("app/story.ts", root), "utf8"),
    readFile(new URL("ОТКРЫТЬ_НОВЕЛЛУ.bat", root), "utf8"),
    readFile(new URL("public/corridor.png", root)),
  ]);
  assert.match(story, /chooseEnding/);
  assert.match(story, /chapt(?:er|erTitle)/);
  assert.match(story, /choiceLockReason/);
  assert.match(story, /guitar_arrival/);
  for (const name of ["Тоня", "Ксюша", "Маша", "Яна Чорна", "Варя", "Оля", "Катя", "Ярослав"]) {
    assert.match(story, new RegExp(name));
  }
  assert.doesNotMatch(story, /архив|выгруз|source-|ArchiveModal/i);
  assert.match(launcher, /vinext\.cmd/);
  assert.ok(image.length > 500_000);
});

test("update endpoint serves the manifest without caching or login requirements", async () => {
  const { default: worker } = await import(new URL("../dist/server/index.js", import.meta.url).href);
  let assetPath;
  const response = await worker.fetch(new Request("https://novel.invalid/api/release"), {
    ASSETS: { fetch: async request => { assetPath = new URL(request.url).pathname; return new Response('{"contentCode":2}'); } },
  }, { waitUntil() {}, passThroughOnException() {} });
  assert.equal(assetPath, "/releases/latest.json");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  assert.match(response.headers.get("cache-control"), /no-store/);
  assert.equal((await response.json()).contentCode, 2);
});
