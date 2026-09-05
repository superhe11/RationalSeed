import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { CapacitorUpdater } from "@capgo/capacitor-updater";
import release from "./release.json" with { type: "json" };

export { release };
export const isAndroidApp = () => Capacitor.getPlatform() === "android";
export type AppRelease = { contentCode: number; versionName: string; runtimeVersion: string; notes: string[]; bundleUrl: string; sha256: string; publishedAt: string; sizeBytes: number };

export function validateRelease(value: unknown): AppRelease {
  const data = value as AppRelease;
  if (!data || !Number.isSafeInteger(data.contentCode) || data.contentCode < 1 || typeof data.versionName !== "string" || !/^\d+\.\d+\.\d+$/.test(data.versionName) || typeof data.runtimeVersion !== "string" || !Array.isArray(data.notes) || data.notes.length > 20 || !data.notes.every(note => typeof note === "string" && note.length <= 1000) || typeof data.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(data.sha256) || !Number.isFinite(Date.parse(data.publishedAt)) || !Number.isSafeInteger(data.sizeBytes) || data.sizeBytes <= 0 || data.sizeBytes > 25_000_000) throw new Error("Неверный формат обновления");
  const url = new URL(data.bundleUrl);
  if (url.origin !== release.updateOrigin || !/^\/releases\/[a-zA-Z0-9._-]+\.zip$/.test(url.pathname) || url.search || url.hash || url.username || url.password) throw new Error("Недоверенный адрес обновления");
  return data;
}

export async function checkRelease(): Promise<AppRelease> {
  const url = `${release.updateOrigin}/api/release?t=${Date.now()}`;
  if (isAndroidApp()) {
    const response = await CapacitorHttp.get({ url, connectTimeout: 8000, readTimeout: 8000, responseType: "json", headers: { Accept: "application/json" } });
    if (response.status !== 200) throw new Error("Сервер обновлений недоступен");
    return validateRelease(response.data);
  }
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error("Сервер обновлений недоступен");
  return validateRelease(await response.json());
}

export async function markAppReady() {
  if (isAndroidApp()) await CapacitorUpdater.notifyAppReady();
}

export async function installRelease(latest: AppRelease, onProgress: (percent: number) => void) {
  validateRelease(latest);
  if (!isAndroidApp() || latest.contentCode <= release.contentCode || latest.runtimeVersion !== release.runtimeVersion) throw new Error("Эта версия не подходит установленному приложению");
  const listener = await CapacitorUpdater.addListener("download", event => onProgress(event.percent));
  try {
    const bundle = await CapacitorUpdater.download({ url: latest.bundleUrl, version: latest.versionName, checksum: latest.sha256 });
    await CapacitorUpdater.set({ id: bundle.id });
  } finally {
    await listener.remove();
  }
}
