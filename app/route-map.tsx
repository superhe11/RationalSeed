"use client";

import { useMemo, useRef, useState } from "react";
import { endingNodes, story } from "./story";
import { routeProgress, type Library, type SaveState } from "./saves";
import { buildRouteGraph, type GraphNode } from "./route-graph";

const graph = buildRouteGraph();
const byId = new Map(graph.nodes.map(node => [node.id, node]));
const chapters = [...new Set(Object.values(story).map(node => node.chapter))].map(chapter => ({ chapter, node: graph.nodes.filter(node => node.chapter === chapter && node.kind === "scene").sort((a, b) => a.x - b.x)[0] }));

export function RouteMap({ library, current, hasRun }: { library: Library; current: SaveState; hasRun: boolean }) {
  const [mode, setMode] = useState<"current" | "all">("current");
  const [reveal, setReveal] = useState(false);
  const [onlyClosed, setOnlyClosed] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; left: number } | null>(null);
  const run = useMemo(() => hasRun ? routeProgress(current) : { visited: [], decisions: [] }, [current, hasRun]);
  const visited = new Set(mode === "current" ? run.visited : library.visited);
  const decisions = new Set(mode === "current" ? run.decisions : library.decisions);
  const unlocked = new Set(mode === "current" ? current.endingId ? [current.endingId] : [] : library.unlocked);
  const activeId = hasRun ? current.endingId ? `ending:${current.endingId}` : current.nodeId : "";
  const done = (node: GraphNode) => node.kind === "choice" ? decisions.has(node.id) : node.kind === "ending" ? unlocked.has(node.source) : visited.has(node.source);
  const known = (node: GraphNode) => reveal || (node.kind === "choice" ? visited.has(node.source) : done(node));
  const jump = (id: string) => { const node = byId.get(id); if (node) viewport.current?.scrollTo({ left: Math.max(0, node.x * zoom - 24), top: Math.max(0, node.y * zoom - 80), behavior: "smooth" }); };
  const pan = (direction: number) => viewport.current?.scrollBy({ left: direction * viewport.current.clientWidth * .75, behavior: "smooth" });
  const detail = selected ? byId.get(selected) : null;
  return <section className="route-map" aria-label="Древо всех сюжетных выборов">
    <div className="map-controls">
      <button aria-pressed={mode === "current"} onClick={() => setMode("current")}>Это прохождение</button>
      <button aria-pressed={mode === "all"} onClick={() => setMode("all")}>За все игры</button>
      <button disabled={!hasRun} onClick={() => jump(activeId)}>К текущей сцене</button>
    </div>
    <p className="panel-intro" role="status">Ответы {decisions.size}/{graph.nodes.filter(node => node.kind === "choice").length} · сцены {visited.size}/{Object.keys(story).length} · финалы {unlocked.size}/{Object.keys(endingNodes).length}</p>
    <div className="map-options">
      <label><input type="checkbox" checked={onlyClosed} onChange={event => setOnlyClosed(event.target.checked)} /> Приглушить уже пройденное</label>
      <label><input type="checkbox" checked={reveal} onChange={event => setReveal(event.target.checked)} /> Раскрыть закрытые сцены (спойлеры)</label>
    </div>
    <nav className="tree-chapters" aria-label="Перейти к главе на общем древе">{chapters.map(({ chapter, node }) => <button key={chapter} onClick={() => jump(node.id)}>{story[node.source].chapterTitle}</button>)}<button onClick={() => jump(`ending:${Object.keys(endingNodes)[0]}`)}>Финалы</button></nav>
    <div className="tree-toolbar"><button onClick={() => pan(-1)} aria-label="Прокрутить древо влево">←</button><span>Все главы · листай слева направо</span><button onClick={() => pan(1)} aria-label="Прокрутить древо вправо">→</button><label>Масштаб <select value={zoom} onChange={event => setZoom(Number(event.target.value))}><option value={.65}>65%</option><option value={.85}>85%</option><option value={1}>100%</option><option value={1.25}>125%</option></select></label></div>
    {/* Keyboard focus lets keyboard-only users scroll the two-dimensional map. */}
    {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
    <div className="tree-viewport" ref={viewport} tabIndex={0} role="region" aria-label="Горизонтальное древо. Используйте прокрутку или клавиши со стрелками."
      onPointerDown={event => { if (event.pointerType !== "mouse" || (event.target as HTMLElement).closest("button")) return; drag.current = { x: event.clientX, left: event.currentTarget.scrollLeft }; event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={event => { if (drag.current) event.currentTarget.scrollLeft = drag.current.left - (event.clientX - drag.current.x); }}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      <div style={{ width: graph.width * zoom, height: graph.height * zoom }}><div className="tree-canvas" style={{ width: graph.width, height: graph.height, transform: `scale(${zoom})` }}>
        <svg width={graph.width} height={graph.height} className="tree-lines" aria-hidden="true">{graph.edges.map(edge => {
          const from = byId.get(edge.from)!; const to = byId.get(edge.to)!;
          const passed = edge.decision ? decisions.has(edge.decision) && (to.kind !== "ending" || done(to)) : done(from) && done(to);
          const x1 = from.x + 224, y1 = from.y + 56, x2 = to.x, y2 = to.y + 56;
          return <path key={`${edge.from}->${edge.to}`} className={passed ? "passed" : ""} d={`M${x1},${y1} C${x1 + (x2 - x1) / 2},${y1} ${x2 - (x2 - x1) / 2},${y2} ${x2},${y2}`} />;
        })}</svg>
        {chapters.map(({ chapter, node }) => <span className="tree-chapter-label" key={chapter} style={{ left: node.x }}>{story[node.source].chapterTitle}</span>)}
        {graph.nodes.map(node => <button key={node.id} style={{ left: node.x, top: node.y }} className={`tree-node kind-${node.kind} ${done(node) ? "is-done" : "is-locked"} ${mode === "current" && node.id === activeId ? "is-active" : ""} ${onlyClosed && done(node) ? "is-muted" : ""}`} aria-pressed={selected === node.id} onClick={() => setSelected(node.id)}>
          <span>{mode === "current" && node.id === activeId ? "● Сейчас здесь" : done(node) ? "✓ Пройдено" : "○ Не пройдено"} · {node.kind === "choice" ? `Ответ ${node.index! + 1}` : node.kind === "ending" ? "Финал" : "Сцена"}</span>
          <b>{known(node) || node.kind === "ending" ? node.label : "Неизвестная сцена"}</b>
          <small>{node.kind === "scene" && known(node) ? story[node.source].date : "Нажми, чтобы посмотреть"}</small>
        </button>)}
      </div></div>
    </div>
    <p className="map-legend">Голубое — пройдено · золотое — текущая сцена · пунктир — не пройдено. Линии показывают развилки и места, где пути снова сходятся.</p>
    {detail && <article className="tree-detail"><h3>{known(detail) || detail.kind === "ending" ? detail.label : "Сцена пока закрыта"}</h3><p>{!known(detail) ? "Текст откроется после прохождения. Можно включить спойлеры выше." : detail.kind === "choice" ? `${detail.label} — ${story[detail.source].choices![detail.index!].consequence}` : detail.kind === "ending" ? endingNodes[detail.source].text : story[detail.source].text}</p></article>}
    <p className="panel-footnote">Просмотр древа не меняет сейв. Общий прогресс сохраняется между играми. Старые сейвы восстанавливают только однозначные выборы; ранее удалённые прохождения восстановить нельзя. Связи с финалами зависят от накопленных показателей.</p>
  </section>;
}
