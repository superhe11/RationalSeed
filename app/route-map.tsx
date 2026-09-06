"use client";

import { useMemo, useState } from "react";
import { endingNodes, story, type StoryNode } from "./story";
import { routeProgress, type Library, type SaveState } from "./saves";

const branches = Object.values(story).filter(node => node.choices);
const chapters = [...new Set(branches.map(node => node.chapter))].sort((a, b) => a - b);

function destination(next: string): { id?: string; label: string } {
  const seen = new Set<string>();
  while (next && !seen.has(next)) {
    if (next === "resolve") return { label: "Финал по накопленным показателям" };
    if (next.startsWith("ending:")) return { label: endingNodes[next.slice(7)]?.chapterTitle ?? "Финал" };
    seen.add(next);
    const node = story[next];
    if (!node) break;
    if (node.choices) return { id: next, label: `${node.chapterTitle} · развилка ${branches.findIndex(item => item.id === next) + 1}` };
    next = node.next ?? "";
  }
  return { label: "Конец ветки" };
}

export function RouteMap({ library, current, hasRun }: { library: Library; current: SaveState; hasRun: boolean }) {
  const [mode, setMode] = useState<"current" | "all">("current");
  const [chapter, setChapter] = useState(chapters.includes(story[current.nodeId]?.chapter) ? story[current.nodeId].chapter : 1);
  const [reveal, setReveal] = useState(false);
  const [onlyClosed, setOnlyClosed] = useState(false);
  const run = useMemo(() => hasRun ? routeProgress(current) : { visited: [], decisions: [] }, [current, hasRun]);
  const visited = new Set(mode === "current" ? run.visited : library.visited);
  const decisions = new Set(mode === "current" ? run.decisions : library.decisions);
  const currentEndings = current.endingId ? [current.endingId] : [];
  const unlocked = new Set(mode === "current" ? currentEndings : library.unlocked);
  const choicesCount = branches.reduce((total, node) => total + node.choices!.length, 0);
  const completed = branches.filter(node => node.choices!.every((_, index) => decisions.has(`${node.id}:${index}`))).length;
  const inChapter = branches.filter(node => node.chapter === chapter && (!onlyClosed || node.choices!.some((_, index) => !decisions.has(`${node.id}:${index}`))));
  const jump = (id: string) => {
    const target = story[id];
    setChapter(target.chapter);
    setOnlyClosed(false);
    setTimeout(() => document.getElementById(`map-${id}`)?.scrollIntoView({ block: "start", behavior: "smooth" }), 0);
  };
  return <section className="route-map" aria-label="Карта сюжетных выборов">
    <div className="map-controls">
      <button aria-pressed={mode === "current"} onClick={() => setMode("current")}>Это прохождение</button>
      <button aria-pressed={mode === "all"} onClick={() => setMode("all")}>За все игры</button>
    </div>
    <p className="panel-intro" role="status">Выбрано {decisions.size} из {choicesCount} ответов · открыто {visited.size} из {Object.keys(story).length} сцен · финалы {unlocked.size}/{Object.keys(endingNodes).length}.{mode === "all" && ` Полностью исследовано развилок: ${completed}/${branches.length}.`}</p>
    <div className="map-options">
      <label>Глава <select value={chapter} onChange={event => setChapter(Number(event.target.value))}>{chapters.map(number => <option key={number} value={number}>{branches.find(node => node.chapter === number)!.chapterTitle}</option>)}</select></label>
      <label><input type="checkbox" checked={onlyClosed} onChange={event => setOnlyClosed(event.target.checked)} /> Только недопройденные развилки</label>
      <label><input type="checkbox" checked={reveal} onChange={event => setReveal(event.target.checked)} /> Показать названия закрытых сцен (спойлеры)</label>
    </div>
    <div className="map-legend"><span>✓ Пройдено</span><span>● Текущая сцена</span><span>○ Ещё не пройдено</span></div>
    {!hasRun && mode === "current" && <p>Текущее прохождение ещё не начато.</p>}
    {!inChapter.length && <p>В этой главе не осталось развилок, подходящих под фильтр.</p>}
    {inChapter.map(node => <Branch key={node.id} node={node} visited={visited.has(node.id)} active={hasRun && !current.endingId && current.nodeId === node.id && mode === "current"} decisions={decisions} reveal={reveal} onJump={jump} />)}
    <h3 className="map-endings-title">Финалы</h3>
    <div className="map-ending-grid">{Object.entries(endingNodes).map(([id, node]) => <div key={id} className={`map-ending ${unlocked.has(id) ? "is-done" : ""}`}><span>{unlocked.has(id) ? "✓ Открыт" : "○ Закрыт"}</span><b>{node.chapterTitle.replace("Финал · ", "")}</b></div>)}</div>
    <p className="panel-footnote">Карта ничего не перематывает и не меняет сейв. Общий прогресс не сбрасывается новой игрой. Для старых сейвов восстановлены только однозначные переходы: выборы с одинаковым выходом и уже удалённые прохождения восстановить нельзя.</p>
  </section>;
}

function Branch({ node, visited, active, decisions, reveal, onJump }: { node: StoryNode; visited: boolean; active: boolean; decisions: Set<string>; reveal: boolean; onJump: (id: string) => void }) {
  const known = visited || reveal;
  const number = branches.indexOf(node) + 1;
  return <article className={`map-branch ${active ? "is-active" : visited ? "is-done" : "is-locked"}`} id={`map-${node.id}`}>
    <header className="map-origin"><span>{active ? "● Сейчас здесь" : visited ? "✓ Сцена открыта" : "○ Сцена закрыта"} · развилка {number}</span><h3>{known ? `${node.speaker} · ${node.date}` : "Неизвестная сцена"}</h3>{known && <p>{node.text}</p>}</header>
    <div className="map-fork" aria-label={`Ответы развилки ${number}`}>
      {node.choices!.map((choice, index) => {
        const done = decisions.has(`${node.id}:${index}`);
        const target = destination(choice.next);
        return <div className={`map-path ${done ? "is-done" : ""}`} key={index}>
          <span className="map-path-state">{done ? "✓ Выбрано" : "○ Не выбрано"} · {index + 1}</span>
          <p>{known ? choice.label : "Ответ откроется вместе со сценой"}</p>
          <span className="map-arrow" aria-hidden="true">↓</span>
          {target.id ? <button className="map-target" onClick={() => onJump(target.id!)}>К следующей развилке →</button> : <span className="map-target-label">{known ? target.label : "Дальнейший путь скрыт"}</span>}
        </div>;
      })}
    </div>
  </article>;
}
