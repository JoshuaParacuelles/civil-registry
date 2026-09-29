import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import "./AuditLogs.css";

// Relative on purpose. In dev, the Vite proxy forwards /api to Flask; on
// Vercel, the rewrite in vercel.json forwards /api to Render. Either way the
// browser only ever talks to its own origin, so the session cookie is
// first-party and no CORS is involved. Never hardcode http://localhost here.
const API_URL = "/api";

// Each action maps to a small set of semantic tones instead of its own
// colour + emoji. Tones are rendered as a status dot in the table and the
// summary bar (see AuditLogs.css: .audit-tone-dot--*).
//   success  – something completed / granted
//   danger   – failed, blocked or destructive
//   warning  – changes that alter existing data
//   info     – read / transfer activity
//   neutral  – session and navigation noise
const ACTION_CONFIG = {
  LOGIN:          { label: "Login",           tone: "success" },
  LOGIN_FAILED:   { label: "Login Failed",    tone: "danger"  },
  LOGIN_LOCKED:   { label: "Account Locked",  tone: "danger"  },
  LOGOUT:         { label: "Logout",          tone: "neutral" },
  VIEW:           { label: "Viewed",          tone: "info"    },
  SEARCH:         { label: "Searched",        tone: "info"    },
  UPLOAD:         { label: "Uploaded",        tone: "info"    },
  DOWNLOAD:       { label: "Downloaded",      tone: "info"    },
  ARCHIVE:        { label: "Archived",        tone: "warning" },
  RESTORE:        { label: "Restored",        tone: "success" },
  DELETE:         { label: "Deleted",         tone: "danger"  },
  TRANSACTION:    { label: "Transaction",     tone: "success" },
  ACCOUNT_UPDATE: { label: "Account Updated", tone: "warning" },
  NAVIGATE:       { label: "Navigated",       tone: "neutral" },
};

// Actions that aren't in ACTION_CONFIG (e.g. LOGOUT_BEACON) used to show up
// as raw SNAKE_CASE. Turn them into a readable label instead.
const humanizeAction = (action) => {
  const text = (action || "Unknown")
    .toString()
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
  return text || "Unknown";
};

const getActionConfig = (action) =>
  ACTION_CONFIG[action] || { label: humanizeAction(action), tone: "neutral" };

export const logAction = async (action, description, meta = {}) => {
  try {
    await fetch(`${API_URL}/audit/log`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, description, meta }),
    });
  } catch (error) {
    console.error("Audit log failed:", error);
  }
};

const formatTime = (iso) => {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
};

const formatDate = (iso) => {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
};

const timeAgo = (iso) => {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const diff = Date.now() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return formatDate(iso);
};

