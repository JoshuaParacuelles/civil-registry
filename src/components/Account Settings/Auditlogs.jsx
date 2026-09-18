import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import "./AuditLogs.css";

const API_URL = "http://localhost:5000/api";

const ACTION_CONFIG = {
  LOGIN:          { label: "Login",           icon: "🔐", color: "#16a34a", bg: "rgba(22,163,74,0.09)",   border: "rgba(22,163,74,0.25)"   },
  LOGIN_FAILED:   { label: "Login Failed",    icon: "❌", color: "#dc2626", bg: "rgba(220,38,38,0.09)",   border: "rgba(220,38,38,0.25)"   },
  LOGIN_LOCKED:   { label: "Account Locked",  icon: "⛔", color: "#b91c1c", bg: "rgba(185,28,28,0.08)",   border: "rgba(185,28,28,0.2)"    },
  LOGOUT:         { label: "Logout",          icon: "🚪", color: "#475569", bg: "rgba(71,85,105,0.08)",   border: "rgba(71,85,105,0.18)"   },
  VIEW:           { label: "Viewed",          icon: "👁️", color: "#2563eb", bg: "rgba(37,99,235,0.09)",   border: "rgba(37,99,235,0.25)"   },
  SEARCH:         { label: "Searched",        icon: "🔍", color: "#7c3aed", bg: "rgba(124,58,237,0.09)",  border: "rgba(124,58,237,0.25)"  },
  UPLOAD:         { label: "Uploaded",        icon: "⬆️", color: "#b45309", bg: "rgba(180,83,9,0.09)",    border: "rgba(180,83,9,0.25)"    },
  DOWNLOAD:       { label: "Downloaded",      icon: "⬇️", color: "#0369a1", bg: "rgba(3,105,161,0.09)",   border: "rgba(3,105,161,0.25)"   },
  ARCHIVE:        { label: "Archived",        icon: "🗂️", color: "#c2410c", bg: "rgba(194,65,12,0.09)",   border: "rgba(194,65,12,0.25)"   },
  RESTORE:        { label: "Restored",        icon: "♻️", color: "#0f766e", bg: "rgba(15,118,110,0.09)",  border: "rgba(15,118,110,0.25)"  },
  DELETE:         { label: "Deleted",         icon: "🗑️", color: "#dc2626", bg: "rgba(220,38,38,0.09)",   border: "rgba(220,38,38,0.25)"   },
  TRANSACTION:    { label: "Transaction",     icon: "💳", color: "#047857", bg: "rgba(4,120,87,0.09)",    border: "rgba(4,120,87,0.25)"    },
  ACCOUNT_UPDATE: { label: "Account Updated", icon: "⚙️", color: "#9d174d", bg: "rgba(157,23,77,0.09)",   border: "rgba(157,23,77,0.25)"   },
  NAVIGATE:       { label: "Navigated",       icon: "🧭", color: "#64748b", bg: "rgba(100,116,139,0.09)", border: "rgba(100,116,139,0.2)"  },
};

export const logAction = async (action, description, meta = {}) => {
  try {
    await fetch(`${API_URL}/audit/log`, {
      method: "POST",
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

const AuditLogs = () => {
  const [logs, setLogs] = useState([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  const sentinelRef = useRef(null);

  const fetchInitial = useCallback(async () => {
    setLoading(true);
    setLogs([]);
    setOffset(0);
    setHasMore(true);
    setExpandedId(null);
    try {
      const params = new URLSearchParams({ limit: String(FETCH_LIMIT), offset: "0" });
      if (filterAction) params.append("action", filterAction);
      const response = await fetch(`${API_URL}/audit/history?${params.toString()}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      const data = Array.isArray(json) ? json : json.data ?? [];
      setLogs(data);
      setOffset(data.length);
      setHasMore(data.length === FETCH_LIMIT);
      setCurrentPage(1);
    } catch (error) {
      console.error("Failed to fetch audit logs:", error);
      setLogs([]);
      setOffset(0);
      setHasMore(false);
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
      const response = await fetch(`${API_URL}/audit/history?${params.toString()}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      const data = Array.isArray(json) ? json : json.data ?? [];
      setLogs((prev) => [...prev, ...data]);
      setOffset((prev) => prev + data.length);
      setHasMore(data.length === FETCH_LIMIT);
    } catch (error) {
      console.error("Failed to load more audit logs:", error);
    } finally {
      setLoadingMore(false);
    }
  }, [filterAction, hasMore, loadingMore, offset]);

  useEffect(() => { fetchInitial(); }, [fetchInitial]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!loadingMore) fetchInitial();
    }, 5000);
    return () => clearInterval(timer);
  }, [fetchInitial, loadingMore]);

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
      const response = await fetch(`${API_URL}/audit/clear`, { method: "DELETE" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setLogs([]);
      setOffset(0);
      setHasMore(false);
      setCurrentPage(1);
      setExpandedId(null);
    } catch (error) {
      console.error("Clear failed:", error);
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
          <button className="audit-btn-refresh" onClick={fetchInitial}>↻ Refresh</button>
          <button className="audit-btn-export" onClick={exportCSV}>Print Auditlogs</button>
          <button className="audit-btn-clear" onClick={() => setShowClearConfirm(true)}>🗑 Clear Logs</button>
        </div>
      </div>

      {/* ── Summary Strip ── */}
      <div className="audit-summary-strip">
        <div className="audit-summary-item">
          <span className="audit-summary-num" style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
            <AnimatedCount value={logs.length} />
            {hasMore && (
              <span style={{ fontSize: 15, color: "#94a3b8", fontWeight: 700, lineHeight: 1 }}>+</span>
            )}
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
          const cfg = ACTION_CONFIG[action] || { label: action, icon: "•" };
          return (
            <React.Fragment key={action}>
              <div className="audit-summary-item">
                <span className="audit-summary-num"><AnimatedCount value={count} /></span>
                <span className="audit-summary-label">{cfg.icon} {cfg.label}</span>
              </div>
              {index !== topActions.length - 1 && <div className="audit-summary-divider" />}
            </React.Fragment>
          );
        })}

        <div className="audit-summary-divider" />

        <div className="audit-summary-item">
          <span className="audit-summary-num" style={{ fontSize: 12, color: "#64748b" }}>
            {logs[0] ? timeAgo(logs[0].created_at) : "—"}
          </span>
          <span className="audit-summary-label">Last Activity</span>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="audit-filters">
        <div className="audit-search-wrap">
          <span className="audit-search-icon">🔍</span>
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
              {ACTION_CONFIG[action]?.icon || ""} {ACTION_CONFIG[action]?.label || action}
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
                <h3>No records found</h3>
                <p>We couldn't find any audit logs for the selected filters.</p>
                <div style={{ marginTop: 14 }}>
                  <button className="audit-btn-refresh" onClick={fetchInitial}>↻ Retry</button>
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
                  const cfg = ACTION_CONFIG[log.action] || {
                    icon: "•",
                    label: log.action || "Unknown",
                    color: "#64748b",
                    bg: "rgba(100,116,139,0.09)",
                    border: "rgba(100,116,139,0.2)",
                  };
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
                          <span
                            className="audit-action-badge"
                            style={{
                              color: cfg.color,
                              background: cfg.bg,
                              borderColor: cfg.border || "transparent",
                            }}
                          >
                            <span className="audit-action-icon">{cfg.icon}</span>
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
                            >
                              {isExpanded ? "▲" : "▼"}
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