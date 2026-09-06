"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { emptyLibrary, snapshot, withAutosave, type Library, type SaveState } from "./saves";
import { loadDeviceLibrary, persistLibrary, flushSaves } from "./device-storage";
import { GamePanel, type Panel } from "./panels";
import { UpdatePanel, useUpdates } from "./update-panel";
import { markAppReady, release } from "./updates";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { IntroNotice } from "./intro-notice";
import {
  branchCount,
  chapterCount,
  choiceLockReason,
  choiceCount,
  chooseEnding,
  endingNodes,
  initialStats,
  mainChapterCount,
  story,
  type Choice,
  type StoryNode,
  type StoryStats,
} from "./story";

function clamp(value: number) {
  return Math.max(0, Math.min(10, value));
}

function updateStats(stats: StoryStats, choice: Choice): StoryStats {
  return {
    boundaries: clamp(stats.boundaries + (choice.delta.boundaries ?? 0)),
    selfControl: clamp(stats.selfControl + (choice.delta.selfControl ?? 0)),
    pressure: clamp(stats.pressure + (choice.delta.pressure ?? 0)),
  };
}

function createAmbience() {
  const AudioCtx = window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;

  const context = new AudioCtx();
  const master = context.createGain();
  master.gain.value = 0.035;
  master.connect(context.destination);

  const buffer = context.createBuffer(1, context.sampleRate * 3, context.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i += 1) {
    const white = Math.random() * 2 - 1;
    last = last * 0.985 + white * 0.015;
    data[i] = last * 1.8;
  }

  const rain = context.createBufferSource();
  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 900;
  rain.buffer = buffer;
  rain.loop = true;
  rain.connect(filter).connect(master);
  rain.start();

  const hum = context.createOscillator();
  const humGain = context.createGain();
  hum.type = "sine";
  hum.frequency.value = 54;
  humGain.gain.value = 0.08;
  hum.connect(humGain).connect(master);
  hum.start();

  return {
    stop: () => {
      rain.stop();
      hum.stop();
      void context.close();
    },
  };
}

