import { useState, useMemo, memo, useEffect, useRef, useCallback, useDeferredValue } from "react";
import { usePermissions } from "../../context/PermissionContext";
import { supabase } from "../../services/supabaseClient";
import { pushToast } from "../../services/toastService";
import "./DocumentTracking.css";

// Same-origin by default (goes through the Vite proxy in dev). Only set
// VITE_API_BASE_URL if the backend lives on a different origin.
const API = import.meta.env.VITE_API_BASE_URL || "";

// Debounce for realtime-triggered refetches so a burst of related writes
// collapses into a single refetch.
const REALTIME_DEBOUNCE_MS = 300;
const DOCUMENT_PAGE_SIZE = 50;
const dateTimeFmt = new Intl.DateTimeFormat(undefined, {
  month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
});

// Text shown for a stage with nobody assigned.
const UNSIGNED_LABEL = "Unsigned";
// Shared toast helper (same shared toastService used by Login / Vital Records).
// Plain function, not a hook, so it can be used inside useCallback without deps.
function notify(message, type = "success") {
  const ok = type === "success";
  pushToast({
    title: ok ? "Success" : "Error",
    message,
    success: ok,
    duration: 4000,
  });
}
const STATUS_STYLES = {
  "In review": { fg: "var(--blue-ink)", bg: "var(--blue-soft)" },
  "Approved": { fg: "var(--green-ink)", bg: "var(--green-soft)" },
  "Changes requested": { fg: "var(--amber-ink)", bg: "var(--amber-soft)" },
  "Rejected": { fg: "var(--red-ink)", bg: "var(--red-soft)" },
};

const FILTERS = ["All", "In review", "Approved", "Changes requested", "Rejected"];

const DOC_TYPES = ["Birth Certificate", "Marriage Certificate", "Death Certificate", "Other"];

// Matches RELEASE_DESTINATIONS in routes/document.py.
const RELEASE_DESTINATIONS = ["Owner's Copy", "Hospital", "PSA", "Archive Office"];

// Matches POSTING_PERIOD_DAYS in routes/document.py (display only; the
// backend decides whether the period has really elapsed).
const POSTING_PERIOD_DAYS = 10;

// Stage identification by label text — mirrors _is_registry_number_stage(),
// _is_releasing_stage() and _is_posting_period_stage() in routes/document.py.
function isRegistryNumberStageLabel(label) {
  return (label || "").toLowerCase().includes("registry number");
}
function isReleasingStageLabel(label) {
  return (label || "").trim().toLowerCase() === "releasing";
}
function isPostingPeriodStageLabel(label) {
  return (label || "").trim().toLowerCase() === "posting period";
}

// Maps a stage label to its document_stage_* permission — mirrors
// _stage_permission_for_label() in routes/document.py. Unknown labels
// return null (unrestricted), same as the backend.
function stagePermissionForLabel(label) {
  const l = (label || "").trim().toLowerCase();
  if (l.includes("registration")) return "document_stage_registration";
  if (l.includes("civil registrar")) return "document_stage_civil_registrar";
  if (l === "posting period") return "document_stage_posting_period";
  if (l.includes("records division")) return "document_stage_records_division";
  if (l.includes("registry number")) return "document_stage_registry_number";
  if (l === "releasing") return "document_stage_releasing";
  return null;
}

function formatDate(value) {
  if (!value) return "Pending";
  // Bare "YYYY-MM-DDTHH:MM:SS" strings from PostgREST are UTC but carry no
  // zone marker; append "Z" so the browser converts them to local time.
  let raw = value;
  if (
    typeof raw === "string" &&
    /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(raw) &&
    !/(Z|[+-]\d{2}:?\d{2})$/i.test(raw)
  ) {
    raw = raw.replace(" ", "T") + "Z";
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return value; // already a display string
  return dateTimeFmt.format(d);
}

function initialsFor(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() || "").join("") || "?";
}

function mapDocumentSummary(row) {
  return {
    id: row.id,
    docNumber: row.doc_number || `DOC-${row.id}`,
    title: row.title ?? row.document_title ?? "Untitled document",
    owner: row.owner ?? row.owner_name ?? row.handler_name ?? row.assigned_handler_name ?? "Unassigned",
    type: row.type ?? row.doc_type ?? row.document_type ?? "—",
    status: row.status ?? "In review",
    updated: formatDate(row.updated_at ?? row.updated),
    rejected: row.status === "Rejected",
  };
}

// Each stage carries its own handler (assigned_handler_name). There is no
// fallback to the document's handler; an empty stage renders "Unsigned".
function mapStage(stage) {
  return {
    order: stage.stage_order ?? stage.order,
    label: stage.label,
    detail: stage.detail,
    date: formatDate(stage.completed_at ?? stage.date),
    done: Boolean(stage.done),
    flag: Boolean(stage.flag),
    assignedHandlerName: stage.assigned_handler_name ?? null,
    registryNumber: stage.registry_number ?? null,
    releaseDestination: stage.release_destination ?? null,
    postingStartAt: stage.posting_start_at ?? null,
    postingEndAt: stage.posting_end_at ?? null,
    comments: (stage.comments || []).map((c) => ({
      author: c.author ?? "Unknown",
      initials: initialsFor(c.author),
      date: formatDate(c.created_at ?? c.date),
      text: c.body ?? c.text ?? "",
    })),
  };
}

function mapDocumentDetail(doc) {
  return {
    ...mapDocumentSummary(doc),
    registryNumber: doc.registry_number ?? null,
    releaseDestination: doc.release_destination ?? null,
    stages: (doc.stages || []).map(mapStage),
  };
}

// Active stage = first stage that is not done, or is flagged.
function getActiveIndex(stages) {
  return stages.findIndex((s) => !s.done || s.flag);
}

