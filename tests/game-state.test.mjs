import assert from "node:assert/strict";
import test from "node:test";
import { emptyLibrary, freshGame, LIBRARY_KEY, LEGACY_KEY, readLibrary, snapshot, validateSave, withAutosave, writeLibrary } from "../app/saves.ts";
import { branchCount, choiceCount, chooseEnding, endingNodes, story } from "../app/story.ts";
import { release, validateRelease } from "../app/updates.ts";

const storage = data => ({ getItem: key => data[key] ?? null });

test("migrates v3 progress, including a completed ending, without deleting it", () => {
  const old = { nodeId: "last_sheet", stats: { boundaries: 10, selfControl: 10, pressure: 0 }, history: ["prologue", "matrix"], endingId: "subject" };
  const result = readLibrary(storage({ [LEGACY_KEY]: JSON.stringify(old) }));
  assert.equal(result.warning, undefined);
  assert.equal(result.library.auto.endingId, "subject");
  assert.deepEqual(result.library.auto.history, old.history);
  assert.deepEqual(result.library.unlocked, ["subject"]);
  assert.equal(result.library.slots.length, 6);
});

test("all six manual slots and unlocked endings survive autosave, load and new game", () => {
  const library = emptyLibrary();
  library.slots = Array.from({ length: 6 }, () => snapshot({ ...freshGame(), nodeId: "translator" }));
  library.unlocked = ["subject", "exposed"];
  const next = withAutosave(library, freshGame());
  const restored = readLibrary(storage({ [LIBRARY_KEY]: JSON.stringify(next) })).library;
  assert.equal(restored.slots.filter(Boolean).length, 6);
  assert.equal(restored.slots[5].nodeId, "translator");
  assert.deepEqual(restored.unlocked, ["subject", "exposed"]);
  assert.equal(restored.auto.nodeId, "prologue");
});

test("snapshot does not alias live stats or history", () => {
  const game = freshGame(); const saved = snapshot(game);
  game.stats.pressure = 10; game.history.push("prologue");
  assert.equal(saved.stats.pressure, 2); assert.deepEqual(saved.history, []);
});

test("invalid save fields and prototype keys are rejected", () => {
  for (const bad of [null, {}, { ...freshGame(), nodeId: "__proto__" }, { ...freshGame(), endingId: "toString" }, { ...freshGame(), history: ["missing"] }, { ...freshGame(), stats: { boundaries: 2, selfControl: NaN, pressure: 2 } }, { ...freshGame(), stats: { boundaries: -1, selfControl: 0, pressure: 0 } }]) assert.equal(validateSave(bad), null);
});

test("one broken slot does not discard good slots or endings", () => {
  const library = emptyLibrary(); library.slots[0] = snapshot(freshGame()); library.slots[1] = { nodeId: "bad" }; library.unlocked = ["pause", "__proto__", "pause"];
  const result = readLibrary(storage({ [LIBRARY_KEY]: JSON.stringify(library) }));
  assert.ok(result.warning); assert.ok(result.library.slots[0]); assert.equal(result.library.slots[1], null); assert.deepEqual(result.library.unlocked, ["pause"]);
});

test("corrupt JSON and denied storage do not crash the game", () => {
  assert.ok(readLibrary(storage({ [LIBRARY_KEY]: "broken{" })).warning);
  assert.ok(readLibrary({ getItem() { throw new Error("denied"); } }).warning);
  assert.equal(writeLibrary({ setItem() { throw new Error("quota"); } }, emptyLibrary()), false);
});

test("all nodes and all four endings remain reachable; every choice has a valid target", () => {
  const choices = Object.values(story).flatMap(node => node.choices ?? []);
  assert.equal(choices.length, choiceCount);
  assert.equal(Object.values(story).filter(node => node.choices).length, branchCount);
  assert.ok(Object.values(story).filter(node => node.choices).every(node => node.choices.length === 4));
  const seen = new Set(); const nodes = new Set(); const endings = new Set();
  const queue = [freshGame()];
  while (queue.length) {
    const game = queue.pop(); const key = `${game.nodeId}:${Object.values(game.stats).join()}`;
    if (seen.has(key)) continue;
    seen.add(key); nodes.add(game.nodeId);
    const node = story[game.nodeId]; assert.ok(node, game.nodeId);
    for (const edge of node.choices ?? [{ next: node.next, delta: {} }]) {
      const stats = Object.fromEntries(Object.entries(game.stats).map(([key, value]) => [key, Math.max(0, Math.min(10, value + (edge.delta[key] ?? 0)))]));
      if (edge.next === "resolve") { endings.add(chooseEnding(stats)); continue; }
      assert.ok(story[edge.next], `${node.id} -> ${edge.next}`);
      queue.push({ ...game, stats, nodeId: edge.next });
    }
  }
  assert.equal(nodes.size, Object.keys(story).length);
  assert.deepEqual([...endings].sort(), Object.keys(endingNodes).sort());
});

const validRelease = () => ({ contentCode: 3, versionName: "1.2.0", runtimeVersion: "android-2", notes: ["Исправление"], bundleUrl: `${release.updateOrigin}/releases/novel-1.2.0-3.zip`, sha256: "a".repeat(64), publishedAt: "2026-09-05T20:00:00Z", sizeBytes: 2000 });
test("release requires trusted HTTPS URL, checksum, bounded archive size and valid version", () => {
  assert.equal(validateRelease(validRelease()).contentCode, 3);
  for (const change of [{ bundleUrl: "https://evil.example/update.zip" }, { bundleUrl: `${release.updateOrigin}/releases/../../payload.zip` }, { bundleUrl: `${release.updateOrigin}/releases/payload.apk` }, { sha256: "wrong" }, { sizeBytes: 0 }, { sizeBytes: 26_000_000 }, { versionName: "NaN" }, { contentCode: 1.1 }, { notes: [null] }]) assert.throws(() => validateRelease({ ...validRelease(), ...change }));
});
