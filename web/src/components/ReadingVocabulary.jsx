import { useId, useState } from "react";
import HighlightToggle from "./HighlightToggle";

export default function ReadingVocabulary({ summary, active, onChange }) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  if (!summary?.total) return null;
  return (
    <div className="reading-vocabulary">
      <div className="reading-vocabulary-row">
        <span>已匹配 {summary.used}/{summary.total} 词</span>
        {summary.missing.length ? (
          <button className="reading-missing-toggle" type="button" aria-expanded={expanded} aria-controls={listId}
            onClick={() => setExpanded((current) => !current)}>
            · 未匹配 {summary.missing.length} 词 <span aria-hidden="true">{expanded ? "▾" : "▸"}</span>
          </button>
        ) : null}
        <HighlightToggle active={active} onChange={onChange} />
      </div>
      {expanded && summary.missing.length ? (
        <div className="reading-missing-words" id={listId}>
          {summary.missing.map((word) => <span key={`${word.id}-${word.spelling}`}>{word.spelling}</span>)}
        </div>
      ) : null}
    </div>
  );
}
