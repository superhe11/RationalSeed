import test from "node:test";
import assert from "node:assert/strict";
import { checkRelease, validateRelease, release } from "../app/updates.ts";

const manifest = { contentCode: 99, versionName: "9.0.0", runtimeVersion: release.runtimeVersion, notes: ["Проверка"], bundleUrl: `${release.updateOrigin}/releases/test.zip`, sha256: "a".repeat(64), publishedAt: new Date().toISOString(), sizeBytes: 1000 };
test("native string JSON and BOM are accepted, HTML/login pages are rejected", () => {
  assert.deepEqual(validateRelease(JSON.stringify(manifest)), manifest);
  assert.deepEqual(validateRelease('\uFEFF' + JSON.stringify(manifest)), manifest);
  assert.throws(() => validateRelease('<html>Access denied</html>'), /не JSON/);
});
test("browser transport validates payload and exposes HTTP and network errors", async t => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify(manifest)));
  assert.deepEqual(await checkRelease(), manifest);
  assert.ok(fetchMock.mock.calls[0].arguments[0].includes('/api/release?t='));
  fetchMock.mock.mockImplementation(async () => new Response("Denied", { status: 403 }));
  await assert.rejects(checkRelease(), /HTTP 403/);
  fetchMock.mock.mockImplementation(async () => { throw new Error("Network blocked"); });
  await assert.rejects(checkRelease(), /Network blocked/);
});
