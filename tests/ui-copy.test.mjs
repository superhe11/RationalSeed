import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("repeated disclaimer and technical filler are absent from the visible UI", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const panel = readFileSync(new URL("../app/panels.tsx", import.meta.url), "utf8");
  const updates = readFileSync(new URL("../app/update-panel.tsx", import.meta.url), "utf8");
  const map = readFileSync(new URL("../app/route-map.tsx", import.meta.url), "utf8");
  for (const text of ["Сатирическая история: сцены и диалоги", "Новая игра не сбрасывает коллекцию", "Игра работает без интернета", "Обновления: GitHub", "Голубое — пройдено", "Просмотр не меняет сейв", "Ручные слоты не меняются"]) {
    assert.ok(![page, panel, updates, map].some(source => source.includes(text)), text);
  }
  assert.match(page, />Меню<\/button>/);
  assert.match(panel, /← К игре/);
});