const parseMeta = (meta) => {
  if (!meta) return null;
  try {
    if (typeof meta === "string") return JSON.parse(meta);
    if (typeof meta === "object") return meta;
    return null;
  } catch {
    try { return JSON.parse(meta.replace(/'/g, '"')); }
    catch { return meta; }
  }
};

const describeLoadError = (error) => {
  const msg = error?.message || "";
  if (msg.includes("401")) return "Your session has expired. Please log in again.";
  if (msg.includes("403")) return "Your account doesn't have permission to view audit logs.";
  return `The server didn't respond (${msg || "unknown error"}). If it was idle, it may still be waking up — try Refresh in a minute.`;
};

/* ── Small inline icons (replace the emoji glyphs) ─────────────────────── */
const IconRefresh = () => (
  <svg className="audit-icon" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="23 4 23 10 17 10" />
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
  </svg>
);

const IconDownload = () => (
  <svg className="audit-icon" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const IconTrash = () => (
  <svg className="audit-icon" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>
);

const IconSearch = () => (
  <svg className="audit-icon" viewBox="0 0 24 24" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const IconChevron = () => (
  <svg className="audit-icon" viewBox="0 0 24 24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const AnimatedCount = ({ value }) => {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);
  const rafRef = useRef(null);

  useEffect(() => {
    const start = prevRef.current;
    const end = value;
    if (start === end) { setDisplay(end); return; }
    const duration = 700;
    const startTime = performance.now();
    const tick = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setDisplay(Math.round(start + (end - start) * ease));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        prevRef.current = end;
      }
    };
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [value]);

  return <>{display.toLocaleString()}</>;
};

const buildPageRange = (currentPage, totalPages) => {
  const delta = 2;
  const range = [];
  const result = [];
  const left = Math.max(2, currentPage - delta);
  const right = Math.min(totalPages - 1, currentPage + delta);
  range.push(1);
  for (let i = left; i <= right; i += 1) range.push(i);
  if (totalPages > 1) range.push(totalPages);
  let prev;
  for (const page of range) {
    if (prev && page - prev > 1) result.push("...");
    result.push(page);
    prev = page;
  }
  return result;
};

const ROWS_PER_PAGE = 12;
const FETCH_LIMIT = 100;
// How often new log rows are checked for in the background. Kept generous so
// a slow or cold-starting backend isn't hammered.
const POLL_MS = 30000;

const AuditLogs = () => {
  const [logs, setLogs] = useState([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  const sentinelRef = useRef(null);

  // Latest values for the background refresh, so it can merge new rows
  // without depending on (and re-creating itself for) every state change.
  const logsRef = useRef([]);
  const filterRef = useRef(filterAction);
  useEffect(() => { logsRef.current = logs; }, [logs]);
  useEffect(() => { filterRef.current = filterAction; }, [filterAction]);

  const fetchInitial = useCallback(async () => {
    setLoading(true);
    setError(null);
    setLogs([]);
    setOffset(0);
    setHasMore(true);
    setExpandedId(null);
    try {
      const params = new URLSearchParams({ limit: String(FETCH_LIMIT), offset: "0" });
      if (filterAction) params.append("action", filterAction);
      const response = await fetch(`${API_URL}/audit/history?${params.toString()}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      const data = Array.isArray(json) ? json : json.data ?? [];
      setLogs(data);
      setOffset(data.length);
      setHasMore(data.length === FETCH_LIMIT);
      setCurrentPage(1);
    } catch (err) {
      console.error("Failed to fetch audit logs:", err);
      setLogs([]);
      setOffset(0);
      setHasMore(false);
      setError(describeLoadError(err));
    } finally {
      setLoading(false);
    }
  }, [filterAction]);

  const fetchMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({ limit: String(FETCH_LIMIT), offset: String(offset) });
      if (filterAction) params.append("action", filterAction);
      const response = await fetch(`${API_URL}/audit/history?${params.toString()}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      const data = Array.isArray(json) ? json : json.data ?? [];
      setLogs((prev) => [...prev, ...data]);
      setOffset((prev) => prev + data.length);
      setHasMore(data.length === FETCH_LIMIT);
    } catch (err) {
      console.error("Failed to load more audit logs:", err);
    } finally {
      setLoadingMore(false);
    }
  }, [filterAction, hasMore, loadingMore, offset]);

  // Background refresh: fetches the newest page and PREPENDS only rows we
  // don't already have. It never clears the table, never shows the loading
  // spinner, and never throws away pages the user has already scrolled
  // through, so the table doesn't flicker on a slow backend.
  const refreshSilently = useCallback(async () => {
    const filterAtStart = filterAction;
    try {
      const params = new URLSearchParams({ limit: String(FETCH_LIMIT), offset: "0" });
      if (filterAtStart) params.append("action", filterAtStart);
      const response = await fetch(`${API_URL}/audit/history?${params.toString()}`, {
        credentials: "include",
      });
      if (!response.ok) return;
      const json = await response.json();
      const data = Array.isArray(json) ? json : json.data ?? [];

      // The filter changed while this request was in flight; drop the result.
      if (filterRef.current !== filterAtStart) return;

      const known = new Set(logsRef.current.map((log) => log.id));
      const fresh = data.filter((log) => !known.has(log.id));
      if (fresh.length === 0) return;

      setLogs((prev) => [...fresh, ...prev]);
      setOffset((prev) => prev + fresh.length);
    } catch (err) {
      console.warn("Background audit refresh failed:", err);
    }
  }, [filterAction]);

  useEffect(() => { fetchInitial(); }, [fetchInitial]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.hidden || loading || loadingMore) return;
      refreshSilently();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [refreshSilently, loading, loadingMore]);

  useEffect(() => {
    const element = sentinelRef.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMore && !loadingMore && !loading) fetchMore();
      },
      { threshold: 0.1 }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [fetchMore, hasMore, loading, loadingMore]);

  const actionTypes = Object.keys(ACTION_CONFIG);

  const filtered = useMemo(() => {
    if (!search.trim()) return logs;
    const q = search.toLowerCase();
    return logs.filter((log) => {
      return (
        (log.description || "").toLowerCase().includes(q) ||
        (log.username || "").toLowerCase().includes(q) ||
        (log.action || "").toLowerCase().includes(q) ||
        (log.ip_address || "").toLowerCase().includes(q)
      );
    });
  }, [logs, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ROWS_PER_PAGE));

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const paginated = useMemo(() => {
    const start = (currentPage - 1) * ROWS_PER_PAGE;
    return filtered.slice(start, start + ROWS_PER_PAGE);
  }, [filtered, currentPage]);

  const handleClear = async () => {
    try {
      const response = await fetch(`${API_URL}/audit/clear`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setLogs([]);
      setOffset(0);
      setHasMore(false);
      setCurrentPage(1);
      setExpandedId(null);
    } catch (err) {
      console.error("Clear failed:", err);
    } finally {
      setShowClearConfirm(false);
    }
  };

  const exportCSV = () => {
    const headers = ["Timestamp", "User", "IP", "Action", "Description"];
    const rows = logs.map((log) => [
      log.created_at ? new Date(log.created_at).toLocaleString("en-PH") : "—",
      log.username || "System",
      log.ip_address || "—",
      log.action || "—",
      `"${(log.description || "").replace(/"/g, "'")}"`,
    ]);
    const csv = [headers, ...rows].map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit_logs_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const summaryCounts = useMemo(() => {
    const counts = {};
    logs.forEach((log) => {
      const action = log.action || "UNKNOWN";
      counts[action] = (counts[action] || 0) + 1;
    });
    return counts;
  }, [logs]);

  const topActions = useMemo(() => {
    return Object.entries(summaryCounts).sort((a, b) => b[1] - a[1]).slice(0, 4);
  }, [summaryCounts]);

  const todayCount = useMemo(() => {
    const today = new Date().toDateString();
    return logs.filter((log) => log.created_at && new Date(log.created_at).toDateString() === today).length;
  }, [logs]);

  const pageRange = buildPageRange(currentPage, totalPages);

  return (
    <div className="audit-page">

      {/* ── Header ── */}
      <div className="audit-header">
        <div className="audit-header-left">
          <div>
            <h2 className="audit-title">Audit Logs</h2>
            <p className="audit-subtitle">Monitor user activities and system actions in real time.</p>
          </div>
        </div>
        <div className="audit-header-actions">
          <button className="audit-btn-refresh" onClick={fetchInitial}>
            <IconRefresh /> Refresh
          </button>
          <button className="audit-btn-export" onClick={exportCSV}>
            <IconDownload /> Print Auditlogs
          </button>
          <span className="audit-header-divider" aria-hidden="true" />
          <button className="audit-btn-clear" onClick={() => setShowClearConfirm(true)}>
            <IconTrash /> Clear Logs
          </button>
        </div>
      </div>

      {/* ── Summary Strip ── */}
      <div className="audit-summary-strip">
        <div className="audit-summary-item">
          <span className="audit-summary-num">
            <AnimatedCount value={logs.length} />
            {hasMore && <span className="audit-summary-plus">+</span>}
          </span>
          <span className="audit-summary-label">Total Actions</span>
        </div>

        <div className="audit-summary-divider" />

        <div className="audit-summary-item">
          <span className="audit-summary-num"><AnimatedCount value={todayCount} /></span>
          <span className="audit-summary-label">Today</span>
        </div>

        <div className="audit-summary-divider" />

        {topActions.map(([action, count], index) => {
          const cfg = getActionConfig(action);
          return (
            <React.Fragment key={action}>
              <div className="audit-summary-item">
                <span className="audit-summary-num"><AnimatedCount value={count} /></span>
                <span className="audit-summary-label">
                  <span className={`audit-tone-dot audit-tone-dot--${cfg.tone}`} />
                  {cfg.label}
                </span>
              </div>
              {index !== topActions.length - 1 && <div className="audit-summary-divider" />}
            </React.Fragment>
          );
        })}

        <div className="audit-summary-divider" />

        <div className="audit-summary-item">
          <span className="audit-summary-num audit-summary-num--text">
            {logs[0] ? timeAgo(logs[0].created_at) : "—"}
          </span>
          <span className="audit-summary-label">Last Activity</span>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="audit-filters">
        <div className="audit-search-wrap">
          <span className="audit-search-icon"><IconSearch /></span>
          <input
            className="audit-search-input"
            placeholder="Search actions, descriptions, users..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
          />
          {search && (
            <button className="audit-search-clear" onClick={() => { setSearch(""); setCurrentPage(1); }}>✕</button>
          )}
        </div>

        <select
          className="audit-select"
          value={filterAction}
          onChange={(e) => { setFilterAction(e.target.value); setCurrentPage(1); }}
        >
          <option value="">All Actions</option>
          {actionTypes.map((action) => (
            <option key={action} value={action}>
              {ACTION_CONFIG[action]?.label || action}
            </option>
          ))}
        </select>

        <span className="audit-result-count">
          {filtered.length}{hasMore ? "+" : ""} result{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ── Table ── */}
      <div className="audit-table-wrap">
        {paginated.length === 0 ? (
          loading ? (
            <div className="audit-loading">
              <div className="audit-spinner" />
              <h3 className="loading-title">Loading…</h3>
              <p>Please wait while we fetch your records</p>
            </div>
          ) : (
            <div className="audit-empty">
              <div style={{ padding: 48, textAlign: "center" }}>
                <h3>{error ? "Couldn't load audit logs" : "No records found"}</h3>
                <p>{error || "We couldn't find any audit logs for the selected filters."}</p>
                <div style={{ marginTop: 14 }}>
                  <button className="audit-btn-refresh" onClick={fetchInitial}>
                    <IconRefresh /> Retry
                  </button>
                </div>
              </div>
            </div>
          )
        ) : (
          <div className="audit-table-scroll">
            <table className="audit-table">
              <thead>
                <tr className="audit-thead-row">
                  <th className="audit-th">Time</th>
                  <th className="audit-th">User</th>
                  <th className="audit-th">Action</th>
                  <th className="audit-th">Description</th>
                  <th className="audit-th">IP Address</th>
                  <th className="audit-th audit-th-center">Details</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((log, idx) => {
                  const cfg = getActionConfig(log.action);
                  const isExpanded = expandedId === log.id;
                  const parsedMeta = parseMeta(log.meta);

                  return (
                    <React.Fragment key={log.id || `${log.created_at}-${idx}`}>
                      <tr className={`audit-tr ${idx % 2 === 0 ? "audit-tr-even" : "audit-tr-odd"}`}>
                        <td className="audit-td audit-td-time">
                          <span className="audit-time">{formatTime(log.created_at)}</span>
                          <span className="audit-date">{formatDate(log.created_at)}</span>
                        </td>

                        <td className="audit-td">
                          <span className="audit-user-chip">
                            <span className="audit-user-avatar">
                              {(log.username || "S")[0].toUpperCase()}
                            </span>
                            {log.username || "System"}
                          </span>
                        </td>

                        <td className="audit-td">
                          <span className={`audit-action-badge audit-action-badge--${cfg.tone}`}>
                            <span className={`audit-tone-dot audit-tone-dot--${cfg.tone}`} />
                            {cfg.label}
                          </span>
                        </td>

                        <td className="audit-td audit-td-desc">{log.description || "—"}</td>
                        <td className="audit-td audit-td-ip">{log.ip_address || "—"}</td>

                        <td className="audit-td audit-td-center">
                          {parsedMeta && (
                            <button
                              className={`audit-expand-btn ${isExpanded ? "expanded" : ""}`}
                              onClick={() => setExpandedId(isExpanded ? null : log.id)}
                              aria-label={isExpanded ? "Hide details" : "Show details"}
                              aria-expanded={isExpanded}
                            >
                              <IconChevron />
                            </button>
                          )}
                        </td>
                      </tr>

                      {isExpanded && parsedMeta && (
                        <tr className="audit-meta-row">
                          <td colSpan={6} className="audit-meta-td">
                            <div className="audit-meta-content">
                              {typeof parsedMeta === "object" && !Array.isArray(parsedMeta) ? (
                                Object.entries(parsedMeta).map(([key, value]) => (
                                  <div className="audit-meta-item" key={key}>
                                    <span className="audit-meta-key">{key}</span>
                                    <span className="audit-meta-val">{String(value)}</span>
                                  </div>
                                ))
                              ) : (
                                <span className="audit-meta-val">{String(parsedMeta)}</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div ref={sentinelRef} style={{ height: 1 }} />

        {loadingMore && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            gap: 10, padding: "12px 0", color: "#64748b", fontSize: 12.5,
          }}>
            <div className="audit-spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
            Loading more logs…
          </div>
        )}
      </div>

      {/* ── Pagination ── */}
      {filtered.length > ROWS_PER_PAGE && (
        <div className="audit-pagination">
          <span className="audit-page-info">
            Showing {Math.min((currentPage - 1) * ROWS_PER_PAGE + 1, filtered.length)}–
            {Math.min(currentPage * ROWS_PER_PAGE, filtered.length)} of {filtered.length}
            {hasMore ? "+" : ""}
          </span>

          <div className="audit-page-btns">
            <button className="audit-page-btn" disabled={currentPage === 1} onClick={() => setCurrentPage(1)}>«</button>
            <button className="audit-page-btn" disabled={currentPage === 1} onClick={() => setCurrentPage((p) => p - 1)}>‹</button>

            {pageRange.map((page, index) =>
              page === "..." ? (
                <span key={`ellipsis-${index}`} className="audit-page-btn audit-page-ellipsis">…</span>
              ) : (
                <button
                  key={page}
                  className={`audit-page-btn ${currentPage === page ? "audit-page-btn-active" : ""}`}
                  onClick={() => setCurrentPage(page)}
                >
                  {page}
                </button>
              )
            )}

            <button className="audit-page-btn" disabled={currentPage === totalPages} onClick={() => setCurrentPage((p) => p + 1)}>›</button>
            <button className="audit-page-btn" disabled={currentPage === totalPages} onClick={() => setCurrentPage(totalPages)}>»</button>
          </div>
        </div>
      )}

      {/* ── Clear Confirm Modal ── */}
      {showClearConfirm && (
        <div className="audit-modal-overlay" onClick={() => setShowClearConfirm(false)}>
          <div className="audit-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="audit-modal-title">Clear Audit Logs?</h3>
            <p className="audit-modal-text">
              This will permanently remove all audit history records. This action cannot be undone.
            </p>
            <div className="audit-modal-actions">
              <button className="audit-modal-cancel" onClick={() => setShowClearConfirm(false)}>Cancel</button>
              <button className="audit-modal-confirm" onClick={handleClear}>Yes, Clear</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuditLogs;