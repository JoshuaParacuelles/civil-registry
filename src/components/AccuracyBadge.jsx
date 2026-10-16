import "./AccuracyBadge.css";

export default function AccuracyBadge({ value }) {
  const pct = Math.round(Number(value) || 0);
  const tier = pct >= 90 ? "high" : pct >= 70 ? "medium" : "low";

  return (
    <span
      className={`accuracy-badge accuracy-${tier}`}
      title="How closely this record matches your search"
    >
      {pct}% match
    </span>
  );
}