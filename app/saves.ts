import { endingNodes, initialStats, story, type StoryStats } from "./story.ts";

export const LIBRARY_KEY = "rational-seed-library-v1";
export const LEGACY_KEY = "rational-seed-save-v3";
export const SLOT_COUNT = 6;
export type SaveState = { nodeId: string; stats: StoryStats; history: string[]; endingId?: string };
export type SavedGame = SaveState & { savedAt: string };
export type Library = { schema: 1; auto: SavedGame | null; slots: (SavedGame | null)[]; unlocked: string[] };
type StorageReader = Pick<Storage, "getItem">;
export const freshGame = (): SaveState => ({ nodeId: "prologue", stats: { ...initialStats }, history: [] });
export const emptyLibrary = (): Library => ({ schema: 1, auto: null, slots: Array(SLOT_COUNT).fill(null), unlocked: [] });
const owns = (object: object, key: unknown): key is string => typeof key === "string" && Object.hasOwn(object, key);

export function validateSave(value: unknown): SaveState | null {
  if (!value || typeof value !== "object") return null;
  const save = value as Partial<SaveState>;
  if (!owns(story, save.nodeId) || (save.endingId !== undefined && !owns(endingNodes, save.endingId))) return null;
  if (!save.stats || ![save.stats.boundaries, save.stats.selfControl, save.stats.pressure].every(n => Number.isInteger(n) && n >= 0 && n <= 10)) return null;
  if (!Array.isArray(save.history) || save.history.length > 1000 || !save.history.every(id => owns(story, id))) return null;
  return { nodeId: save.nodeId, stats: { ...save.stats }, history: [...save.history], ...(save.endingId ? { endingId: save.endingId } : {}) };
}

export function snapshot(save: SaveState, now = new Date().toISOString()): SavedGame {
  return { ...save, stats: { ...save.stats }, history: [...save.history], savedAt: now };
}

function savedGame(value: unknown): SavedGame | null {
  const valid = validateSave(value);
  if (!valid) return null;
  const date = (value as SavedGame).savedAt;
  return snapshot(valid, typeof date === "string" && Number.isFinite(Date.parse(date)) ? date : new Date().toISOString());
}

export function readLibrary(storage: StorageReader): { library: Library; warning?: string } {
  const library = emptyLibrary();
  try {
    const raw = storage.getItem(LIBRARY_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data?.schema !== 1 || !Array.isArray(data.slots) || !Array.isArray(data.unlocked)) throw new Error("Invalid library");
      library.auto = savedGame(data.auto);
      library.slots = Array.from({ length: SLOT_COUNT }, (_, i) => savedGame(data.slots[i]));
      library.unlocked = [...new Set<string>(data.unlocked.filter((id: unknown) => owns(endingNodes, id)))];
      // A save loaded from an older version may already contain a completed ending.
      for (const save of [library.auto, ...library.slots]) {
        if (save?.endingId && !library.unlocked.includes(save.endingId)) library.unlocked.push(save.endingId);
      }
      const damaged = (data.auto && !library.auto) || data.slots.some((s: unknown, i: number) => s && i < SLOT_COUNT && !library.slots[i]);
      return { library, ...(damaged ? { warning: "Повреждённый слот пропущен. Остальные сохранения доступны." } : {}) };
    }
    const legacy = storage.getItem(LEGACY_KEY);
    if (legacy) {
      library.auto = savedGame(JSON.parse(legacy));
      if (!library.auto) throw new Error("Invalid legacy save");
      if (library.auto.endingId) library.unlocked.push(library.auto.endingId);
    }
    return { library };
  } catch {
    return { library, warning: "Не удалось прочитать сохранения. Старые данные не удалены; доступна новая игра." };
  }
}

export function withAutosave(library: Library, save: SaveState): Library {
  const unlocked = save.endingId ? [...new Set([...library.unlocked, save.endingId])] : library.unlocked;
  return { ...library, auto: snapshot(save), unlocked };
}

export function writeLibrary(storage: Pick<Storage, "setItem">, library: Library): boolean {
  try { storage.setItem(LIBRARY_KEY, JSON.stringify(library)); return true; } catch { return false; }
}

export const endingHints: Record<string, string> = {
  subject: "Слышать отказ, держать себя в руках и перестать давить. Одной красивой речи мало.",
  pause: "Начать меняться, но оставить себе лазейку назад.",
  protocol: "Довести поиск взаимности до системы и продолжать улучшать её вместо себя.",
  exposed: "Максимум давления, минимум уважения к границам. Остальные наконец сравнят заметки.",
};
