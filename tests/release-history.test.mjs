import test from "node:test";
import assert from "node:assert/strict";
import history from "../app/release-history.json" with { type: "json" };
import release from "../app/release.json" with { type: "json" };
import { readFileSync } from "node:fs";

test("offline changelog covers every shipped version without duplicates", () => {
  const versions = [release, ...history];
  assert.deepEqual(versions.map(item => item.versionName), ["2.1.2", "2.1.1", "2.1.0", "2.0.1", "2.0.0", "1.9.2", "1.9.1", "1.9.0", "1.8.0", "1.7.0", "1.6.0", "1.5.0", "1.4.2", "1.4.1", "1.4.0", "1.3.0", "1.2.0", "1.1.0", "1.0.0"]);
  assert.equal(new Set(versions.map(item => item.versionName)).size, versions.length);
  for (const version of versions) assert.ok(version.notes.length && version.notes.every(note => typeof note === "string" && note.length > 10));
});
test("native APK version matches embedded content and checks GitHub from first launch", () => {
  const gradle = readFileSync(new URL('../android/app/build.gradle', import.meta.url), 'utf8');
  assert.match(gradle, new RegExp(`versionCode ${release.versionCode}\\b`));
  assert.ok(gradle.includes(`versionName "${release.versionName}"`));
  assert.equal(release.updateManifestUrl, "https://raw.githubusercontent.com/superhe11/RationalSeed/updates/latest.json");
});
