"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { endingNodes, story } from "./story";
import { routeProgress, type Library, type SaveState } from "./saves";
import { buildRouteGraph, type GraphNode } from "./route-graph";

export function RouteMap({ library, current, hasRun }: { library: Library; current: SaveState; hasRun: boolean }) {
  const [compact, setCompact] = useState(false);
  const [settings, setSettings] = useState(false);
  const graph = useMemo(() => buildRouteGraph(compact), [compact]);
  const byId = useMemo(() => new Map(graph.nodes.map(node => [node.id, node])), [graph]);
  const chapters = useMemo(() => [...new Set(Object.values(story).map(node => node.chapter))].map(chapter => ({ chapter, node: graph.nodes.filter(node => node.chapter === chapter && node.kind === "scene").sort((a, b) => a.x - b.x)[0] })), [graph]);
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
  const initialId = useRef(activeId || "prologue");
  useEffect(() => {
    const media = window.matchMedia("(max-width: 820px)");
    const resize = () => { setCompact(media.matches); setZoom(media.matches ? .85 : 1); };
    resize(); media.addEventListener("change", resize);
    return () => media.removeEventListener("change", resize);
  }, []);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const node = byId.get(initialId.current); const el = viewport.current;
      if (node && el) el.scrollTo({ left: Math.max(0, node.x * (compact ? .85 : 1) - 16), top: Math.max(0, (node.y + graph.nodeHeight / 2) * (compact ? .85 : 1) - el.clientHeight / 2) });
    });
    return () => cancelAnimationFrame(frame);
  }, [byId, compact, graph.nodeHeight]);
  const done = (node: GraphNode) => node.kind === "choice" ? decisions.has(node.id) : node.kind === "ending" ? unlocked.has(node.source) : visited.has(node.source);
  const known = (node: GraphNode) => reveal || (node.kind === "choice" ? visited.has(node.source) : done(node));
  const jump = (id: string) => { const node = byId.get(id); const el = viewport.current; if (node && el) el.scrollTo({ left: Math.max(0, node.x * zoom - 16), top: Math.max(0, (node.y + graph.nodeHeight / 2) * zoom - el.clientHeight / 2), behavior: "smooth" }); };
  const changeZoom = (next: number) => {
    const el = viewport.current; if (!el) return;
    const x = (el.scrollLeft + el.clientWidth / 2) / zoom, y = (el.scrollTop + el.clientHeight / 2) / zoom;
    setZoom(next);
    requestAnimationFrame(() => el.scrollTo({ left: x * next - el.clientWidth / 2, top: y * next - el.clientHeight / 2 }));
  };
  const pan = (direction: number) => viewport.current?.scrollBy({ left: direction * viewport.current.clientWidth * .75, behavior: "smooth" });
  const detail = selected ? byId.get(selected) : null;
  return <section className="route-map" aria-label="Древо всех сюжетных выборов">
    <div className="map-controls">
      <button aria-pressed={mode === "current"} onClick={() => setMode("current")}>Сейчас</button>
      <button aria-pressed={mode === "all"} onClick={() => setMode("all")}>За все игры</button>
      <button className="tree-settings-button" aria-expanded={settings} aria-controls="tree-settings" onClick={() => setSettings(!settings)}>Настройки</button>
    </div>
    <p className="panel-intro" role="status">Ответы {decisions.size}/{graph.nodes.filter(node => node.kind === "choice").length} · сцены {visited.size}/{Object.keys(story).length} · финалы {unlocked.size}/{Object.keys(endingNodes).length}</p>
    {settings && <div id="tree-settings" className="tree-settings"><div className="map-options">
      <label><input type="checkbox" checked={onlyClosed} onChange={event => setOnlyClosed(event.target.checked)} /> Приглушить уже пройденное</label>
      <label><input type="checkbox" checked={reveal} onChange={event => setReveal(event.target.checked)} /> Раскрыть закрытые сцены (спойлеры)</label>
    </div><button className="text-button" onClick={() => setSettings(false)}>Готово</button></div>}
    <div className="tree-toolbar">
      <select className="tree-chapter-select" aria-label="Перейти к главе" defaultValue="" onChange={event => { jump(event.target.value); event.target.value = ""; }}><option value="" disabled>К главе…</option>{chapters.map(({ chapter, node }) => <option key={chapter} value={node.id}>{story[node.source].chapterTitle}</option>)}<option value={`ending:${Object.keys(endingNodes)[0]}`}>Финалы</option></select>
      <button disabled={!hasRun} onClick={() => jump(activeId)} aria-label="К текущей сцене" title="К текущей сцене">◎</button>
      <select aria-label="Масштаб древа" value={zoom} onChange={event => changeZoom(Number(event.target.value))}><option value={.65}>65%</option><option value={.85}>85%</option><option value={1}>100%</option><option value={1.25}>125%</option></select>
    </div>
    {/* Keyboard focus lets keyboard-only users scroll the two-dimensional map. */}
    {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
    <div className="tree-viewport" ref={viewport} tabIndex={0} role="region" aria-label="Горизонтальное древо. Используйте прокрутку или клавиши со стрелками."
      onPointerDown={event => { if (event.pointerType !== "mouse" || (event.target as HTMLElement).closest("button")) return; drag.current = { x: event.clientX, left: event.currentTarget.scrollLeft }; event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={event => { if (drag.current) event.currentTarget.scrollLeft = drag.current.left - (event.clientX - drag.current.x); }}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      <div className="tree-space" style={{ width: graph.width * zoom, height: graph.height * zoom }}><div className="tree-canvas" style={{ width: graph.width, height: graph.height, transform: `scale(${zoom})` }}>
        <svg width={graph.width} height={graph.height} className="tree-lines" aria-hidden="true">{graph.edges.map(edge => {
          const from = byId.get(edge.from)!; const to = byId.get(edge.to)!;
          const passed = edge.decision ? decisions.has(edge.decision) && (to.kind !== "ending" || done(to)) : done(from) && done(to);
          const x1 = from.x + graph.nodeWidth, y1 = from.y + graph.nodeHeight / 2, x2 = to.x, y2 = to.y + graph.nodeHeight / 2;
          return <path key={`${edge.from}->${edge.to}`} className={passed ? "passed" : ""} d={`M${x1},${y1} C${x1 + (x2 - x1) / 2},${y1} ${x2 - (x2 - x1) / 2},${y2} ${x2},${y2}`} />;
        })}</svg>
        {graph.nodes.map(node => <button key={node.id} style={{ left: node.x, top: node.y, width: graph.nodeWidth, height: graph.nodeHeight }} className={`tree-node kind-${node.kind} ${done(node) ? "is-done" : "is-locked"} ${mode === "current" && node.id === activeId ? "is-active" : ""} ${onlyClosed && done(node) ? "is-muted" : ""}`} aria-pressed={selected === node.id} onClick={() => setSelected(node.id)}>
          <span>{mode === "current" && node.id === activeId ? "● Сейчас здесь" : done(node) ? "✓ Пройдено" : "○ Не пройдено"} · {node.kind === "choice" ? `Ответ ${node.index! + 1}` : node.kind === "ending" ? "Финал" : "Сцена"}</span>
          <b>{known(node) || node.kind === "ending" ? node.label : "Неизвестная сцена"}</b>
          <small>{node.kind === "scene" && known(node) ? story[node.source].date : "Нажми, чтобы посмотреть"}</small>
        </button>)}
      </div></div>
    </div>
    <div className="tree-bottom"><button onClick={() => pan(-1)} aria-label="Прокрутить влево">←</button><span>Древо выборов</span><button onClick={() => pan(1)} aria-label="Прокрутить вправо">→</button></div>
    {detail && <article className="tree-detail" aria-label="Описание сцены"><button className="tree-detail-close" aria-label="Закрыть описание" onClick={() => setSelected(null)}>×</button><h3>{known(detail) || detail.kind === "ending" ? detail.label : "Сцена пока закрыта"}</h3><p>{!known(detail) ? "Текст откроется после прохождения. Можно включить спойлеры в настройках." : detail.kind === "choice" ? `${detail.label} — ${story[detail.source].choices![detail.index!].consequence}` : detail.kind === "ending" ? endingNodes[detail.source].text : story[detail.source].text}</p></article>}
  </section>;
}
