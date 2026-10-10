export default function HighlightToggle({ active, onChange }) {
  return (
    <button
      className={`reading-highlight-option reading-heading-highlight-option${active ? " is-active" : ""}`}
      type="button"
      aria-pressed={active}
      onClick={() => onChange(!active)}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <path d="m13 3 8 8-7 7-8-8Z" />
        <path d="m6 10-2 5 5 5 5-2M4 15l-2 5h7M14 4l6 6M3 23h9" />
      </svg>
      <span>高亮词汇</span>
    </button>
  );
}
