"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { checkRelease, installRelease, isAndroidApp, release, type AppRelease } from "./updates";
import { App } from "@capacitor/app";
import { flushSaves } from "./device-storage";

export function useUpdates(ready: boolean, showPopup: () => void) {
  const [latest, setLatest] = useState<AppRelease | null>(null);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [percent, setPercent] = useState(0);
  const [message, setMessage] = useState("");
  const [diagnostic, setDiagnostic] = useState("");
  const checkingRef = useRef(false);
  const installingRef = useRef(false);
  const failedRef = useRef(false);
  const shown = useRef<number | null>(null);
  const popup = useRef(showPopup);
  useEffect(() => { popup.current = showPopup; }, [showPopup]);
  const check = useCallback(async () => {
    if (checkingRef.current || installingRef.current) return;
    checkingRef.current = true; setChecking(true); setMessage(""); setDiagnostic("");
    try {
      const found = await checkRelease();
      failedRef.current = false;
      setLatest(found);
      if (found.contentCode > release.contentCode) {
        if (shown.current !== found.contentCode && isAndroidApp()) { shown.current = found.contentCode; popup.current(); }
      } else setMessage("У вас последняя версия.");
    } catch (error) {
      failedRef.current = true;
      setMessage("Не удалось связаться с сервером обновлений. Игра доступна офлайн. Проверка повторится при возвращении в приложение или восстановлении сети.");
      setDiagnostic(error instanceof Error ? error.message : String(error));
    } finally { checkingRef.current = false; setChecking(false); }
  }, []);
  useEffect(() => {
    if (!ready || !isAndroidApp()) return;
    const timer = setTimeout(() => { void check(); }, 400);
    const listener = App.addListener("resume", () => { void check(); });
    const resume = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", resume);
    window.addEventListener("online", resume);
    const retry = setInterval(() => { if (failedRef.current && document.visibilityState === "visible") void check(); }, 60000);
    return () => { clearTimeout(timer); clearInterval(retry); void listener.then(handle => handle.remove()); document.removeEventListener("visibilitychange", resume); window.removeEventListener("focus", resume); window.removeEventListener("online", resume); };
  }, [ready, check]);
  const install = async () => {
    if (!latest || installingRef.current) return;
    installingRef.current = true; setInstalling(true); setPercent(0); setMessage("");
    try { await flushSaves(); await installRelease(latest, setPercent); }
    catch { setMessage("Обновление не установлено. Текущая версия и сохранения на месте. Проверьте интернет и свободное место, затем повторите."); }
    finally { installingRef.current = false; setInstalling(false); }
  };
  return { latest, checking, installing, percent, message, diagnostic, check, install, available: Boolean(latest && latest.contentCode > release.contentCode) };
}

export function UpdatePanel({ updates }: { updates: ReturnType<typeof useUpdates> }) {
  const { latest, checking, installing, percent, message, available } = updates;
  const incompatible = latest && latest.runtimeVersion !== release.runtimeVersion;
  return <section className="updates-content">
    <p className="panel-intro">Установлена версия {release.versionName}</p>
    {available && latest ? <>
      <h3>Новая версия {latest.versionName}</h3>
      <ul className="patch-notes">{latest.notes.map(note => <li key={note}>{note}</li>)}</ul>
      {incompatible ? <p>Для этой версии нужна новая Android-оболочка. Получите новый APK у автора и установите поверх текущего приложения, не удаляя его.</p> : isAndroidApp() ? <>
        <p className="panel-intro">{(latest.sizeBytes / 1024 / 1024).toFixed(1)} МБ · После загрузки игра перезапустится. Сохранения останутся.</p>
        <button className="primary-button" disabled={installing} onClick={() => void updates.install()}>{installing ? `Обновление · ${percent}%` : "Скачать и обновить"}</button>
      </> : <p>В браузере достаточно обновить страницу. В Android-приложении новая версия устанавливается прямо здесь.</p>}
    </> : <><h3>Что изменилось в {release.versionName}</h3><ul className="patch-notes">{release.notes.map(note => <li key={note}>{note}</li>)}</ul></>}
    {installing && <><progress aria-label="Загрузка обновления" max={100} value={percent} /><p className="panel-intro">Не закрывайте приложение до завершения загрузки.</p></>}
    <p role="status">{message}</p>
    {updates.diagnostic && <details className="update-diagnostic"><summary>Причина ошибки</summary><p>{updates.diagnostic}</p><p>Если интернет работает, откройте этот адрес в браузере на том же телефоне:</p><a href={release.updateManifestUrl} target="_blank" rel="noreferrer">Проверить доступность сервера GitHub</a></details>}
    <button className="text-button" disabled={checking || installing} onClick={() => void updates.check()}>{checking ? "Проверяю…" : "Проверить обновления"}</button>
    <p className="panel-footnote">Игра работает без интернета. Сеть нужна только для проверки и загрузки обновлений. Прогресс никуда не отправляется.</p>
  </section>;
}