const DocumentRow = memo(function DocumentRow({ doc, selected, onSelect }) {
  const style = STATUS_STYLES[doc.status] || STATUS_STYLES["In review"];
  return (
    <button
      className="dt-row"
      data-selected={selected}
      onClick={() => onSelect(doc.id)}
    >
      <div className="dt-row-main">
        <span className="dt-row-id">
          <span className="dt-row-num">{doc.docNumber}</span>
          <span className="dt-row-type">{doc.type}</span>
        </span>
        <span className="dt-row-title">{doc.title}</span>
        <span className="dt-row-meta">
          <span>Handling <strong>{doc.owner}</strong></span>
          <span>Updated {doc.updated}</span>
        </span>
      </div>
      <div className="dt-row-side">
        <span className="dt-badge" style={{ color: style.fg, background: style.bg }}>
          {doc.status}
        </span>
      </div>
    </button>
  );
});

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    // no JSON body — fine for some 2xx responses
  }
  if (!res.ok) {
    const message = body?.error || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return body;
}

export default function DocumentTracking() {
  // ROLE POLICY:
  //  - Administrator: view-only on stages; can create/delete documents.
  //  - Non-admin: can work a stage (complete / request changes / reject /
  //    comment) only when the stage has a handler AND their role carries
  //    that stage's document_stage_* permission.
  // Mirrors block_if_admin() / block_if_no_stage_permission() on the backend.
  const { is_admin, hasAccess } = usePermissions();

  const [documents, setDocuments] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState(null);

  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);

  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [visibleCount, setVisibleCount] = useState(DOCUMENT_PAGE_SIZE);
  const [filter, setFilter] = useState("All");
  const [openStage, setOpenStage] = useState(null);

  // Input state for the stage forms. Cleared when the selected document changes.
  const [draftComment, setDraftComment] = useState("");
  const [registryNumberInput, setRegistryNumberInput] = useState("");
  const [releaseDestinationInput, setReleaseDestinationInput] = useState("");
  const [actionError, setActionError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const saveTimer = useRef(null);

  // "New Document" modal
  const [newDocOpen, setNewDocOpen] = useState(false);
  const [newDocNumber, setNewDocNumber] = useState("");
  const [newDocTitle, setNewDocTitle] = useState("");
  const [newDocType, setNewDocType] = useState(DOC_TYPES[0]);
  const [newDocTypeOther, setNewDocTypeOther] = useState("");
  const [newDocBusy, setNewDocBusy] = useState(false);
  const [newDocError, setNewDocError] = useState(null);
  const newDocNumberRef = useRef(null);
  const newDocTypeOtherRef = useRef(null);

  // "Request changes" modal
  const [flagStageOrder, setFlagStageOrder] = useState(null);
  const [flagNote, setFlagNote] = useState("");
  const [flagBusy, setFlagBusy] = useState(false);
  const [flagError, setFlagError] = useState(null);
  const flagNoteRef = useRef(null);

  // Generic confirm modal: { title, message, confirmLabel, danger, onConfirm } | null
  const [confirmModal, setConfirmModal] = useState(null);
  const confirmModalConfirmRef = useRef(null);

  // Request-id tickets so an older response can never overwrite a newer one.
  const listRequestIdRef = useRef(0);
  const detailRequestIdRef = useRef(0);
  const listRefreshTimerRef = useRef(null);
  const detailRefreshTimerRef = useRef(null);

  // Mirrors of state, read by stable callbacks / realtime handlers.
  const detailRef = useRef(null);
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId; // assigned during render so it is never stale

  // `opts.silent === true` refreshes in place without a loading state.
  const loadList = useCallback(async (opts) => {
    const requestId = ++listRequestIdRef.current;
    const silent = opts?.silent === true;
    if (!silent) setListLoading(true);
    setListError(null);
    try {
      const rows = await apiFetch("/api/documents");
      if (listRequestIdRef.current !== requestId) return []; // superseded
      const mapped = (rows || []).map(mapDocumentSummary);
      setDocuments(mapped);
      // Keep the current selection if it still exists, else pick the first.
      setSelectedId((prev) =>
        prev != null && mapped.some((d) => d.id === prev) ? prev : (mapped[0]?.id ?? null)
      );
      return mapped;
    } catch (e) {
      if (listRequestIdRef.current !== requestId) return [];
      console.error("[DocumentTracking] Failed to load documents:", e);
      setListError(e.message || "Could not reach the server.");
      return [];
    } finally {
      if (listRequestIdRef.current === requestId) {
        setListLoading(false);
      }
    }
  }, []);

  // The request-id ticket prevents stale overwrites, and the render below
  // additionally refuses to show a detail whose id doesn't match the
  // current selection.
  const loadDetail = useCallback(async (id, opts) => {
    const requestId = ++detailRequestIdRef.current;
    if (id == null) {
      setDetail(null);
      setDetailLoading(false);
      return;
    }
    const silent = opts?.silent === true && String(detailRef.current?.id) === String(id);
    if (!silent) {
      setDetailLoading(true);
      setDetailError(null);
    }
    try {
      const doc = await apiFetch(`/api/documents/${id}`);
      if (detailRequestIdRef.current !== requestId) return; // a newer call took over
      setDetail(mapDocumentDetail(doc));
    } catch (e) {
      if (detailRequestIdRef.current !== requestId) return;
      console.error("[DocumentTracking] Failed to load document detail:", e);
      setDetailError(e.message || "Could not reach the server.");
      setDetail(null);
    } finally {
      if (detailRequestIdRef.current === requestId) {
        setDetailLoading(false);
      }
    }
  }, []);

  useEffect(() => { detailRef.current = detail; }, [detail]);

  useEffect(() => { loadList(); }, [loadList]);

  useEffect(() => {
    setOpenStage(null);
    setDraftComment("");
    setRegistryNumberInput("");
    setReleaseDestinationInput("");
    setActionError(null);
    loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  // Realtime: refresh list/detail in the background when related tables change.
  useEffect(() => {
    const scheduleList = () => {
      clearTimeout(listRefreshTimerRef.current);
      listRefreshTimerRef.current = setTimeout(() => loadList({ silent: true }), REALTIME_DEBOUNCE_MS);
    };
    const scheduleDetail = () => {
      clearTimeout(detailRefreshTimerRef.current);
      detailRefreshTimerRef.current = setTimeout(() => {
        if (selectedIdRef.current != null) loadDetail(selectedIdRef.current, { silent: true });
      }, REALTIME_DEBOUNCE_MS);
    };
    const idOf = (payload, key) => payload.new?.[key] ?? payload.old?.[key] ?? null;
    const isSelected = (id) => id == null || String(id) === String(selectedIdRef.current);

    const channel = supabase
      .channel("document-tracking-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "documents" }, (payload) => {
        scheduleList();
        if (isSelected(idOf(payload, "id"))) scheduleDetail();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "document_stages" }, (payload) => {
        scheduleList();
        if (isSelected(idOf(payload, "document_id"))) scheduleDetail();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "document_comments" }, (payload) => {
        if (isSelected(idOf(payload, "document_id"))) scheduleDetail();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "document_assignments" }, (payload) => {
        scheduleList();
        if (isSelected(idOf(payload, "document_id"))) scheduleDetail();
      })
      .subscribe((status, err) => {
        if (status === "SUBSCRIBED") {
          console.info("[DocumentTracking] Realtime connected.");
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || err) {
          console.error("[DocumentTracking] Realtime subscription failed:", status, err);
        }
      });

    return () => {
      clearTimeout(listRefreshTimerRef.current);
      clearTimeout(detailRefreshTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [loadList, loadDetail]);

  const flashSaved = useCallback(() => {
    setJustSaved(true);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => setJustSaved(false), 1200);
  }, []);
  useEffect(() => () => clearTimeout(saveTimer.current), []);

  useEffect(() => {
    if (newDocOpen && newDocNumberRef.current) newDocNumberRef.current.focus();
  }, [newDocOpen]);

  useEffect(() => {
    if (newDocType === "Other" && newDocTypeOtherRef.current) newDocTypeOtherRef.current.focus();
  }, [newDocType]);

  useEffect(() => {
    if (flagStageOrder != null && flagNoteRef.current) flagNoteRef.current.focus();
  }, [flagStageOrder]);

  useEffect(() => {
    if (confirmModal && confirmModalConfirmRef.current) confirmModalConfirmRef.current.focus();
  }, [confirmModal]);

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    return documents.filter((doc) => {
      const matchesFilter = filter === "All" || doc.status === filter;
      const matchesQuery =
        !q ||
        doc.title.toLowerCase().includes(q) ||
        String(doc.id).toLowerCase().includes(q) ||
        doc.docNumber.toLowerCase().includes(q) ||
        doc.owner.toLowerCase().includes(q);
      return matchesFilter && matchesQuery;
    });
  }, [documents, deferredQuery, filter]);

  const visibleDocuments = filtered.slice(0, visibleCount);

  // Wraps a mutating call: run it, refresh detail + list in place, surface errors.
  const runAction = useCallback(async (fn, successMsg) => {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      clearTimeout(listRefreshTimerRef.current);
      clearTimeout(detailRefreshTimerRef.current);
      await Promise.all([
        loadDetail(selectedIdRef.current, { silent: true }),
        loadList({ silent: true }),
      ]);
      flashSaved();
      if (successMsg) notify(successMsg, "success");
    } catch (e) {
      console.error("[DocumentTracking] Action failed:", e);
      setActionError(e.message || "Something went wrong.");
      notify(e.message || "Something went wrong.", "error");
    } finally {
      setBusy(false);
    }
  }, [loadDetail, loadList, flashSaved]);

  const advanceStage = (stageOrder) =>
    runAction(
      () => apiFetch(`/api/documents/${selectedId}/stages/${stageOrder}/complete`, { method: "POST" }),
      "Step marked complete."
    );

  // Called directly (not via runAction) so a failure keeps the modal open.
  const submitFlagStage = async () => {
    const note = flagNote.trim();
    if (!note) {
      setFlagError("Please describe what needs to change.");
      return;
    }
    setFlagError(null);
    setFlagBusy(true);
    setBusy(true);
    setActionError(null);
    try {
      await apiFetch(`/api/documents/${selectedId}/stages/${flagStageOrder}/flag`, {
        method: "POST",
        body: JSON.stringify({ note }),
      });
      await Promise.all([loadDetail(selectedId, { silent: true }), loadList({ silent: true })]);
      flashSaved();
      notify("Changes requested.", "success");
      setFlagStageOrder(null);
      setFlagNote("");
    } catch (e) {
      console.error("[DocumentTracking] Request changes failed:", e);
      setFlagError(e.message || "Could not submit this request.");
      notify(e.message || "Could not submit this request.", "error");
    } finally {
      setFlagBusy(false);
      setBusy(false);
    }
  };

  const rejectDoc = () =>
    runAction(
      () => apiFetch(`/api/documents/${selectedId}/reject`, { method: "POST" }),
      "Document rejected."
    );

  const addComment = useCallback((stageOrder, text) => {
    if (!text.trim()) return;
    return runAction(
      () => apiFetch(`/api/documents/${selectedId}/stages/${stageOrder}/comments`, {
        method: "POST",
        body: JSON.stringify({ body: text.trim() }),
      }),
      "Comment added."
    );
  }, [selectedId, runAction]);

  const saveRegistryNumber = (stageOrder, value) =>
    runAction(
      () => apiFetch(`/api/documents/${selectedId}/stages/${stageOrder}/registry-number`, {
        method: "POST",
        body: JSON.stringify({ registry_number: value }),
      }),
      "Registry number saved."
    );

  const saveReleaseDestination = (stageOrder, value) =>
    runAction(
      () => apiFetch(`/api/documents/${selectedId}/stages/${stageOrder}/release-destination`, {
        method: "POST",
        body: JSON.stringify({ destination: value }),
      }),
      "Release destination saved."
    );

  const startPostingPeriod = (stageOrder) =>
    runAction(
      () => apiFetch(`/api/documents/${selectedId}/stages/${stageOrder}/posting-period`, {
        method: "POST",
      }),
      "Posting period started."
    );

  const submitNewDocument = () => {
    const docNumber = newDocNumber.trim();
    const title = newDocTitle.trim();
    if (!docNumber) {
      setNewDocError("Document number is required.");
      return;
    }
    if (!title) {
      setNewDocError("Title is required.");
      return;
    }
    if (!newDocType) {
      setNewDocError("Document type is required.");
      return;
    }
    const resolvedType = newDocType === "Other" ? newDocTypeOther.trim() : newDocType;
    if (newDocType === "Other" && !resolvedType) {
      setNewDocError("Please type the document type.");
      return;
    }
    setNewDocError(null);
    setNewDocBusy(true);
    apiFetch("/api/documents", {
      method: "POST",
      body: JSON.stringify({ doc_number: docNumber, title, doc_type: resolvedType }),
    })
      .then(async (created) => {
        setNewDocNumber("");
        setNewDocTitle("");
        setNewDocType(DOC_TYPES[0]);
        setNewDocTypeOther("");
        setNewDocOpen(false);
        await loadList();
        if (created?.id != null) setSelectedId(created.id);
        flashSaved();
        notify("Document created.", "success");
      })
      .catch((e) => {
        console.error("[DocumentTracking] Failed to create document:", e);
        setNewDocError(e.message || "Could not create this document.");
        notify(e.message || "Could not create this document.", "error");
      })
      .finally(() => setNewDocBusy(false));
  };

  // Admin-only. Not routed through runAction() because there is no document
  // left to reload afterwards.
  const deleteDocument = async () => {
    if (selectedId == null) return;
    setBusy(true);
    setActionError(null);
    try {
      await apiFetch(`/api/documents/${selectedId}`, { method: "DELETE" });
      setSelectedId(null);
      setDetail(null);
      await loadList();
      flashSaved();
      notify("Document deleted.", "success");
    } catch (e) {
      console.error("[DocumentTracking] Failed to delete document:", e);
      setActionError(e.message || "Could not delete this document.");
      notify(e.message || "Could not delete this document.", "error");
    } finally {
      setBusy(false);
    }
  };

  const toggleStage = (i, hasComments) => {
    if (!hasComments) return;
    setOpenStage((prev) => (prev === i ? null : i));
  };

  // Never show a detail that belongs to a different document than the one selected.
  const selected = detail && String(detail.id) === String(selectedId) ? detail : null;
  const activeIndex = selected ? getActiveIndex(selected.stages) : -1;

  return (
    <div className="dt-root">
      <div className="dt-page">
        <div className="dt-tabs" role="tablist" aria-label="Filter documents by status">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              className="dt-tab"
              data-active={filter === f}
              onClick={() => {
                setVisibleCount(DOCUMENT_PAGE_SIZE);
                setFilter(f);
              }}
            >
              {f}
            </button>
          ))}
        </div>

        {listError && (
          <div className="dt-empty" style={{ marginBottom: 12 }}>
            Couldn't load documents: {listError}{" "}
            <button className="dt-btn dt-btn-ghost" onClick={() => loadList()}>Retry</button>
          </div>
        )}

        <div className="dt-grid" style={{ alignItems: "stretch" }}>
          <div className="dt-card dt-list-card">
            <div className="dt-card-head">
              <div>
                <h2>Documents</h2>
                <p>{listLoading ? "Loading…" : `${visibleDocuments.length} of ${filtered.length} shown`}</p>
              </div>
              <div className="dt-toolbar">
                {is_admin && (
                  <button
                    type="button"
                    className="dt-btn dt-btn-primary dt-btn-lg"
                    onClick={() => { setNewDocError(null); setNewDocOpen(true); }}
                  >
                    + New Document
                  </button>
                )}
                <input
                  id="dt-search-input"
                  name="document-search"
                  className="dt-search"
                  type="text"
                  placeholder="Search title, ID, owner"
                  aria-label="Search documents by title, ID or owner"
                  value={query}
                  onChange={(e) => {
                    setVisibleCount(DOCUMENT_PAGE_SIZE);
                    setQuery(e.target.value);
                  }}
                />
              </div>
            </div>

            <div className="dt-list">
              {listLoading && documents.length === 0 && (
                Array.from({ length: 5 }).map((_, i) => (
                  <div className="dt-skeleton-row" key={`dt-skeleton-${i}`} aria-hidden="true">
                    <div className="dt-skeleton-main">
                      <div className="dt-skeleton-line dt-skeleton-id" />
                      <div className="dt-skeleton-line dt-skeleton-title" />
                      <div className="dt-skeleton-line dt-skeleton-meta" />
                    </div>
                    <div className="dt-skeleton-line dt-skeleton-badge" />
                  </div>
                ))
              )}
              {!listLoading && filtered.length === 0 && (
                <div className="dt-empty">No documents match this search or filter.</div>
              )}
              {visibleDocuments.map((doc) => (
                <DocumentRow
                  key={doc.id}
                  doc={doc}
                  selected={selectedId === doc.id}
                  onSelect={setSelectedId}
                />
              ))}
            </div>
            {filtered.length > visibleDocuments.length && (
              <button
                type="button"
                className="dt-btn dt-btn-ghost"
                onClick={() => setVisibleCount((count) => count + DOCUMENT_PAGE_SIZE)}
              >
                Show more ({filtered.length - visibleDocuments.length})
              </button>
            )}
          </div>

          {detailLoading && (
            <div className="dt-card dt-detail-card">
              <div className="dt-empty">Loading document…</div>
            </div>
          )}

          {!detailLoading && detailError && (
            <div className="dt-card dt-detail-card">
              <div className="dt-empty">
                Couldn't load this document: {detailError}{" "}
                <button className="dt-btn dt-btn-ghost" onClick={() => loadDetail(selectedId)}>Retry</button>
              </div>
            </div>
          )}

          {/* Empty state. If a document IS selected but its detail isn't here
              yet, say "Loading…" (with a Retry) instead of the misleading
              "Select a document" message. */}
          {!detailLoading && !detailError && !selected && (
            <div className="dt-card dt-detail-card">
              <div
                className="dt-empty"
                style={{
                  minHeight: 240,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  gap: 8,
                }}
              >
                {selectedId != null ? (
                  <>
                    Loading document…{" "}
                    <button className="dt-btn dt-btn-ghost" onClick={() => loadDetail(selectedId)}>Retry</button>
                  </>
                ) : documents.length === 0 ? (
                  "No documents yet — they'll appear here once submitted."
                ) : (
                  "Select a document from the list to see its details."
                )}
              </div>
            </div>
          )}

          {!detailLoading && !detailError && selected && (
            <div className="dt-card dt-detail-card">
              <div className="dt-card-head">
                <div>
                  <h2>{selected.title}</h2>
                  <p className="dt-detail-docno">{selected.docNumber}</p>
                  {(selected.registryNumber || selected.releaseDestination) && (
                    <p style={{ fontSize: 12, color: "var(--ink-mid)", margin: "2px 0 0" }}>
                      {selected.registryNumber && <>Registry No. <strong>{selected.registryNumber}</strong></>}
                      {selected.registryNumber && selected.releaseDestination && " · "}
                      {selected.releaseDestination && <>Released to <strong>{selected.releaseDestination}</strong></>}
                    </p>
                  )}
                </div>
                <div className="dt-head-actions">
                  <span className="dt-save-note">
                    {justSaved ? "Saved" : "\u00A0"}
                  </span>
                  {is_admin && (
                    <button
                      type="button"
                      className="dt-btn dt-btn-danger"
                      disabled={busy}
                      onClick={() => {
                        setConfirmModal({
                          title: "Delete document",
                          message: `Delete ${selected.docNumber}? This permanently removes the document and cannot be undone.`,
                          confirmLabel: "Delete",
                          danger: true,
                          onConfirm: () => {
                            setConfirmModal(null);
                            deleteDocument();
                          },
                        });
                      }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>

              {actionError && (
                <div className="dt-empty" style={{ marginBottom: 12 }}>{actionError}</div>
              )}

              <ul className="dt-timeline">
                {selected.stages.map((stage, i) => {
                  const hasComments = Boolean(stage.comments?.length);
                  const isOpen = openStage === i;
                  const isActive = i === activeIndex && !selected.rejected;

                  // Per-stage gating — mirrors complete_stage() in routes/document.py.
                  const stageRegistryMissing = isRegistryNumberStageLabel(stage.label) && !stage.registryNumber;
                  const stageReleaseMissing = isReleasingStageLabel(stage.label) && !stage.releaseDestination;
                  const isPostingStage = isPostingPeriodStageLabel(stage.label);

                  // The 10-day window is optional: it only applies once the
                  // "10 Days Registration" button has been clicked. Until then
                  // the Posting Period stage is a plain pass-through step.
                  const postingEndTime = stage.postingEndAt ? new Date(stage.postingEndAt).getTime() : null;
                  const stagePostingStarted = isPostingStage && Boolean(stage.postingStartAt);
                  const stagePostingNotElapsed =
                    stagePostingStarted &&
                    (postingEndTime == null || Date.now() < postingEndTime);
                  const stagePostingCommentMissing =
                    stagePostingStarted && !stagePostingNotElapsed && !hasComments;
                  const markCompleteDisabled =
                    busy || stageRegistryMissing || stageReleaseMissing ||
                    stagePostingNotElapsed || stagePostingCommentMissing;

                  const markCompleteDisabledReason = stagePostingNotElapsed
                    ? `Mark complete unlocks once the ${POSTING_PERIOD_DAYS}-day posting period ends${
                        stage.postingEndAt ? ` (${formatDate(stage.postingEndAt)})` : ""
                      }.`
                    : stagePostingCommentMissing
                    ? "Add a comment on this step before it can be completed."
                    : stageRegistryMissing
                    ? "Enter and save the Registry Number before this step can be completed."
                    : stageReleaseMissing
                    ? "Select the release destination before this step can be completed."
                    : null;

                  // Does the user's role carry this stage's permission?
                  const stagePermission = stagePermissionForLabel(stage.label);
                  const userHasStageAccess = !stagePermission || hasAccess(stagePermission);

                  const stageHandlerName = stage.assignedHandlerName || UNSIGNED_LABEL;
                  const stageIsUnassigned = stageHandlerName === UNSIGNED_LABEL;

                  return (
                    <li
                      key={stage.order ?? i}
                      className="dt-step"
                      data-done={stage.done}
                      data-flag={Boolean(stage.flag)}
                      data-active={isActive}
                    >
                      <span className="dt-step-dot" />
                      <div className="dt-step-body">
                        <button
                          type="button"
                          className="dt-step-header"
                          data-clickable={hasComments}
                          onClick={() => toggleStage(i, hasComments)}
                          disabled={!hasComments}
                        >
                          <div className="dt-step-heading-text">
                            <p className="dt-step-docno">
                              Document No: {selected.docNumber}
                            </p>
                            <p className="dt-step-label">{stage.label}</p>
                            <p className="dt-step-detail">{stage.detail}</p>
                            <p className="dt-step-date">{stage.date}</p>
                            {isRegistryNumberStageLabel(stage.label) && stage.registryNumber && (
                              <p className="dt-step-detail" style={{ marginTop: 2 }}>
                                Registry Number: <strong>{stage.registryNumber}</strong>
                              </p>
                            )}
                            {isReleasingStageLabel(stage.label) && stage.releaseDestination && (
                              <p className="dt-step-detail" style={{ marginTop: 2 }}>
                                Released to: <strong>{stage.releaseDestination}</strong>
                              </p>
                            )}
                            {isPostingStage && stage.postingStartAt && (
                              <p className="dt-step-detail" style={{ marginTop: 2 }}>
                                Posted {formatDate(stage.postingStartAt)} — {stagePostingNotElapsed
                                  ? <>required until <strong>{formatDate(stage.postingEndAt)}</strong></>
                                  : <>posting period complete</>}
                              </p>
                            )}
                          </div>
                          {hasComments && (
                            <span className="dt-step-comment-btn" data-open={isOpen}>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                                <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                              {stage.comments.length}
                              <svg className="dt-step-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none">
                                <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </span>
                          )}
                        </button>

                        {/* Read-only "Currently handling" for this stage. */}
                        <div className="dt-handler-row" style={{ marginTop: 6 }}>
                          <span className="dt-handler-label">Currently handling:</span>
                          <span className="dt-handler-name" data-unsigned={stageIsUnassigned}>{stageHandlerName}</span>
                        </div>

                        {hasComments && isOpen && (
                          <ul className="dt-comment-list">
                            {stage.comments.map((c, ci) => (
                              <li key={ci} className="dt-comment">
                                <span className="dt-comment-avatar">{c.initials}</span>
                                <div className="dt-comment-body">
                                  <div className="dt-comment-meta">
                                    <span className="dt-comment-author">{c.author}</span>
                                    <span className="dt-comment-date">{c.date}</span>
                                  </div>
                                  <p className="dt-comment-text">{c.text}</p>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}

                        {/* Blocked: active stage with nobody assigned. */}
                        {isActive && stageIsUnassigned && (
                          <div className="dt-active-panel dt-active-panel-blocked">
                            <span className="dt-active-panel-label">
                              Unassigned — assign a handler before this step can be worked
                            </span>
                          </div>
                        )}

                        {/* Action panel: active stage, non-admin, has a handler, role covers this stage. */}
                        {isActive && !is_admin && !stageIsUnassigned && userHasStageAccess && (
                          <div className="dt-active-panel">
                            <span className="dt-active-panel-label">
                              Current step — action needed
                            </span>

                            {isPostingStage && (
                              <div style={{ marginBottom: 10 }}>
                                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--ink)", marginBottom: 4 }}>
                                  Posting Period ({POSTING_PERIOD_DAYS} days)
                                </label>
                                {!stage.postingStartAt ? (
                                  <button
                                    type="button"
                                    className="dt-btn dt-btn-primary"
                                    disabled={busy}
                                    onClick={() => startPostingPeriod(stage.order)}
                                  >
                                    10 Days Registration
                                  </button>
                                ) : (
                                  <p style={{ fontSize: 13, color: "var(--ink-mid)", margin: 0 }}>
                                    {stagePostingNotElapsed
                                      ? <>Posted since {formatDate(stage.postingStartAt)} — required until <strong>{formatDate(stage.postingEndAt)}</strong>.</>
                                      : <>Posting period complete (ended {formatDate(stage.postingEndAt)}).</>}
                                  </p>
                                )}
                              </div>
                            )}

                            {isRegistryNumberStageLabel(stage.label) && (
                              <div style={{ marginBottom: 10 }}>
                                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--ink)", marginBottom: 4 }}>
                                  Registry Number
                                </label>
                                <div style={{ display: "flex", gap: 8 }}>
                                  <input
                                    id={`dt-registry-number-${stage.order ?? i}`}
                                    name="registry-number"
                                    type="text"
                                    placeholder="e.g. 2026-00458"
                                    value={stage.registryNumber || registryNumberInput}
                                    disabled={busy || Boolean(stage.registryNumber)}
                                    onChange={(e) => setRegistryNumberInput(e.target.value)}
                                    style={{
                                      flex: 1, fontSize: 14, padding: "8px 10px",
                                      border: "1px solid var(--line-strong)", borderRadius: 6, outline: "none",
                                    }}
                                  />
                                  <button
                                    type="button"
                                    className="dt-btn dt-btn-primary"
                                    disabled={busy || Boolean(stage.registryNumber) || !registryNumberInput.trim()}
                                    onClick={() => saveRegistryNumber(stage.order, registryNumberInput.trim())}
                                  >
                                    {stage.registryNumber ? "Saved" : "Save"}
                                  </button>
                                </div>
                              </div>
                            )}

                            {isReleasingStageLabel(stage.label) && (
                              <div style={{ marginBottom: 10 }}>
                                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--ink)", marginBottom: 4 }}>
                                  Release destination
                                </label>
                                <div style={{ display: "flex", gap: 8 }}>
                                  <select
                                    id={`dt-release-destination-${stage.order ?? i}`}
                                    name="release-destination"
                                    value={stage.releaseDestination || releaseDestinationInput}
                                    disabled={busy || Boolean(stage.releaseDestination)}
                                    onChange={(e) => setReleaseDestinationInput(e.target.value)}
                                    style={{
                                      flex: 1, fontSize: 14, padding: "8px 10px",
                                      border: "1px solid var(--line-strong)", borderRadius: 6, outline: "none",
                                    }}
                                  >
                                    <option value="" disabled>Select destination…</option>
                                    {RELEASE_DESTINATIONS.map((d) => (
                                      <option key={d} value={d}>{d}</option>
                                    ))}
                                  </select>
                                  <button
                                    type="button"
                                    className="dt-btn dt-btn-primary"
                                    disabled={busy || Boolean(stage.releaseDestination) || !releaseDestinationInput}
                                    onClick={() => saveReleaseDestination(stage.order, releaseDestinationInput)}
                                  >
                                    {stage.releaseDestination ? "Saved" : "Save"}
                                  </button>
                                </div>
                              </div>
                            )}

                            <div className="dt-action-row">
                              <button
                                className="dt-btn dt-btn-primary"
                                disabled={markCompleteDisabled}
                                onClick={() => advanceStage(stage.order)}
                                style={
                                  markCompleteDisabled
                                    ? { opacity: 0.5, cursor: "not-allowed" }
                                    : undefined
                                }
                                title={markCompleteDisabledReason || undefined}
                              >
                                Mark complete → next step
                              </button>
                              <button
                                className="dt-btn dt-btn-ghost"
                                disabled={busy}
                                onClick={() => {
                                  setFlagError(null);
                                  setFlagNote("");
                                  setFlagStageOrder(stage.order);
                                }}
                              >
                                Request changes
                              </button>
                              <button
                                className="dt-btn dt-btn-danger"
                                disabled={busy}
                                onClick={() => {
                                  setConfirmModal({
                                    title: "Reject document",
                                    message: `Reject ${selected.docNumber}? This stops the pipeline.`,
                                    confirmLabel: "Reject",
                                    danger: true,
                                    onConfirm: () => {
                                      setConfirmModal(null);
                                      rejectDoc();
                                    },
                                  });
                                }}
                              >
                                Reject
                              </button>
                            </div>

                            {markCompleteDisabledReason && (
                              <p style={{ fontSize: 12, color: "var(--ink-mid)", margin: "8px 0 0" }}>
                                {markCompleteDisabledReason}
                              </p>
                            )}

                            <form
                              className="dt-comment-form"
                              onSubmit={(e) => {
                                e.preventDefault();
                                if (!draftComment.trim()) return;
                                addComment(stage.order, draftComment);
                                setDraftComment("");
                                setOpenStage(i);
                              }}
                            >
                              <textarea
                                id={`dt-comment-textarea-${stage.order ?? i}`}
                                name="comment"
                                className="dt-comment-textarea"
                                placeholder="Add a comment on this step…"
                                value={draftComment}
                                onChange={(e) => setDraftComment(e.target.value)}
                              />
                              <div className="dt-action-row">
                                <button type="submit" className="dt-btn dt-btn-ghost" disabled={busy}>
                                  Add comment
                                </button>
                              </div>
                            </form>
                          </div>
                        )}

                        {/* Non-admin, stage has a handler, but the role doesn't cover this stage. */}
                        {isActive && !is_admin && !stageIsUnassigned && !userHasStageAccess && (
                          <div className="dt-active-panel dt-active-panel-blocked">
                            <span className="dt-active-panel-label">
                              This step belongs to a different role — you don't have access to work on it
                            </span>
                          </div>
                        )}

                        {/* Admin: strictly view-only. */}
                        {isActive && is_admin && !stageIsUnassigned && (
                          <div className="dt-active-panel dt-active-panel-admin">
                            <span className="dt-active-panel-label">
                              {stage.flag
                                ? `Blocked — awaiting ${stageHandlerName} to address requested changes`
                                : `In progress — being handled by ${stageHandlerName}`}
                            </span>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>

              {activeIndex === -1 && !selected.rejected && (
                <p className="dt-pipeline-done" style={{ marginTop: 12 }}>
                  All steps complete — this document is fully processed.
                </p>
              )}
              {selected.rejected && (
                <p className="dt-pipeline-blocked" style={{ marginTop: 12 }}>
                  This document was rejected. No further steps will run.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* "New Document" modal */}
      {newDocOpen && (
        <div
          className="dt-modal-overlay"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setNewDocOpen(false); }}
          style={{
            position: "fixed", inset: 0, zIndex: 3000,
            background: "var(--backdrop)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <div
            className="dt-modal-card"
            style={{
              width: 360, background: "#fff", borderRadius: 8,
              boxShadow: "var(--shadow-lift)", overflow: "hidden",
            }}
          >
            <div style={{ padding: "16px 18px 4px" }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, fontFamily: "var(--font-display)" }}>New Document</h3>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--ink-mid)" }}>
                Enter a unique tracking number for this document.
              </p>
            </div>

            <div style={{ padding: "12px 18px" }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--ink)", marginBottom: 4 }}>
                Document number
              </label>
              <input
                ref={newDocNumberRef}
                id="dt-new-doc-number"
                name="new-document-number"
                type="text"
                placeholder="e.g. DOC-2026-00001"
                value={newDocNumber}
                disabled={newDocBusy}
                onChange={(e) => { setNewDocNumber(e.target.value); setNewDocError(null); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); submitNewDocument(); }
                  if (e.key === "Escape") setNewDocOpen(false);
                }}
                style={{
                  width: "100%", boxSizing: "border-box", fontSize: 14, padding: "8px 10px",
                  border: "1px solid var(--line-strong)", borderRadius: 6, outline: "none", marginBottom: 12,
                }}
              />

              <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--ink)", marginBottom: 4 }}>
                Title
              </label>
              <input
                id="dt-new-doc-title"
                name="new-document-title"
                type="text"
                placeholder="e.g. Birth Certificate — Juan Dela Cruz"
                value={newDocTitle}
                disabled={newDocBusy}
                onChange={(e) => { setNewDocTitle(e.target.value); setNewDocError(null); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); submitNewDocument(); }
                  if (e.key === "Escape") setNewDocOpen(false);
                }}
                style={{
                  width: "100%", boxSizing: "border-box", fontSize: 14, padding: "8px 10px",
                  border: "1px solid var(--line-strong)", borderRadius: 6, outline: "none", marginBottom: 12,
                }}
              />

              <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--ink)", marginBottom: 4 }}>
                Document type
              </label>
              <select
                id="dt-new-doc-type"
                name="new-document-type"
                value={newDocType}
                disabled={newDocBusy}
                onChange={(e) => {
                  setNewDocType(e.target.value);
                  setNewDocError(null);
                  if (e.target.value !== "Other") setNewDocTypeOther("");
                }}
                style={{
                  width: "100%", boxSizing: "border-box", fontSize: 14, padding: "8px 10px",
                  border: "1px solid var(--line-strong)", borderRadius: 6, outline: "none",
                }}
              >
                {DOC_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>

              {newDocType === "Other" && (
                <input
                  ref={newDocTypeOtherRef}
                  id="dt-new-doc-type-other"
                  name="new-document-type-other"
                  type="text"
                  placeholder="Type the document type…"
                  value={newDocTypeOther}
                  disabled={newDocBusy}
                  onChange={(e) => { setNewDocTypeOther(e.target.value); setNewDocError(null); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); submitNewDocument(); }
                    if (e.key === "Escape") setNewDocOpen(false);
                  }}
                  style={{
                    width: "100%", boxSizing: "border-box", fontSize: 14, padding: "8px 10px",
                    border: "1px solid var(--line-strong)", borderRadius: 6, outline: "none", marginTop: 8,
                  }}
                />
              )}

              {newDocError && (
                <p style={{ margin: "10px 0 0", fontSize: 12, color: "var(--red)" }}>{newDocError}</p>
              )}
            </div>

            <div style={{ display: "flex", gap: 8, padding: "4px 18px 18px" }}>
              {(() => {
                const missingCustomType = newDocType === "Other" && !newDocTypeOther.trim();
                const createDisabled = newDocBusy || !newDocNumber.trim() || !newDocTitle.trim() || missingCustomType;
                return (
                  <button
                    type="button"
                    onClick={submitNewDocument}
                    disabled={createDisabled}
                    style={{
                      flex: 1, padding: "9px 12px", fontSize: 13, fontWeight: 700,
                      borderRadius: 6, border: "none",
                      background: createDisabled ? "var(--raised)" : "var(--blue)",
                      color: createDisabled ? "var(--ink-soft)" : "#fff",
                      cursor: createDisabled ? "not-allowed" : "pointer",
                    }}
                  >
                    {newDocBusy ? "Creating…" : "Create Document"}
                  </button>
                );
              })()}
              <button
                type="button"
                onClick={() => setNewDocOpen(false)}
                disabled={newDocBusy}
                style={{
                  padding: "9px 12px", fontSize: 13, fontWeight: 700,
                  borderRadius: 6, border: "1px solid var(--line-strong)", background: "#fff",
                  color: "var(--ink)", cursor: newDocBusy ? "default" : "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* "Request changes" modal */}
      {flagStageOrder != null && (
        <div
          className="dt-modal-overlay"
          onMouseDown={(e) => { if (e.target === e.currentTarget && !flagBusy) setFlagStageOrder(null); }}
          style={{
            position: "fixed", inset: 0, zIndex: 3000,
            background: "var(--backdrop)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <div
            className="dt-modal-card"
            style={{
              width: 380, background: "#fff", borderRadius: 8,
              boxShadow: "var(--shadow-lift)", overflow: "hidden",
            }}
          >
            <div style={{ padding: "16px 18px 4px" }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, fontFamily: "var(--font-display)" }}>Request changes</h3>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--ink-mid)" }}>
                Describe what needs to change on this step. The pipeline will pause until it's addressed.
              </p>
            </div>

            <div style={{ padding: "12px 18px" }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--ink)", marginBottom: 4 }}>
                What needs to change?
              </label>
              <textarea
                ref={flagNoteRef}
                id="dt-flag-note"
                name="flag-note"
                placeholder="e.g. Birth certificate copy is missing a signature"
                value={flagNote}
                disabled={flagBusy}
                onChange={(e) => { setFlagNote(e.target.value); setFlagError(null); }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setFlagStageOrder(null);
                }}
                rows={4}
                style={{
                  width: "100%", boxSizing: "border-box", fontSize: 14, padding: "8px 10px",
                  border: "1px solid var(--line-strong)", borderRadius: 6, outline: "none", resize: "vertical",
                  fontFamily: "inherit",
                }}
              />

              {flagError && (
                <p style={{ margin: "10px 0 0", fontSize: 12, color: "var(--red)" }}>{flagError}</p>
              )}
            </div>

            <div style={{ display: "flex", gap: 8, padding: "4px 18px 18px" }}>
              <button
                type="button"
                onClick={submitFlagStage}
                disabled={flagBusy || !flagNote.trim()}
                style={{
                  flex: 1, padding: "9px 12px", fontSize: 13, fontWeight: 700,
                  borderRadius: 6, border: "none",
                  background: (!flagNote.trim() || flagBusy) ? "var(--raised)" : "var(--amber)",
                  color: (!flagNote.trim() || flagBusy) ? "var(--ink-soft)" : "#fff",
                  cursor: (!flagNote.trim() || flagBusy) ? "not-allowed" : "pointer",
                }}
              >
                {flagBusy ? "Submitting…" : "Request changes"}
              </button>
              <button
                type="button"
                onClick={() => setFlagStageOrder(null)}
                disabled={flagBusy}
                style={{
                  padding: "9px 12px", fontSize: 13, fontWeight: 700,
                  borderRadius: 6, border: "1px solid var(--line-strong)", background: "#fff",
                  color: "var(--ink)", cursor: flagBusy ? "default" : "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Generic confirm modal (Reject / Delete) */}
      {confirmModal && (
        <div
          className="dt-modal-overlay"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirmModal(null); }}
          style={{
            position: "fixed", inset: 0, zIndex: 3000,
            background: "var(--backdrop)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <div
            className="dt-modal-card"
            role="alertdialog"
            aria-modal="true"
            style={{
              width: 380, background: "#fff", borderRadius: 8,
              boxShadow: "var(--shadow-lift)", overflow: "hidden",
            }}
          >
            <div style={{ padding: "16px 18px 4px" }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, fontFamily: "var(--font-display)" }}>{confirmModal.title}</h3>
              <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--ink-mid)", lineHeight: 1.5 }}>
                {confirmModal.message}
              </p>
            </div>

            <div style={{ display: "flex", gap: 8, padding: "16px 18px 18px" }}>
              <button
                ref={confirmModalConfirmRef}
                type="button"
                onClick={confirmModal.onConfirm}
                style={{
                  flex: 1, padding: "9px 12px", fontSize: 13, fontWeight: 700,
                  borderRadius: 6, border: "none",
                  background: confirmModal.danger ? "var(--red)" : "var(--blue)",
                  color: "#fff", cursor: "pointer",
                }}
              >
                {confirmModal.confirmLabel || "Confirm"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                style={{
                  padding: "9px 12px", fontSize: 13, fontWeight: 700,
                  borderRadius: 6, border: "1px solid var(--line-strong)", background: "#fff",
                  color: "var(--ink)", cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}