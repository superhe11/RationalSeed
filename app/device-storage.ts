import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { LIBRARY_KEY, readLibrary, writeLibrary, type Library } from "./saves";

// Native storage is authoritative on Android; keep the old WebView copy for rollback.
let pending: Promise<boolean> = Promise.resolve(true);

export async function loadDeviceLibrary() {
  if (Capacitor.isNativePlatform()) {
    const { value } = await Preferences.get({ key: LIBRARY_KEY });
    if (value) return readLibrary({ getItem: key => key === LIBRARY_KEY ? value : null });
  }
  return readLibrary(localStorage);
}

export function persistLibrary(library: Library): Promise<boolean> {
  let backupSaved = false;
  try { backupSaved = writeLibrary(localStorage, library); } catch { /* Native copy can still succeed. */ }
  if (!Capacitor.isNativePlatform()) { pending = Promise.resolve(backupSaved); return pending; }
  const value = JSON.stringify(library);
  pending = pending.then(async () => {
    try { await Preferences.set({ key: LIBRARY_KEY, value }); return true; } catch { return false; }
  });
  return pending;
}

export async function flushSaves() {
  if (!await pending) throw new Error("Сохранение не записано");
}
