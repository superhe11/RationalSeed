"use client";

import { useEffect, useRef } from "react";

export function IntroNotice({ onContinue }: { onContinue: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { element?.close(); document.body.style.overflow = previous; };
  }, []);
  return <dialog ref={dialog} className="game-panel intro-notice" aria-labelledby="intro-heading" aria-describedby="intro-description" onCancel={event => { event.preventDefault(); onContinue(); }}>
    <div className="panel-body">
      <p className="title-kicker">Перед началом</p>
      <h2 id="intro-heading">Это художественная история</h2>
      <p id="intro-description">«Рациональное зерно» — вымышленная сатирическая новелла с собирательными персонажами. Сцены, диалоги и варианты развития событий не следует воспринимать как биографию, документальную реконструкцию или утверждения о поступках конкретных людей.</p>
      <p className="panel-intro">В истории есть грубая лексика, навязчивое общение, сексуальное давление и нарушение личных границ. Изображение такого поведения не означает его одобрения.</p>
      <button className="primary-button" onClick={onContinue}>Понятно, продолжить →</button>
    </div>
  </dialog>;
}
