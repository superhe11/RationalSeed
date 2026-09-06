import test from "node:test";
import assert from "node:assert/strict";
import { checkRelease, formatUpdateSize, validateRelease, release } from "../app/updates.ts";

const manifest = { contentCode: 99, versionName: "9.0.0", runtimeVersion: release.runtimeVersion, notes: ["Проверка"], bundleUrl: `${release.updateOrigin}/releases/test.zip`, sha256: "a".repeat(64), publishedAt: new Date().toISOString(), sizeBytes: 1000 };
test("update size preserves two decimal places and the exact manifest byte count", () => {
  assert.equal(formatUpdateSize(2144678), "2,05 МБ");
});
test("native string JSON and BOM are accepted, HTML/login pages are rejected", () => {
  assert.deepEqual(validateRelease(JSON.stringify(manifest)), manifest);
  assert.deepEqual(validateRelease('\uFEFF' + JSON.stringify(manifest)), manifest);
  assert.throws(() => validateRelease('<html>Access denied</html>'), /не JSON/);
});
test("GitHub downloads trust only this repo and exact versioned asset; legacy bridge still works", () => {
  const next = { ...manifest, bundleUrl: `https://github.com/${release.githubRepository}/releases/download/v9.0.0/novel-9.0.0-99.zip` };
  assert.deepEqual(validateRelease(next), next);
  for (const url of [next.bundleUrl.replace('superhe11', 'attacker'), next.bundleUrl.replace('99.zip', '98.zip'), next.bundleUrl + '?token=bad', next.bundleUrl.replace('https:', 'http:'), next.bundleUrl.replace('github.com/', 'github.com.evil.invalid/')]) assert.throws(() => validateRelease({ ...next, bundleUrl: url }));
  assert.deepEqual(validateRelease(manifest), manifest);
});
test("browser transport validates payload and exposes HTTP and network errors", async t => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify(manifest)));
  assert.deepEqual(await checkRelease(), manifest);
  assert.ok(fetchMock.mock.calls[0].arguments[0].startsWith(release.updateManifestUrl + '?t='));
  fetchMock.mock.mockImplementation(async () => new Response("Denied", { status: 403 }));
  await assert.rejects(checkRelease(), /HTTP 403/);
  fetchMock.mock.mockImplementation(async () => { throw new Error("Network blocked"); });
  await assert.rejects(checkRelease(), /Network blocked/);
});
