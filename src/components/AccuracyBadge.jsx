import "./AccuracyBadge.css";

export default function AccuracyBadge({ value }) {
  const tier = value >= 90 ? "high" : value >= 70 ? "medium" : "low";
  return (
    <span
      className={`accuracy-badge accuracy-${tier}`}
      title="How closely this record matches your search"
    >
      {value}% match
    </span>
  );
}