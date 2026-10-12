import "./LiveIndicator.css";

const LABELS = {
  live: "Live",
  connecting: "Connecting…",
  polling: "Auto-refreshing",
  offline: "Offline",
  unconfigured: "Wala i-configure",
};

export default function LiveIndicator({ status = "connecting", lastUpdated }) {
  return (
    <div className={`live-indicator live-indicator--${status}`}>
      <span className="live-indicator__dot" />
      <span>{LABELS[status] ?? status}</span>
      {lastUpdated && (
        <span className="live-indicator__time">
          {lastUpdated.toLocaleTimeString()}
        </span>
      )}
    </div>
  );
}