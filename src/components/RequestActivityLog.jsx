import { useCallback, useEffect, useState } from "react";
import "./RequestActivityLog.css";

const API_URL = "/api";

const STATUS_LABELS = {
  PENDING: "Pending Review",
  PROCESSING: "Being Processed",
  COMPLETED: "Completed",
  REJECTED: "Rejected",
  "Pending Review": "Pending Review",
  "Being Processed": "Being Processed",
};

const STATUS_TONES = {
  PENDING: "pending",
  PROCESSING: "processing",
  COMPLETED: "completed",
  REJECTED: "rejected",
  "Pending Review": "pending",
  "Being Processed": "processing",
  Completed: "completed",
  Rejected: "rejected",
};

const formatTimestamp = (iso) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
};

function StatusPill({ status }) {
  if (!status) return <span className="rsh-pill rsh-pill--none">None</span>;
  const value = String(status);
  return (
    <span className={`rsh-pill rsh-pill--${STATUS_TONES[value] || "none"}`}>
      {STATUS_LABELS[value] || value}
    </span>
  );
}

export default function RequestActivityLog({ controlNumber, refreshKey = 0 }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async (signal) => {
    if (!controlNumber) {
      setLogs([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `${API_URL}/requests/${encodeURIComponent(controlNumber)}/status-history`,
        { credentials: "include", signal }
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      setLogs(json.logs || []);
    } catch (err) {
      if (err.name !== "AbortError") {
        setError(
          err.message.includes("401")
            ? "Your session has expired. Please log in again."
            : err.message.includes("403")
              ? "You don't have permission to view this history."
              : "Couldn't load the activity log."
        );
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [controlNumber]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load, refreshKey]);

  return (
    <section className="rsh" aria-live="polite">
      <h3 className="rsh-heading">Activity Log</h3>
      {loading && <p className="rsh-muted">Loading history...</p>}
      {error && (
        <p className="rsh-error">
          {error} <button className="rsh-retry" onClick={() => load()}>Retry</button>
        </p>
      )}
      {!loading && !error && logs.length === 0 && (
        <p className="rsh-muted">No status changes recorded yet.</p>
      )}
      {!loading && !error && logs.length > 0 && (
        <ol className="rsh-timeline">
          {logs.map((log) => (
            <li key={log.id} className="rsh-item">
              <span className="rsh-dot" aria-hidden="true" />
              <div className="rsh-transition">
                <StatusPill status={log.old_status} />
                <span className="rsh-arrow" aria-hidden="true">→</span>
                <StatusPill status={log.new_status} />
              </div>
              <div className="rsh-by">by <strong>{log.changed_by || "Unknown"}</strong></div>
              <time className="rsh-when" dateTime={log.changed_at}>
                {formatTimestamp(log.changed_at)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}