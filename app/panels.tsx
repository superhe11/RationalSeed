"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { endingNodes, story } from "./story";
import { endingHints, type Library, type SavedGame, type SaveState } from "./saves";
import { RouteMap } from "./route-map";

export type Panel = "menu" | "saves" | "map" | "endings" | "updates";
const panelLabels: Record<Panel, string> = { menu: "Меню", saves: "Сохранения", map: "Карта", endings: "Концовки", updates: "Обновления" };
type Props = {
  panel: Panel; onPanel: (panel: Panel) => void; onClose: () => void;
  library: Library; currentSave: SaveState; canSave: boolean; onLoad: (save: SaveState) => void;
  onSave: (index: number) => void; onDelete: (index: number) => void;
  onReset: () => void; onTitle: () => void; soundOn: boolean; onSound: () => void;
  showHud: boolean; onHud: () => void; locked: boolean; updateContent: ReactNode;
};

export function GamePanel(props: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [confirmation, setConfirmation] = useState<{ text: string; run: () => void } | null>(null);
  const [reading, setReading] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { el?.close(); document.body.style.overflow = originalOverflow; };
  }, []);
  const changePanel = (panel: Panel) => { setReading(null); setConfirmation(null); setStatus(""); props.onPanel(panel); };
  const load = (save: SavedGame) => setConfirmation({ text: "Загрузить этот момент? Текущее автосохранение будет заменено. Ручные слоты останутся.", run: () => props.onLoad(save) });
  const viewing = reading && props.library.unlocked.includes(reading) ? endingNodes[reading] : null;

  return <dialog className={`game-panel ${props.panel === "map" ? "tree-panel" : ""}`} ref={dialog} aria-labelledby="panel-heading" onCancel={event => { event.preventDefault(); props.onClose(); }}>
    <div className="panel-heading"><h2 id="panel-heading">{panelLabels[props.panel]}</h2><button className="close-panel" disabled={props.locked} onClick={props.onClose} aria-label="Закрыть меню">×</button></div>
    <nav className="panel-nav" aria-label="Разделы меню">
      {(Object.keys(panelLabels) as Panel[]).map(panel => <button key={panel} aria-current={props.panel === panel ? "page" : undefined} disabled={props.locked} onClick={() => changePanel(panel)}>{panelLabels[panel]}</button>)}
    </nav>
    <div className="panel-body">
      {confirmation ? <section className="confirmation" aria-label="Подтверждение">
        <p>{confirmation.text}</p><div className="panel-actions"><button className="primary-button" onClick={() => { confirmation.run(); setConfirmation(null); }}>Подтвердить</button><button className="text-button" onClick={() => setConfirmation(null)}>Отмена</button></div>
      </section> : <>
        {props.panel === "menu" && <div className="menu-actions">
          <button className="primary-button" onClick={props.onClose}>Вернуться</button>
          <button onClick={props.onSound} aria-pressed={props.soundOn}>Звук: {props.soundOn ? "включён" : "выключен"}</button>
          <button onClick={props.onHud} aria-pressed={props.showHud}>Шкалы: {props.showHud ? "видны" : "скрыты"}</button>
          <button onClick={props.onTitle}>На титульный экран</button>
          <button onClick={() => setConfirmation({ text: "Начать заново? Автосейв заменится, но ручные сохранения и открытые концовки останутся.", run: props.onReset })}>Начать новую игру</button>
        </div>}
        {props.panel === "saves" && <>
          <p className="panel-intro">Автосейв обновляется после каждой реплики. Ручные слоты не меняются, пока вы сами их не перезапишете.</p>
          <article className="save-slot"><h3>Автосохранение</h3><SaveDescription save={props.library.auto} />{props.library.auto && <button className="text-button" onClick={() => load(props.library.auto!)}>Загрузить автосохранение</button>}</article>
          <div className="slot-grid">{props.library.slots.map((save, index) => <article key={index} className="save-slot">
            <h3>Слот {index + 1}</h3><SaveDescription save={save} />
            <div className="panel-actions">
              <button className="text-button" disabled={!props.canSave} onClick={() => {
                const run = () => { props.onSave(index); setStatus(`Слот ${index + 1} сохранён.`); };
                if (save) setConfirmation({ text: `Перезаписать слот ${index + 1}? Старый момент в этом слоте будет заменён.`, run }); else run();
              }}>{save ? "Перезаписать" : "Сохранить"}</button>
              {save && <><button className="text-button" onClick={() => load(save)}>Загрузить</button><button className="text-button" onClick={() => setConfirmation({ text: `Удалить слот ${index + 1}? Остальные сохранения и концовки останутся.`, run: () => { props.onDelete(index); setStatus(`Слот ${index + 1} удалён.`); } })}>Удалить</button></>}
            </div>
          </article>)}</div>
          <p className="panel-footnote">Сохранения на этом устройстве. Обновление их не удаляет; очистка данных или удаление приложения — удаляет.</p>
        </>}
        {props.panel === "endings" && (viewing ? <article className="ending-reader">
          <button className="text-button" onClick={() => setReading(null)}>← Все концовки</button>
          <h3>{viewing.chapterTitle}</h3><p className="dialogue-text">{viewing.text}</p><p className="aside">{viewing.aside}</p>
          <p className="panel-footnote">Это перечитывание. Ваш текущий прогресс не изменён.</p>
        </article> : <>
          <p className="panel-intro">Открыто {props.library.unlocked.length} из {Object.keys(endingNodes).length}. Новая игра не сбрасывает коллекцию.</p>
          <div className="ending-grid">{Object.entries(endingNodes).map(([id, ending], i) => {
            const unlocked = props.library.unlocked.includes(id);
            return <article key={id} className={`ending-card ${unlocked ? "unlocked" : "locked"}`}>
              <span className="ending-number">0{i + 1} / {unlocked ? "Открыта" : "Закрыта"}</span>
              <h3>{ending.chapterTitle.replace("Финал · ", "")}</h3>
              <p>{endingHints[id]}</p>
              {unlocked ? <button className="text-button" onClick={() => setReading(id)}>Перечитать →</button> : <span className="locked-note">Текст откроется после прохождения</span>}
            </article>;
          })}</div>
        </>)}
        {props.panel === "map" && <RouteMap library={props.library} current={props.currentSave} hasRun={props.canSave} />}
        {props.panel === "updates" && props.updateContent}
      </>}
      <p className="panel-status" role="status">{status}</p>
    </div>
  </dialog>;
}

function SaveDescription({ save }: { save: SavedGame | null }) {
  if (!save) return <p className="slot-empty">Пусто</p>;
  const node = save.endingId ? endingNodes[save.endingId] : story[save.nodeId];
  return <div className="save-description"><b>{node.chapterTitle}</b><p>{node.speaker} · {node.date}</p><time dateTime={save.savedAt}>{new Date(save.savedAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</time><p>Реплика {save.history.length + 1} · границы {save.stats.boundaries} / самоконтроль {save.stats.selfControl} / давление {save.stats.pressure}</p></div>;
}
