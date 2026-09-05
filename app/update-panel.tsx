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
  const checkingRef = useRef(false);
  const installingRef = useRef(false);
  const shown = useRef<number | null>(null);
  const popup = useRef(showPopup);
  useEffect(() => { popup.current = showPopup; }, [showPopup]);
  const check = useCallback(async (manual = false) => {
    if (checkingRef.current || installingRef.current) return;
    checkingRef.current = true; setChecking(true); setMessage("");
    try {
      const found = await checkRelease();
      setLatest(found);
      if (found.contentCode > release.contentCode) {
        if (shown.current !== found.contentCode && isAndroidApp()) { shown.current = found.contentCode; popup.current(); }
      } else setMessage("У вас последняя версия.");
    } catch {
      if (manual) setMessage("Не удалось проверить обновления. Проверьте интернет и попробуйте ещё раз. Можно продолжать играть офлайн.");
    } finally { checkingRef.current = false; setChecking(false); }
  }, []);
  useEffect(() => {
    if (!ready || !isAndroidApp()) return;
    const timer = setTimeout(() => { void check(); }, 400);
    const listener = App.addListener("resume", () => { void check(); });
    const resume = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", resume);
    return () => { clearTimeout(timer); void listener.then(handle => handle.remove()); document.removeEventListener("visibilitychange", resume); window.removeEventListener("focus", resume); };
  }, [ready, check]);
  const install = async () => {
    if (!latest || installingRef.current) return;
    installingRef.current = true; setInstalling(true); setPercent(0); setMessage("");
    try { await flushSaves(); await installRelease(latest, setPercent); }
    catch { setMessage("Обновление не установлено. Текущая версия и сохранения на месте. Проверьте интернет и свободное место, затем повторите."); }
    finally { installingRef.current = false; setInstalling(false); }
  };
  return { latest, checking, installing, percent, message, check, install, available: Boolean(latest && latest.contentCode > release.contentCode) };
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
    <button className="text-button" disabled={checking || installing} onClick={() => void updates.check(true)}>{checking ? "Проверяю…" : "Проверить обновления"}</button>
    <p className="panel-footnote">Игра работает без интернета. Сеть нужна только для проверки и загрузки обновлений. Прогресс никуда не отправляется.</p>
  </section>;
}