export default function Home() {
  const [started, setStarted] = useState(false);
  const [nodeId, setNodeId] = useState("prologue");
  const [endingId, setEndingId] = useState<string | undefined>();
  const [stats, setStats] = useState<StoryStats>(initialStats);
  const [history, setHistory] = useState<string[]>([]);
  const [decisions, setDecisions] = useState<string[]>([]);
  const [soundOn, setSoundOn] = useState(false);
  const [showHud, setShowHud] = useState(true);
  const [ready, setReady] = useState(false);
  const [introAccepted, setIntroAccepted] = useState(false);
  const [library, setLibrary] = useState<Library>(emptyLibrary);
  const libraryRef = useRef(library);
  const [notice, setNotice] = useState("");
  const [panel, setPanel] = useState<Panel | null>(null);
  const updates = useUpdates(ready && introAccepted, () => setPanel("updates"));
  const ambience = useRef<ReturnType<typeof createAmbience>>(null);

  const commitLibrary = useCallback((next: Library) => {
    libraryRef.current = next;
    setLibrary(next);
    void persistLibrary(next).then(saved => { if (!saved) setNotice("Не удалось записать сохранение: проверьте свободное место. Пока прогресс хранится только до закрытия игры."); });
  }, []);

  const restore = useCallback((saved: SaveState) => {
    setNodeId(saved.nodeId);
    setStats(saved.stats);
    setHistory(saved.history);
    setDecisions(saved.decisions ?? []);
    setEndingId(saved.endingId);
    setStarted(true);
    setPanel(null);
  }, []);

  const node = useMemo<StoryNode>(() => {
    if (endingId && endingNodes[endingId]) return endingNodes[endingId];
    return story[nodeId] ?? story.prologue;
  }, [endingId, nodeId]);

  useEffect(() => {
    let active = true;
    void loadDeviceLibrary().then(loaded => {
      if (!active) return;
      libraryRef.current = loaded.library;
      setLibrary(loaded.library);
      if (loaded.warning) setNotice(loaded.warning);
      const saved = loaded.library.auto;
      if (saved) {
        setNodeId(saved.nodeId);
        setStats(saved.stats);
        setHistory(saved.history);
        setDecisions(saved.decisions ?? []);
        setEndingId(saved.endingId);
      }
      setReady(true);
    }).catch(() => {
      if (!active) return;
      setNotice("Не удалось прочитать хранилище. Старые данные не удалены. Проверьте свободное место и перезапустите игру.");
      setReady(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!ready || !started) return;
    commitLibrary(withAutosave(libraryRef.current, { nodeId, stats, history, decisions, endingId }));
  }, [endingId, history, decisions, nodeId, started, stats, ready, commitLibrary]);

  useEffect(() => {
    if (!ready) return;
    const frame = requestAnimationFrame(() => { void markAppReady().catch(() => setNotice("Не удалось подтвердить запуск обновления. При следующем старте возможен откат к предыдущей версии.")); });
    return () => cancelAnimationFrame(frame);
  }, [ready]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [nodeId, endingId, started]);

  useEffect(() => () => ambience.current?.stop(), []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listener = App.addListener("backButton", () => {
      if (!introAccepted) { setIntroAccepted(true); return; }
      if (updates.installing) return;
      if (panel) setPanel(null);
      else if (started) setPanel("menu");
      else void flushSaves().then(() => App.exitApp()).catch(() => setNotice("Сохранение ещё не записано. Проверьте свободное место."));
    });
    return () => { void listener.then(handle => handle.remove()); };
  }, [panel, started, updates.installing, introAccepted]);

  const advance = useCallback(() => {
    if (node.choices?.length || endingId) return;
    if (node.next?.startsWith("ending:")) {
      setEndingId(node.next.slice(7));
      setHistory(items => [...items, node.id]);
      return;
    }
    if (node.next === "resolve") {
      setEndingId(chooseEnding(stats));
      setHistory((items) => [...items, node.id]);
      return;
    }
    if (node.next) {
      setHistory((items) => [...items, node.id]);
      setNodeId(node.next);
    }
  }, [endingId, node, stats]);

  const selectChoice = useCallback((choice: Choice) => {
    if (choiceLockReason(stats, choice, decisions)) return;
    const nextStats = updateStats(stats, choice);
    setStats(nextStats);
    setHistory((items) => [...items, node.id]);
    setDecisions(items => [...items, `${node.id}:${node.choices!.indexOf(choice)}`]);
    if (choice.next.startsWith("ending:")) setEndingId(choice.next.slice(7));
    else if (choice.next === "resolve") setEndingId(chooseEnding(nextStats));
    else setNodeId(choice.next);
  }, [node.id, node.choices, stats, decisions]);

  const reset = useCallback(() => {
    setNodeId("prologue");
    setStats(initialStats);
    setHistory([]);
    setDecisions([]);
    setEndingId(undefined);
    setStarted(true);
    setPanel(null);
  }, []);

  const toggleSound = useCallback(() => {
    if (soundOn) {
      ambience.current?.stop();
      ambience.current = null;
      setSoundOn(false);
      return;
    }
    ambience.current = createAmbience();
    setSoundOn(Boolean(ambience.current));
  }, [soundOn]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!started || panel || updates.installing) return;
      if (event.target instanceof HTMLElement && event.target.closest("button, a, input, textarea, select")) return;
      if (event.key.toLowerCase() === "m") return toggleSound();
      if (event.key === "Escape") return setPanel("menu");
      const choiceIndex = Number(event.key) - 1;
      if (node.choices && choiceIndex >= 0 && choiceIndex < node.choices.length) {
        selectChoice(node.choices[choiceIndex]);
        return;
      }
      if ((event.key === "Enter" || event.key === " ") && !node.choices?.length) {
        event.preventDefault();
        advance();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [advance, node.choices, selectChoice, started, toggleSound, panel, updates.installing]);

  const progress = Math.round((node.chapter / chapterCount) * 100);
  const isEnding = Boolean(endingId);
  const currentSave = { nodeId, stats, history, decisions, endingId };

  return (
    <main className={`novel ${started ? "playing" : "on-title"} mood-${node.mood}`}>
      <div className="scene" aria-hidden="true" />
      <div className="vignette" aria-hidden="true" />
      <div className="rain" aria-hidden="true" />

      {!started ? (
        <section className="title-screen" aria-labelledby="novel-title">
          <div className="title-kicker">романтическая комедия нарушения границ</div>
          <h1 id="novel-title">Рациональное <span>зерно</span></h1>
          <p className="title-deck">
            Александр хочет вычислить взаимность. Девушки хотят, чтобы он перестал вычислять их.
            Где-то между этими задачами рождается научный метод, который никто не просил.
          </p>
          <div className="title-rule" />
          <button className="primary-button" disabled={!ready} onClick={() => setStarted(true)}>
            {library.auto ? "Продолжить историю" : "Начать эксперимент"}
            <span aria-hidden="true">↗</span>
          </button>
          <div className="title-links">
            <button className="text-button" disabled={!ready} onClick={() => setPanel("menu")}>Меню</button>
            <button className="text-button" disabled={!ready} onClick={() => setPanel("saves")}>Сохранения</button>
            <button className="text-button" disabled={!ready} onClick={() => setPanel("endings")}>Концовки · {library.unlocked.length}/{Object.keys(endingNodes).length}</button>
            <button className="text-button" disabled={!ready} onClick={() => setPanel("map")}>Карта выборов</button>
            <button className="text-button" onClick={() => setPanel("updates")}>Версия {release.versionName}{updates.available ? " · новая версия" : ""}</button>
            {library.auto && <button className="text-button" onClick={() => setPanel("menu")}>Новая игра</button>}
          </div>
          <div className="title-meta">
            <span>{mainChapterCount} глав + пролог</span><span>{branchCount} развилок</span>
            <span>{choiceCount} вариантов ответа</span><span>{Object.keys(endingNodes).length} финалов</span>
          </div>
        </section>
      ) : (
        <>
          <header className="topbar">
            <button className="brand" onClick={() => setStarted(false)} aria-label="На титульный экран">
              РЗ
            </button>
            <div className="chapter-line">
              <span>{node.chapterTitle}</span>
              <div className="progress-track"><i style={{ width: `${progress}%` }} /></div>
            </div>
            <nav className="utility" aria-label="Настройки новеллы">
              <button onClick={() => setPanel("menu")}>Меню{updates.available ? " •" : ""}</button>
            </nav>
          </header>

          <div className="scene-info">
          <div className="date-stamp">{node.date}</div>
          {showHud && (
            <aside className="meters" aria-label="Состояние Александра">
              <Meter label="границы" value={stats.boundaries} tone="rose" />
              <Meter label="самоконтроль" value={stats.selfControl} tone="gold" />
              <Meter label="давление" value={stats.pressure} tone="blue" />
            </aside>
          )}

          </div>

          <section key={node.id} className={`dialogue ${node.choices ? "has-choices" : ""}`} aria-live="polite">
            <div className="speaker-row">
              <span className="speaker">{node.speaker}</span>
              <span className="node-count">{String(history.length + 1).padStart(2, "0")}</span>
            </div>
            <p className="dialogue-text">{node.text}</p>
            {node.aside && <p className="aside">{node.aside}</p>}

            {node.choices ? (
              <div className="choices">
                {node.choices.map((choice, index) => {
                  const lockReason = choiceLockReason(stats, choice, decisions);
                  return <button key={choice.label} className={lockReason ? "choice-locked" : undefined} disabled={Boolean(lockReason)} onClick={() => selectChoice(choice)}>
                    <span className="choice-index">0{index + 1}</span>
                    <span className="choice-copy"><b>{choice.label}</b><small>{lockReason ?? choice.consequence}</small></span>
                    <span className="choice-arrow" aria-hidden="true">→</span>
                  </button>;
                })}
              </div>
            ) : isEnding ? (
              <div className="ending-actions">
                <button className="primary-button" onClick={() => setPanel("endings")}>Концовки · {library.unlocked.length}/{Object.keys(endingNodes).length}</button>
                <button className="text-button" onClick={() => setPanel("menu")}>Новая игра</button>
                <button className="text-button" onClick={() => setStarted(false)}>На титульный экран</button>
              </div>
            ) : (
              <button className="continue" onClick={advance}>{node.continueLabel ?? "продолжить"} <span>Enter ↵</span></button>
            )}
          </section>
        </>
      )}
      {notice && <div className="storage-notice" role="status">{notice}<button onClick={() => setNotice("")} aria-label="Закрыть сообщение">×</button></div>}
      {updates.diagnostic && !panel && introAccepted && <div className="storage-notice" role="status">Не удалось проверить обновления.<button onClick={() => setPanel("updates")}>Подробнее</button></div>}
      {!introAccepted && <IntroNotice onContinue={() => setIntroAccepted(true)} />}
      {panel && <GamePanel
        panel={panel} onPanel={setPanel} onClose={() => { if (!updates.installing) setPanel(null); }}
        library={library} currentSave={currentSave} canSave={started || Boolean(library.auto)} onLoad={restore}
        onSave={index => {
          const slots = [...libraryRef.current.slots];
          slots[index] = snapshot(currentSave);
          commitLibrary({ ...libraryRef.current, slots });
        }}
        onDelete={index => {
          const slots = [...libraryRef.current.slots]; slots[index] = null;
          commitLibrary({ ...libraryRef.current, slots });
        }}
        onReset={reset} onTitle={() => { setStarted(false); setPanel(null); }}
        soundOn={soundOn} onSound={toggleSound} showHud={showHud} onHud={() => setShowHud(value => !value)}
        locked={updates.installing} updateContent={<UpdatePanel updates={updates} />}
      />}
    </main>
  );
}

function Meter({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className={`meter meter-${tone}`}>
      <div><span>{label}</span><b>{value}/10</b></div>
      <div className="meter-track"><i style={{ width: `${value * 10}%` }} /></div>
    </div>
  );
}
