import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { usePermissions } from "../PermissionContext";
import { supabase } from "../supabaseClient";
import "./document_tracking.css";

// Same-origin by default (goes through the Vite proxy in dev). Only set
// VITE_API_BASE_URL if the backend truly lives on a different origin —
// this mirrors the constant already used in PermissionContext.jsx so both
// files hit the same Flask app.
const API = import.meta.env.VITE_API_BASE_URL || "";

// How long to wait after a realtime event before re-fetching, so a
// burst of related writes (e.g. assign -> insert into
// document_assignments -> update documents in the same action)
// collapses into a single refetch instead of one per row changed.
const REALTIME_DEBOUNCE_MS = 300;

// PER-STAGE HANDLER FIX: the exact wording shown for a stage that has
// nobody assigned to it. Kept as one constant so every place that
// renders a stage's handler uses the same text and nothing ever falls
// back to another stage's name or to the first person in the pool.
const UNSIGNED_LABEL = "Unsigned";

// UI REFINEMENT: status chip colors now come from the shared flat
// tokens defined on .dt-root in document_tracking.css (a darker "ink"
// shade for the text, the matching *-soft tint for the fill) instead
// of four one-off hex pairs, so chips, buttons and panels all draw
// from the same accent system. The keys and the { fg, bg } shape are
// unchanged, so nothing that reads STATUS_STYLES needs to change.
const STATUS_STYLES = {
  "In review": { fg: "var(--blue-ink)", bg: "var(--blue-soft)" },
  "Approved": { fg: "var(--green-ink)", bg: "var(--green-soft)" },
  "Changes requested": { fg: "var(--amber-ink)", bg: "var(--amber-soft)" },
  "Rejected": { fg: "var(--red-ink)", bg: "var(--red-soft)" },
};

const FILTERS = ["All", "In review", "Approved", "Changes requested", "Rejected"];

// Document types offered in the "New Document" form. Adjust to match
// whatever doc_type values your workflow actually uses.
const DOC_TYPES = ["Birth Certificate", "Marriage Certificate", "Death Certificate", "Other"];

// WORKFLOW FIX: the four allowed release destinations for the final
// "Releasing" stage, matching RELEASE_DESTINATIONS in
// routes/document.py.
const RELEASE_DESTINATIONS = ["Owner's Copy", "Hospital", "PSA", "Archive Office"];

// WORKFLOW FIX (Posting Period): how many days the "Posting Period"
// stage requires, matching POSTING_PERIOD_DAYS in routes/document.py.
// Used only for display text here — the backend is the source of
// truth for whether the period has actually elapsed.
const POSTING_PERIOD_DAYS = 10;

// WORKFLOW FIX: identify the workflow stages that need special
// handling (the Posting Period step, the Registry Number entry, and
// the final Releasing step) by label text rather than a hardcoded
// stage order — mirrors _is_registry_number_stage() /
// _is_releasing_stage() / _is_posting_period_stage() in
// routes/document.py. This means documents created under an older
// workflow never match and keep behaving exactly as they did before
// this change.
function isRegistryNumberStageLabel(label) {
  return (label || "").toLowerCase().includes("registry number");
}
function isReleasingStageLabel(label) {
  return (label || "").trim().toLowerCase() === "releasing";
}
function isPostingPeriodStageLabel(label) {
  return (label || "").trim().toLowerCase() === "posting period";
}

// STAGE PERMISSION FIX (NEW): maps a document_stages.label to the
// single document_stage_* permission that scopes a role to acting on
// that one stage — mirrors _stage_permission_for_label() in
// routes/document.py exactly (same substring/equality rules, same
// six known stages). A label that doesn't match any of the six known
// stages returns null, so such a stage is left unrestricted here too,
// exactly like the backend's block_if_no_stage_permission() behaves
// for it.
//
// This is what was missing before: the backend already refused
// complete/flag/reject/comment/registry-number/release-destination/
// posting-period calls from a user whose role didn't cover the stage
// being acted on, but this file never checked that same permission
// before deciding whether to render the action controls at all — so
// any non-admin assigned handler saw "Mark complete", "Request
// changes", "Reject", and the comment form on every active stage,
// regardless of which single document_stage_* permission their role
// actually granted them.
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

const totalComments = (doc) =>
  (doc.stages || []).reduce((sum, s) => sum + (s.comments?.length || 0), 0);

function formatDate(value) {
  if (!value) return "Pending";
  // TIMEZONE FIX: document_stages.completed_at and
  // document_comments.created_at are plain TIMESTAMP columns (no time
  // zone) in the schema, always written in UTC by Postgres's own
  // now()/CURRENT_TIMESTAMP. PostgREST returns those as a bare
  // "YYYY-MM-DDTHH:MM:SS" (or space-separated) string with no "Z" or
  // offset. The Date constructor treats a date-time string with no
  // timezone designator as already being in the BROWSER's local time,
  // not UTC — so a value that's really e.g. 00:29 UTC was rendered as
  // if it were already 00:29 in the viewer's own time zone, instead of
  // being converted to the correct local time (00:29 UTC = 08:29 for a
  // UTC+8 viewer). This normalizes such a bare timestamp to explicit
  // UTC (appending "Z") before parsing, so it converts to the local
  // time zone the same way every other timestamp in the app already
  // does. Values that already carry a timezone marker — e.g. the
  // Posting Period's posting_start_at/posting_end_at, written from
  // Python as timezone-aware ISO strings with an explicit "+00:00" —
  // are left exactly as they were and pass straight through.
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
  return d.toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function initialsFor(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() || "").join("") || "?";
}

// documents row (from routes/document.py) -> the shape this component
// works with. Field names are read defensively (a couple of likely
// aliases per field) so this keeps working even if the backend's field
// names shift slightly; adjust the ?? chain here if that happens.
//
// doc_number is the human-facing id from documents.doc_number, e.g.
// "DOC-2026-00001" — generated by the trg_generate_doc_number trigger
// (see doc_number_format.sql), format DOC-<year>-<5-digit sequence>,
// resetting each calendar year. Falls back to DOC-{id} for any row
// that somehow doesn't have one (e.g. pre-migration rows).
//
// RESTORE FIX: also carries deletedHandlerId / deletedHandlerName from
// the backend's deleted_handler_id / deleted_handler_name — set when
// this document was left unassigned because its handler was removed
// from the pool (see document.py's delete_handler()). Used below to
// offer a "Restore to <name>" option in the handler dropdown.
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
    deletedHandlerId: row.deleted_handler_id ?? null,
    deletedHandlerName: row.deleted_handler_name ?? null,
  };
}

// WORKFLOW FIX: mapStage() now also carries the Registry Number /
// release destination for their respective stages, straight from
// document_stages.registry_number / release_destination, plus the
// Posting Period's posting_start_at / posting_end_at.
//
// PER-STAGE HANDLER FIX: it also carries THIS stage's own handler —
// document_stages.assigned_handler_id and the name the backend
// resolved for exactly that id (assigned_handler_name). Both stay
// null when the stage has nobody assigned; there is deliberately no
// fallback here to the document's handler, to another stage's
// handler, or to the first entry of the handler pool, so a stage with
// no personnel renders as "Unsigned" and nothing else.
function mapStage(stage) {
  return {
    order: stage.stage_order ?? stage.order,
    label: stage.label,
    detail: stage.detail,
    date: formatDate(stage.completed_at ?? stage.date),
    done: Boolean(stage.done),
    flag: Boolean(stage.flag),
    assignedHandlerId: stage.assigned_handler_id ?? null,
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
    handlerId: doc.assigned_handler_id ?? doc.handler_id ?? null,
    registryNumber: doc.registry_number ?? null,
    releaseDestination: doc.release_destination ?? null,
    stages: (doc.stages || []).map(mapStage),
  };
}

// active stage = first stage that is neither done nor flagged. Same rule
// the UI used before, now applied to data coming from the API.
function getActiveIndex(stages) {
  return stages.findIndex((s) => !s.done || s.flag);
}

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

// Small inline icon set (kept local so this file has no new dependency).
function ChevronIcon({ open }) {
  return (
    <svg
      width="12" height="12" viewBox="0 0 24 24" fill="none"
      style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 120ms ease", flexShrink: 0 }}
    >
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <path d="M4 12.5l5 5L20 6" stroke="#2c7a4b" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Used on the "remove this person" control in the Add-person dropdown.
function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <path
        d="M4 7h16M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2m3 0v13a2 2 0 01-2 2H8a2 2 0 01-2-2V7h12zM10 11v6M14 11v6"
        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

export default function DocumentTracking() {
  // ROLE POLICY (strict):
  //   - Administrator: VIEW-ONLY on document status/stages, plus the
  //     ability to create new documents, add people to the handler
  //     pool, and assign/reassign who handles a given document. An
  //     admin can NEVER complete, flag, reject, or comment on a stage
  //     — not even when the document is unassigned or the assigned
  //     handler hasn't acted yet. There is no "sign on behalf of"
  //     override for admins.
  //   - Regular (non-admin) user: the ONLY role that can actually work
  //     a document through its pipeline — mark a stage complete,
  //     request changes, reject, or comment — and only once a handler
  //     is assigned. Regular users work documents ASSIGNED TO THEM;
  //     they don't create new document/request records — see the
  //     "+ New Document" button below, which is now admin-only to
  //     match, and routes/document.py's create_document(), which
  //     enforces the same rule server-side via require_admin().
  //
  //   This mirrors the backend exactly: routes/document.py calls
  //   block_if_admin() on the complete/flag/reject/comment endpoints,
  //   so even a crafted request from an admin session is rejected
  //   server-side with a 403. The UI below simply doesn't render those
  //   controls for admins, so there is no button that would ever hit
  //   that 403 in normal use.
  //
  //   STAGE PERMISSION FIX (NEW): being the assigned, non-admin handler
  //   is no longer enough on its own to see the action panel on every
  //   active stage. Each Document Tracking stage role
  //   (Registration / Civil Registrar / Posting Period / Records
  //   Division / Assign Registry Number / Releasing) carries exactly
  //   one document_stage_* permission (see BUILTIN_ROLE_PERMISSIONS in
  //   Rolemanagement.py). `hasAccess(...)` below is checked per-stage
  //   against `stagePermissionForLabel(stage.label)` — mirroring
  //   block_if_no_stage_permission() in routes/document.py — so a user
  //   whose only role is "Assign Registry Number" now only ever sees
  //   the action panel on the "Assign Registry Number" stage; every
  //   other active stage shows a read-only "not your role" panel
  //   instead, exactly like admins already see. Completing that one
  //   stage still simply advances to the next stage row as before
  //   (see _get_active_stage() in document.py) — which is what
  //   "forwards" the document to the next role's queue, gated by that
  //   next stage's own permission the same way.
  //
  //   can_manage_personnel: a separately-named flag for the personnel/
  //   assignment concern specifically (adding a full name to the
  //   handler pool, assigning who handles a document). Today
  //   Administrator is the only role that gets it. Reading it under
  //   its own name here — instead of every personnel-related check
  //   reaching for is_admin directly — is what keeps "who can manage
  //   personnel" and "who is an admin" distinct in the code, matching
  //   how they're distinct as concepts.
  const { is_admin, can_manage_personnel, hasAccess } = usePermissions();

  const [documents, setDocuments] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState(null);

  // Who Document Tracking can offer as a handler in the "currently
  // handling" dropdown — loaded once, independent of which document is
  // selected. Admins can grow this pool via the "Add person" combobox
  // below, and pick from it to assign a document via the dropdown in
  // the detail panel.
  const [handlers, setHandlers] = useState([]);

  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [openStage, setOpenStage] = useState(null);
  const [draftComment, setDraftComment] = useState("");
  // WORKFLOW FIX: local input state for the two data-entry stages
  // (Assign Registry Number / Releasing). Cleared whenever the
  // selected document changes, same as draftComment above.
  const [registryNumberInput, setRegistryNumberInput] = useState("");
  const [releaseDestinationInput, setReleaseDestinationInput] = useState("");
  const [actionError, setActionError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const saveTimer = useRef(null);

  // "Add person" — a dropdown/combobox (not a modal): typing filters
  // the existing handler pool live, an exact match shows a checkmark
  // (so you can see at a glance the name is already in the list
  // instead of adding a duplicate), and an "+ Add "…"" row submits a
  // brand-new name. This is a name-only entry into the handler pool —
  // it is NOT creating a user account or login, same as before; only
  // the UI changed. Always visible in the Documents list header
  // (admin-only) so it works even with no document selected.
  const [addOpen, setAddOpen] = useState(false);
  const [addValue, setAddValue] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState(null);
  const addBoxRef = useRef(null);

  // Which handler-pool entry (by id) is currently being removed, so
  // just that row can show a disabled/busy state on its remove button
  // instead of freezing the whole dropdown.
  const [removeBusyId, setRemoveBusyId] = useState(null);

  // "Add new name" mode: clicking the "+ Add new name" row switches the
  // dropdown from "browse/search personnel" into a dedicated add-a-person
  // view with its own input and a Confirm button, instead of requiring the
  // person to type into the top search box before the row does anything.
  const [addingNew, setAddingNew] = useState(false);
  const [newNameValue, setNewNameValue] = useState("");
  const newNameInputRef = useRef(null);

  // NEW — "New Document" modal: lets any logged-in user create a
  // document/request record (POST /api/documents). This is what was
  // missing before — without it there was never a row in `documents`
  // to select or assign a handler to, which is why the dashboard
  // could only ever show "0 of 0 shown". Assignment stays a separate,
  // admin-only step via the existing dropdown in the detail panel;
  // this form does not touch assigned_handler_id at all.
  const [newDocOpen, setNewDocOpen] = useState(false);
  const [newDocNumber, setNewDocNumber] = useState("");
  const [newDocTitle, setNewDocTitle] = useState("");
  const [newDocType, setNewDocType] = useState(DOC_TYPES[0]);
  // When newDocType === "Other", this free-text value is what actually
  // gets sent as doc_type — the "Other" option in DOC_TYPES is just a
  // trigger to reveal this input, never a value submitted on its own.
  const [newDocTypeOther, setNewDocTypeOther] = useState("");
  const [newDocBusy, setNewDocBusy] = useState(false);
  const [newDocError, setNewDocError] = useState(null);
  const newDocNumberRef = useRef(null);
  const newDocTitleRef = useRef(null);
  const newDocTypeOtherRef = useRef(null);

  // "Request changes" modal — replaces window.prompt(). flagStageOrder
  // tracks which stage the modal is for (null = closed); flagNote holds
  // the textarea content.
  const [flagStageOrder, setFlagStageOrder] = useState(null);
  const [flagNote, setFlagNote] = useState("");
  const [flagBusy, setFlagBusy] = useState(false);
  const [flagError, setFlagError] = useState(null);
  const flagNoteRef = useRef(null);

  // Generic "are you sure?" modal — replaces window.confirm() for
  // destructive actions (Reject, Delete) so the confirmation matches
  // the app's own styling instead of the browser's native dialog.
  // Shape: { title, message, confirmLabel, danger, onConfirm } | null.
  const [confirmModal, setConfirmModal] = useState(null);
  const confirmModalConfirmRef = useRef(null);

  // STALE-RESPONSE FIX: request-id guards so an older /api/documents
  // (or /api/documents/<id>) response that resolves AFTER a newer one
  // — e.g. the immediate refresh an action triggers via runAction()
  // racing the debounced realtime refresh from the same write, or two
  // quick clicks on different documents — can never overwrite fresher
  // state with stale data. Each loadList()/loadDetail() call stamps a
  // ticket number before starting its fetch; when the fetch resolves,
  // its response is only applied to state if it's still the most
  // recent call in flight. This is what fixes the bug where, after an
  // admin restored a soft-deleted handler, the detail panel could keep
  // showing the previously-assigned/removed person instead of the
  // restored one, even though the Documents list (and a completely
  // separate session/reload) already reflected the correct, current
  // handler.
  //
  // MULTI-DOCUMENT HANDLERS FIX (NEW): loadHandlers() now gets the same
  // treatment via handlersRequestIdRef below — see loadHandlers() for
  // why.
  const listRequestIdRef = useRef(0);
  const detailRequestIdRef = useRef(0);
  const handlersRequestIdRef = useRef(0);

  const loadList = useCallback(async () => {
    const requestId = ++listRequestIdRef.current;
    setListLoading(true);
    setListError(null);
    try {
      const rows = await apiFetch("/api/documents");
      if (listRequestIdRef.current !== requestId) return []; // superseded by a newer call
      const mapped = (rows || []).map(mapDocumentSummary);
      setDocuments(mapped);
      // STALE-SELECTION FIX: previously this was
      //   setSelectedId((prev) => prev ?? mapped[0]?.id ?? null);
      // which only ever replaced `prev` when it was null/undefined.
      // Once a document was selected, its id stuck around forever —
      // even after that exact document was deleted, or otherwise
      // stopped being returned by this same endpoint (e.g. removed by
      // another session/tab). The list here would correctly refresh
      // to reflect reality (down to "0 of 0 shown" in the extreme
      // case), but loadDetail(selectedId) below kept being called
      // with that same now-nonexistent id on every subsequent list
      // reload (including the realtime-triggered ones), so the detail
      // panel was stuck showing "Couldn't load this document: Document
      // not found" — a real 404, not a transient error — until a full
      // page reload reset selectedId back to null. Reconciling the
      // selection against the freshly loaded list on every loadList()
      // call closes that gap for good: if the previously selected
      // document is still present, keep it selected; otherwise fall
      // back to the first available document (or null if there are
      // none), exactly like the very first load already did.
      setSelectedId((prev) =>
        prev != null && mapped.some((d) => d.id === prev) ? prev : (mapped[0]?.id ?? null)
      );
      return mapped;
    } catch (e) {
      if (listRequestIdRef.current !== requestId) return []; // superseded by a newer call
      console.error("[DocumentTracking] Failed to load documents:", e);
      setListError(e.message || "Could not reach the server.");
      return [];
    } finally {
      if (listRequestIdRef.current === requestId) {
        setListLoading(false);
      }
    }
  }, []);

  const loadDetail = useCallback(async (id) => {
    const requestId = ++detailRequestIdRef.current;
    if (id == null) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    setDetailError(null);
    try {
      const doc = await apiFetch(`/api/documents/${id}`);
      if (detailRequestIdRef.current !== requestId) return; // superseded by a newer call
      // CROSS-DOCUMENT STALE-DETAIL FIX (NEW): a request-id ticket only
      // protects against an older loadDetail() call's response landing
      // after a newer loadDetail() call's response — it says nothing
      // about whether `id` (the document this particular fetch was for)
      // is still the document actually selected. runAction() (used by
      // Mark complete / Request changes / Reject / assign / comment /
      // registry-number / release-destination / posting-period) closes
      // over `selectedId` from the render it was invoked in, and calls
      // loadDetail(selectedId) once its mutation resolves. If the user
      // switches the selected document to a DIFFERENT one while that
      // action's request is still in flight, this post-action refresh
      // still fires for the OLD document — and because it lands later
      // in time than the newly-selected document's own loadDetail()
      // call, it would win the ticket race and overwrite the detail
      // panel with the wrong document's data even though a different
      // document is now selected. Guarding against selectedIdRef.current
      // here (kept in sync with the current selection, see below) closes
      // that gap: a detail response for a document that is no longer
      // selected is simply discarded, exactly as it should be, since a
      // fresh loadDetail() for whatever IS currently selected has
      // already been kicked off by the selection-change effect below.
      if (id !== selectedIdRef.current) return;
      setDetail(mapDocumentDetail(doc));
    } catch (e) {
      if (detailRequestIdRef.current !== requestId) return; // superseded by a newer call
      if (id !== selectedIdRef.current) return; // see CROSS-DOCUMENT STALE-DETAIL FIX above
      console.error("[DocumentTracking] Failed to load document detail:", e);
      setDetailError(e.message || "Could not reach the server.");
      setDetail(null);
    } finally {
      if (detailRequestIdRef.current === requestId) {
        setDetailLoading(false);
      }
    }
  }, []);

  const loadHandlers = useCallback(async () => {
    // MULTI-DOCUMENT HANDLERS FIX (NEW): the same
    // "supersede-if-not-newest" guard loadList()/loadDetail() already
    // use above, now applied to the shared handler pool too. Without a
    // ticket here, two overlapping loadHandlers() calls — e.g. the
    // initial mount fetch racing a realtime-triggered refetch right
    // after an admin adds/removes a person, or two quick
    // additions/removals in succession — could resolve out of order,
    // and the older (but slower) response would overwrite the newer
    // one, briefly showing a stale handler pool (a just-removed person
    // still selectable, or a just-added one missing) in the "currently
    // handling" / assignment dropdowns across every open document.
    const requestId = ++handlersRequestIdRef.current;
    try {
      const rows = await apiFetch("/api/documents/handlers");
      if (handlersRequestIdRef.current !== requestId) return; // superseded by a newer call
      setHandlers(rows || []);
    } catch (e) {
      if (handlersRequestIdRef.current !== requestId) return; // superseded by a newer call
      console.warn("[DocumentTracking] Failed to load handlers:", e);
    }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { loadHandlers(); }, [loadHandlers]);
  useEffect(() => {
    setOpenStage(null);
    setDraftComment("");
    setRegistryNumberInput("");
    setReleaseDestinationInput("");
    setActionError(null);
    loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  // Kept in sync with the current selectedId without forcing the
  // realtime subscription effect below to tear down and resubscribe
  // every time the selection changes.
  const selectedIdRef = useRef(selectedId);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);

  // Realtime — replaces manual refresh. Subscribes once to Postgres
  // changes on the tables this screen depends on, so every browser
  // tab picks up assignments, stage completions, comments, and new
  // documents as they happen, with no page reload and no polling
  // interval. Requires: (1) Realtime enabled on these tables in
  // Supabase (Database -> Replication), and (2) a SELECT policy on
  // each table for whatever role the anon/public key in
  // supabaseClient.js authenticates as — Postgres RLS is enforced on
  // realtime events too, so without read access no event ever arrives
  // even though the subscription itself succeeds silently.
  useEffect(() => {
    let listTimer = null;
    let detailTimer = null;
    let handlersTimer = null;

    const scheduleList = () => {
      clearTimeout(listTimer);
      listTimer = setTimeout(loadList, REALTIME_DEBOUNCE_MS);
    };
    const scheduleDetail = () => {
      clearTimeout(detailTimer);
      detailTimer = setTimeout(() => {
        if (selectedIdRef.current != null) loadDetail(selectedIdRef.current);
      }, REALTIME_DEBOUNCE_MS);
    };
    const scheduleHandlers = () => {
      clearTimeout(handlersTimer);
      handlersTimer = setTimeout(loadHandlers, REALTIME_DEBOUNCE_MS);
    };

    const channel = supabase
      .channel("document-tracking-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "documents" }, () => {
        scheduleList();
        scheduleDetail();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "document_stages" }, () => {
        scheduleList();
        scheduleDetail();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "document_comments" }, () => {
        scheduleDetail();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "document_assignments" }, () => {
        scheduleList();
        scheduleDetail();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "document_personnel" }, () => {
        scheduleHandlers();
      })
      .subscribe((status, err) => {
        // Realtime failures are otherwise completely silent — no
        // thrown error, no rejected promise, the UI just never
        // updates. This makes that visible: open DevTools Console and
        // look for these lines. "SUBSCRIBED" means the tables are
        // correctly published and readable; anything else (or an err)
        // points at the publication/RLS/env-var setup instead of the
        // app code.
        if (status === "SUBSCRIBED") {
          console.info("[DocumentTracking] Realtime connected.");
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || err) {
          console.error("[DocumentTracking] Realtime subscription failed:", status, err);
        }
      });

    return () => {
      clearTimeout(listTimer);
      clearTimeout(detailTimer);
      clearTimeout(handlersTimer);
      supabase.removeChannel(channel);
    };
  }, [loadList, loadDetail, loadHandlers]);

  const flashSaved = () => {
    setJustSaved(true);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => setJustSaved(false), 1200);
  };
  useEffect(() => () => clearTimeout(saveTimer.current), []);

  // Close the "Add person" dropdown on outside click, same behavior
  // any select/combobox is expected to have. Also resets the dedicated
  // "add new name" mode so reopening the dropdown starts fresh on the
  // browse/search view rather than staying stuck mid-add.
  useEffect(() => {
    if (!addOpen) return;
    const handleClickOutside = (e) => {
      if (addBoxRef.current && !addBoxRef.current.contains(e.target)) {
        setAddOpen(false);
        setAddingNew(false);
        setAddValue("");
        setNewNameValue("");
        setAddError(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [addOpen]);

  // Autofocus the dedicated "type a name" input the moment "+ Add new
  // name" is clicked, so typing can start immediately with no extra click.
  useEffect(() => {
    if (addingNew && newNameInputRef.current) {
      newNameInputRef.current.focus();
    }
  }, [addingNew]);

  // Autofocus the "New Document" number field the moment that modal opens
  // — it's now the first field, since the tracking number is typed in
  // rather than generated automatically.
  useEffect(() => {
    if (newDocOpen && newDocNumberRef.current) {
      newDocNumberRef.current.focus();
    }
  }, [newDocOpen]);

  // Autofocus the custom document-type input the moment "Other" is
  // selected in the dropdown, so typing can start immediately.
  useEffect(() => {
    if (newDocType === "Other" && newDocTypeOtherRef.current) {
      newDocTypeOtherRef.current.focus();
    }
  }, [newDocType]);

  // Autofocus the "Request changes" note field the moment that modal opens.
  useEffect(() => {
    if (flagStageOrder != null && flagNoteRef.current) {
      flagNoteRef.current.focus();
    }
  }, [flagStageOrder]);

  // Autofocus the confirm-modal's primary action button the moment it
  // opens, so Enter/Space confirms immediately — matching how a native
  // confirm() dialog behaves.
  useEffect(() => {
    if (confirmModal && confirmModalConfirmRef.current) {
      confirmModalConfirmRef.current.focus();
    }
  }, [confirmModal]);

  const filtered = useMemo(() => {
    return documents.filter((doc) => {
      const matchesFilter = filter === "All" || doc.status === filter;
      const q = query.trim().toLowerCase();
      const matchesQuery =
        !q ||
        doc.title.toLowerCase().includes(q) ||
        String(doc.id).toLowerCase().includes(q) ||
        doc.docNumber.toLowerCase().includes(q) ||
        doc.owner.toLowerCase().includes(q);
      return matchesFilter && matchesQuery;
    });
  }, [documents, query, filter]);

  // Wraps a mutating call: runs it, refreshes the detail panel + list
  // (status/updated/comment counts all change server-side), and surfaces
  // any error inline instead of failing silently.
  const runAction = async (fn) => {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      await Promise.all([loadDetail(selectedId), loadList()]);
      flashSaved();
    } catch (e) {
      console.error("[DocumentTracking] Action failed:", e);
      setActionError(e.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const advanceStage = (stageOrder) =>
    runAction(() => apiFetch(`/api/documents/${selectedId}/stages/${stageOrder}/complete`, { method: "POST" }));

  const flagStage = (stageOrder, note) =>
    runAction(() => apiFetch(`/api/documents/${selectedId}/stages/${stageOrder}/flag`, {
      method: "POST",
      body: JSON.stringify({ note }),
    }));

  // Submits the "Request changes" modal: validates the note, then
  // calls the flag endpoint directly (rather than through runAction,
  // which swallows errors into actionError and always "succeeds" from
  // the caller's point of view) so a failed request keeps the modal
  // open with the error shown, instead of closing regardless.
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
      await Promise.all([loadDetail(selectedId), loadList()]);
      flashSaved();
      setFlagStageOrder(null);
      setFlagNote("");
    } catch (e) {
      console.error("[DocumentTracking] Request changes failed:", e);
      setFlagError(e.message || "Could not submit this request.");
    } finally {
      setFlagBusy(false);
      setBusy(false);
    }
  };

  const rejectDoc = () =>
    runAction(() => apiFetch(`/api/documents/${selectedId}/reject`, { method: "POST" }));

  // Admin-only server-side (see routes/document.py: assign_handler now
  // requires admin, and additionally refuses to run once the document
  // has any completed stage — see the HANDLER-LOCK FIX there, and the
  // REASSIGN-AFTER-DELETE EXCEPTION that lifts that lock specifically
  // when the document was left unassigned by a personnel deletion; per
  // the ADMIN FULL-REASSIGN FIX, that exception now accepts ANY active
  // handler, not just the exact deleted person — see the notes on
  // assign_handler() in document.py).
  // Picks who handles the currently selected document out of the
  // handler pool loaded into `handlers`.
  //
  // RESTORE FIX: this same function is also used for the "Restore to
  // <name>" recovery option below, which passes the deleted person's
  // id even though they no longer appear in `handlers` — the backend
  // (assign_handler() in document.py) is what validates that this is
  // exactly the right person for exactly this document before
  // accepting it.
  //
  // PER-STAGE HANDLER FIX: this is the DOCUMENT-level assignment and
  // is unchanged. Who shows as "Currently handling" on an individual
  // step now comes from assignStageHandler() below instead, and is
  // never derived from this value.
  const assignHandler = (handlerId) =>
    runAction(() => apiFetch(`/api/documents/${selectedId}/assign`, {
      method: "POST",
      body: JSON.stringify({ handler_id: handlerId }),
    }));

  // PER-STAGE HANDLER FIX (NEW): sets the person who handles ONE
  // specific stage of this document (POST .../stages/<order>/assign in
  // routes/document.py — admin-only there, and only rendered for
  // can_manage_personnel here). Passing null clears that stage's
  // handler, putting it back to "Unsigned".
  //
  // Routed through the same runAction() helper as every other action
  // on this screen, so errors surface via actionError and the detail
  // panel refreshes on success the same way. It writes only
  // document_stages.assigned_handler_id, so no other behaviour (the
  // document-level handler lock, the restore-after-delete recovery,
  // stage permissions, workflow gating) is touched by it.
  const assignStageHandler = (stageOrder, handlerId) =>
    runAction(() => apiFetch(`/api/documents/${selectedId}/stages/${stageOrder}/assign`, {
      method: "POST",
      body: JSON.stringify({ handler_id: handlerId }),
    }));

  const addComment = (stageOrder, text) => {
    if (!text.trim()) return;
    return runAction(() => apiFetch(`/api/documents/${selectedId}/stages/${stageOrder}/comments`, {
      method: "POST",
      body: JSON.stringify({ body: text.trim() }),
    }));
  };

  // WORKFLOW FIX: saves the Registry Number / release destination for
  // their respective stages (POST .../registry-number and
  // .../release-destination in routes/document.py). Routed through
  // the same runAction() helper as the other stage actions above, so
  // errors surface via actionError and the detail/list panels refresh
  // on success the same way. Neither of these completes the stage —
  // "Mark complete → next step" (advanceStage above) is still the
  // only thing that does, and the backend now refuses to complete
  // these stages until the corresponding value has been saved.
  const saveRegistryNumber = (stageOrder, value) =>
    runAction(() => apiFetch(`/api/documents/${selectedId}/stages/${stageOrder}/registry-number`, {
      method: "POST",
      body: JSON.stringify({ registry_number: value }),
    }));

  const saveReleaseDestination = (stageOrder, value) =>
    runAction(() => apiFetch(`/api/documents/${selectedId}/stages/${stageOrder}/release-destination`, {
      method: "POST",
      body: JSON.stringify({ destination: value }),
    }));

  // WORKFLOW FIX (Posting Period): starts the 10-day posting period on
  // the "Posting Period" stage (POST .../posting-period in
  // routes/document.py). Same non-completing relationship to
  // advanceStage() as the registry-number/release-destination savers
  // above: this only records the start (and server-computed end) time,
  // and complete_stage() on the backend refuses to complete this stage
  // until that period has actually elapsed.
  const startPostingPeriod = (stageOrder) =>
    runAction(() => apiFetch(`/api/documents/${selectedId}/stages/${stageOrder}/posting-period`, {
      method: "POST",
    }));

  // Trimmed/lowercased once per render for the combobox's filtering +
  // duplicate-detection below.
  const trimmedAddValue = addValue.trim();
  const addValueLower = trimmedAddValue.toLowerCase();

  const filteredHandlerOptions = useMemo(() => {
    if (!trimmedAddValue) return handlers;
    return handlers.filter((h) => h.name.toLowerCase().includes(addValueLower));
  }, [handlers, trimmedAddValue, addValueLower]);

  const isExactDuplicate = Boolean(
    trimmedAddValue && handlers.some((h) => h.name.toLowerCase() === addValueLower)
  );

  // Admin-only: add a brand-new person (e.g. "John Doe") into the
  // handler pool. They immediately become selectable in the "currently
  // handling" dropdown for everyone else — no page reload needed since
  // we merge the new handler straight into local state. This is a
  // name-only entry (posts to the same admin-only
  // POST /api/documents/handlers endpoint as before); it does not
  // create a user account or system login.
  //
  // NOTE: this only works instantly if the backend actually returns the
  // inserted row. See document.py's add_handler() — it now chains
  // .select("id, full_name") onto the insert so res.data[0] is always
  // populated; previously it could come back empty even on a successful
  // write, which made this promise reject and the name only show up
  // after the next full page load.
  const submitNewPerson = () => {
    const name = newNameValue.trim();
    if (!name) {
      setAddError("Full name is required.");
      return;
    }
    if (handlers.some((h) => h.name.toLowerCase() === name.toLowerCase())) {
      setAddError("This person is already in the list.");
      return;
    }
    setAddError(null);
    setAddBusy(true);
    apiFetch("/api/documents/handlers", {
      method: "POST",
      body: JSON.stringify({ name }),
    })
      .then((newHandler) => {
        setHandlers((prev) =>
          [...prev, newHandler].sort((a, b) => a.name.localeCompare(b.name))
        );
        // FIX: this trigger is a standalone "manage personnel" control in
        // the Documents list header — it is not tied to any document or
        // selection. Leaving the last-added name sitting in it (as done
        // previously) made the button look like a pre-filled assignment
        // select (e.g. "Jamaica L Camoro") instead of a neutral "Add
        // person" action, which read as if something was stuck selected.
        // Reset it back to empty so the button always shows "Add person"
        // again once the dropdown closes.
        setAddValue("");
        setNewNameValue("");
        setAddingNew(false);
        setAddOpen(false);
        flashSaved();
      })
      .catch((e) => {
        console.error("[DocumentTracking] Failed to add person:", e);
        setAddError(e.message || "Could not add this person.");
      })
      .finally(() => setAddBusy(false));
  };

  // Remove a person from the handler pool. Admin-only, wired to the
  // small trash icon on each row in the "browse/search" dropdown view.
  // Calls DELETE /api/documents/handlers/<id> (document.py's
  // delete_handler()), which unassigns any documents currently
  // pointing at this person before deleting the row, then drops them
  // from local state so they disappear immediately — no reload
  // needed. Any document that was showing them as "Currently
  // handling" picks up "Unassigned" on its own via the existing
  // realtime subscription on the `documents` table (and can be
  // restored back to exactly this person via the "Restore to <name>"
  // option that then appears in that document's handler dropdown —
  // see document.py's delete_handler()/assign_handler() for how that
  // recovery is scoped).
  //
  // PER-STAGE HANDLER FIX: delete_handler() also clears this person
  // off any individual stage they were assigned to, so those stages
  // go back to reading "Unsigned" rather than keeping a removed
  // person's name.
  const removeHandler = (handler) => {
    setRemoveBusyId(handler.id);
    setAddError(null);
    apiFetch(`/api/documents/handlers/${handler.id}`, { method: "DELETE" })
      .then(() => {
        setHandlers((prev) => prev.filter((h) => h.id !== handler.id));
        // If the name sitting in the search box was this person,
        // clear it rather than leaving a stale value referring to
        // someone no longer in the pool.
        setAddValue((prev) => (prev.trim().toLowerCase() === handler.name.toLowerCase() ? "" : prev));
        flashSaved();
      })
      .catch((e) => {
        console.error("[DocumentTracking] Failed to remove person:", e);
        setAddError(e.message || "Could not remove this person.");
      })
      .finally(() => setRemoveBusyId(null));
  };

  // NEW — submit the "New Document" form. Creates the document/request
  // record (server generates doc_number as DOC-<year>-<00001> and
  // seeds starter stages — see create_document() in document.py),
  // then refreshes the list and selects the newly created document so
  // it's immediately visible and ready for an admin to assign a
  // handler to.
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
    // When "Other" is picked, the dropdown value itself is never sent —
    // it's a trigger to reveal the free-text field below. The actual
    // doc_type is whatever was typed into that field.
    const resolvedTypeBase = newDocType === "Other" ? newDocTypeOther.trim() : newDocType;
    if (newDocType === "Other" && !resolvedTypeBase) {
      setNewDocError("Please type the document type.");
      return;
    }
    // 10 DAYS REGISTRATION FIX: the document's type is no longer used to
    // decide whether its Posting Period stage requires the 10-day
    // window — that choice now lives on the stage itself (the "10 Days
    // Registration" button in the action panel), so doc_type is
    // submitted exactly as typed/selected, with no suffix appended.
    const resolvedType = resolvedTypeBase;
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
        if (created?.id != null) {
          setSelectedId(created.id);
        }
        flashSaved();
      })
      .catch((e) => {
        console.error("[DocumentTracking] Failed to create document:", e);
        setNewDocError(e.message || "Could not create this document.");
      })
      .finally(() => setNewDocBusy(false));
  };

  // Admin-only: permanently deletes the selected document (and its
  // stages/comments/assignments). Not wrapped in the generic
  // runAction() helper because, after a successful delete, there is
  // no longer a document to reload — runAction() would call
  // loadDetail(selectedId) against an id that no longer exists and
  // surface a spurious "not found" error. Deliberately mirrors
  // require_admin() in routes/document.py's new DELETE
  // /api/documents/<id> route: only an admin session can reach this
  // endpoint successfully, and the button that triggers it is only
  // ever rendered for admins (see the "Delete" button in the detail
  // panel header below).
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
    } catch (e) {
      console.error("[DocumentTracking] Failed to delete document:", e);
      setActionError(e.message || "Could not delete this document.");
    } finally {
      setBusy(false);
    }
  };

  const toggleStage = (i, hasComments) => {
    if (!hasComments) return;
    setOpenStage((prev) => (prev === i ? null : i));
  };

  const selected = detail;
  const activeIndex = selected ? getActiveIndex(selected.stages) : -1;

  // DOCUMENT HANDLER DISPLAY FIX (NEW): the header's "Document
  // handler" line reads `selected.owner`, which comes straight from
  // documents.assigned_handler_id via _summarize_document() in
  // document.py — i.e. only the old document-level "assign" action.
  // It stays "Unassigned" whenever a document is instead being worked
  // through a Document Tracking role (Role Management) — exactly what
  // Registration / Civil Registrar / etc. roles are for — even though
  // the active stage's own "Currently handling" (stageHandlerName,
  // further below) is already correctly resolving that role-based
  // assignment. That mismatch is what let the header show "Document
  // handler: Unassigned" directly above a Registration step whose own
  // "Currently handling" correctly showed jamaica.
  //
  // When there is no document-level handler, this falls back to
  // whatever the active stage's own resolved handler name is (the
  // same document_personnel-or-Role-Management name already used for
  // that stage's "Currently handling"), so the header stays
  // consistent with the timeline immediately below it. A document
  // with a real document-level handler, or with no active stage left
  // (fully processed / rejected), is completely unaffected and keeps
  // showing selected.owner exactly as before.
  const activeStageForHeader = selected && activeIndex !== -1 ? selected.stages[activeIndex] : null;
  const documentHandlerDisplayName =
    selected && selected.handlerId
      ? selected.owner
      : (activeStageForHeader?.assignedHandlerName || selected?.owner || "Unassigned");

  // No handler assigned yet ("Currently handling: Unassigned") — the
  // active stage can't be worked by anyone until someone is assigned.
  // Admins can still ASSIGN a handler via the dropdown in the header
  // above (that's administration, not "working" the document), but
  // admins can never complete/flag/reject/comment on the active stage
  // regardless of assignment state — see the strict role policy noted
  // where `is_admin` / `can_manage_personnel` are pulled from
  // usePermissions() above.
  const isUnassigned = selected ? !selected.handlerId : false;

  // HANDLER-LOCK FIX: once any stage has actually been completed, the
  // assignment is locked — the backend refuses reassignment (see
  // assign_handler() in document.py), and the dropdown here is
  // disabled to match so there's no control that would ever hit that
  // rejection in normal use.
  const isHandlerLocked = selected ? Boolean(selected.stages?.some((s) => s.done)) : false;

  // REASSIGN-AFTER-DELETE EXCEPTION: mirrors the backend carve-out in
  // assign_handler() — if this document is unassigned specifically
  // because its handler was removed (deletedHandlerId is set), the
  // "Currently handling" dropdown stays usable even though the
  // document has progressed, so it isn't stuck forever. Any other
  // locked document (still assigned, or unassigned for a different
  // reason) keeps the normal lock behavior.
  const canReassignAfterDeletion = isUnassigned && Boolean(selected?.deletedHandlerId);

  // ADMIN FULL-REASSIGN FIX: previously, an extra "RESTORE-ONLY LOCK"
  // flag (isHandlerLocked && canReassignAfterDeletion) hid the active
  // handler pool from the dropdown below, leaving "Restore to <name>"
  // as the only choice whenever a progressed document had lost its
  // handler to a deletion. Per updated requirements, an admin in this
  // recovery state can now either restore the exact person who was
  // removed OR assign the document to anyone else in the active pool —
  // the dropdown always renders the full handler list, and
  // assign_handler() in document.py no longer rejects a different
  // active handler_id in this state (see the ADMIN FULL-REASSIGN FIX
  // note there). The dropdown itself stays enabled in this state via
  // the existing `isHandlerLocked && !canReassignAfterDeletion` check
  // below — that part is unchanged.

  return (
    <div className="dt-root">
      <div className="dt-page">
        {/* UI REFINEMENT: role="tablist" / role="tab" / aria-selected
            added so the filter row is announced as a set of tabs. The
            filter logic (setFilter / data-active) is unchanged; the
            visual restyle lives in document_tracking.css (.dt-tabs,
            .dt-tab). */}
        <div className="dt-tabs" role="tablist" aria-label="Filter documents by status">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              className="dt-tab"
              data-active={filter === f}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>

        {listError && (
          <div className="dt-empty" style={{ marginBottom: 12 }}>
            Couldn't load documents: {listError}{" "}
            <button className="dt-btn dt-btn-ghost" onClick={loadList}>Retry</button>
          </div>
        )}

        {/*
          FIX (layout): dt-grid previously only ever rendered the
          right-hand column when detailLoading, detailError, or
          `selected` was truthy. With 0 documents (or nothing selected
          yet) none of those were true, so this cell rendered nothing —
          that's what produced the half-empty, cut-off-looking layout.
          `alignItems: "stretch"` (inline, since it doesn't touch the
          existing .dt-grid rule in the CSS file) makes both columns
          match height instead of the grid collapsing to its shortest
          child.
        */}
        <div className="dt-grid" style={{ alignItems: "stretch" }}>
          <div className="dt-card dt-list-card">
            <div className="dt-card-head">
              <div>
                <h2>Documents</h2>
                <p>{listLoading ? "Loading…" : `${filtered.length} of ${documents.length} shown`}</p>
              </div>
              {/* UI REFINEMENT: the inline-styled flex wrapper is now
                  .dt-toolbar, so "+ New Document" and the search box
                  share one row, one height (--control-h) and wrap
                  together on small screens. */}
              <div className="dt-toolbar">
                {/* "New Document" button — ADMIN-ONLY. Regular users
                    only handle/process/move documents already
                    assigned to them; they don't create new document/
                    request records. Assigning a handler to a newly
                    created document remains a separate, admin-only
                    step via the dropdown in the detail panel below.
                    Enforced server-side too — see require_admin() on
                    create_document() in routes/document.py.

                    UI REFINEMENT: was a one-off inline-styled button.
                    Now uses the shared button classes — dt-btn-primary
                    (solid blue, the one forward action on this screen)
                    at the toolbar size (dt-btn-lg) — so it is visibly
                    the primary control next to the ghost/danger
                    buttons elsewhere. onClick is unchanged. */}
                {is_admin && (
                  <button
                    type="button"
                    className="dt-btn dt-btn-primary dt-btn-lg"
                    onClick={() => { setNewDocError(null); setNewDocOpen(true); }}
                  >
                    + New Document
                  </button>
                )}

                {/* PERSONNEL-CONTROL REMOVAL: the admin-only "Add person"
                    dropdown/combobox used to sit here. Administrators no
                    longer add, remove, or pick personnel from Document
                    Tracking at all, so the whole control (and with it the
                    add-a-name view and the per-row remove/trash button) is
                    gone from this header. Everything else in this header —
                    the "+ New Document" button and the search box — is
                    unchanged. */}
                <input
                  id="dt-search-input"
                  name="document-search"
                  className="dt-search"
                  type="text"
                  placeholder="Search title, ID, owner"
                  aria-label="Search documents by title, ID or owner"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            </div>

            <div className="dt-list">
              {/* SMOOTH-LOADING FIX: shimmering placeholder rows for the
                  genuinely empty initial load only (documents.length === 0),
                  so the panel doesn't sit blank while the first fetch is in
                  flight. A background reload — realtime update, filter
                  change, action refresh — leaves the existing rows on
                  screen instead of flashing back to this skeleton, since
                  `documents` isn't cleared before a refetch. */}
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
              {filtered.map((doc) => {
                const style = STATUS_STYLES[doc.status] || STATUS_STYLES["In review"];
                return (
                  <button
                    key={doc.id}
                    className="dt-row"
                    data-selected={selectedId === doc.id}
                    onClick={() => setSelectedId(doc.id)}
                  >
                    {/* UI REFINEMENT: the row's three lines are now
                        separate, individually styled fields instead of
                        dot-joined strings — document number (bold) and
                        type on line 1, title on line 2, and on line 3
                        the handler's name (emphasised) and the last
                        update time. Same data as before, just
                        structured so it scans. */}
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
              })}
            </div>
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

          {/*
            FIX (layout): this branch was missing entirely. When there
            is no document to show — 0 documents in the system, or a
            list that's loaded but nothing selected yet — none of the
            three branches above matched and the right column rendered
            completely empty, which is what made the panel look
            cut-off/half-visible next to the Documents list. This keeps
            a properly sized dt-detail-card in place at all times so
            the two-column layout never collapses.
          */}
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
                }}
              >
                {documents.length === 0
                  ? "No documents yet — they'll appear here once submitted."
                  : "Select a document from the list to see its details."}
              </div>
            </div>
          )}

          {!detailLoading && !detailError && selected && (
            <div className="dt-card dt-detail-card">
              <div className="dt-card-head">
                <div>
                  <h2>{selected.title}</h2>
                  {/* UI REFINEMENT: dt-detail-docno gives the document
                      number tabular figures + a slightly heavier weight
                      so it reads as the record's identifier, distinct
                      from the title above it. */}
                  <p className="dt-detail-docno">{selected.docNumber}</p>
                  {/* WORKFLOW FIX: surfaces the Registry Number / release
                      destination in the document's header info once
                      they've been saved, for everyone viewing this
                      document — pulled from the top-level fields
                      get_document_detail() now returns. */}
                  {(selected.registryNumber || selected.releaseDestination) && (
                    <p style={{ fontSize: 12, color: "var(--ink-mid)", margin: "2px 0 0" }}>
                      {selected.registryNumber && <>Registry No. <strong>{selected.registryNumber}</strong></>}
                      {selected.registryNumber && selected.releaseDestination && " · "}
                      {selected.releaseDestination && <>Released to <strong>{selected.releaseDestination}</strong></>}
                    </p>
                  )}
                  {/* PERSONNEL-CONTROL REMOVAL: the two explanatory notes
                      that used to sit here ("Locked — this document has
                      already progressed…" and the restore-after-deletion
                      note) only ever existed to explain the state of the
                      removed dropdown, so they are gone with it. The
                      server-side rules they described — the handler lock in
                      assign_handler() and its reassign-after-delete
                      exception — are untouched in routes/document.py. */}
                </div>
                {/* UI REFINEMENT: the inline column wrapper is now
                    .dt-head-actions — "Saved" note and Delete sit on
                    one line, right-aligned, with Delete as a quiet
                    outlined-red button (never a filled red block). */}
                <div className="dt-head-actions">
                  <span className="dt-save-note">
                    {justSaved ? "Saved" : "\u00A0"}
                  </span>
                  {/* Delete — ADMIN-ONLY. Regular users have no access to
                      this at all: the button simply isn't rendered for
                      them, and routes/document.py's DELETE
                      /api/documents/<id> also enforces require_admin()
                      server-side, so a non-admin session gets a 403 even
                      if it somehow calls the endpoint directly. */}
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
                  // WORKFLOW FIX: per-stage gating for the three special
                  // stages — mirrors the checks complete_stage() enforces
                  // server-side in routes/document.py, so "Mark complete"
                  // is disabled here before ever hitting that rejection
                  // in normal use.
                  const stageRegistryMissing = isRegistryNumberStageLabel(stage.label) && !stage.registryNumber;
                  const stageReleaseMissing = isReleasingStageLabel(stage.label) && !stage.releaseDestination;
                  // POSTING PERIOD FIX: the stage can't be completed
                  // until it's been started AND POSTING_PERIOD_DAYS have
                  // actually elapsed since posting_start_at.
                  const isPostingStage = isPostingPeriodStageLabel(stage.label);
                  // 10 DAYS REGISTRATION FIX: the 10-day posting window is
                  // now an optional, per-document choice made directly on
                  // this stage — via the "10 Days Registration" button in
                  // the action panel below — instead of something derived
                  // from the document's type at creation time. If nobody
                  // has clicked that button yet (stage.postingStartAt is
                  // empty), this stage is a plain pass-through step and
                  // "Mark complete → next step" is available immediately,
                  // same as any other stage. Once clicked, the existing
                  // rules apply: POSTING_PERIOD_DAYS must actually elapse,
                  // and (mirroring the matching check in complete_stage()
                  // in routes/document.py) an explanatory comment must be
                  // added on this stage before "Mark complete" unlocks.
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
                  // MARK-COMPLETE VISIBILITY FIX (NEW): markCompleteDisabled
                  // being true previously gave NO visible signal beyond the
                  // click silently doing nothing — the button (dt-btn
                  // dt-btn-primary) kept its normal solid-blue look whether
                  // it was clickable or not, since disabling a <button> only
                  // stops the click handler from firing, it doesn't change
                  // how the button is painted unless CSS specifically
                  // targets :disabled. That's exactly the reported symptom:
                  // "I click Mark complete → next step and nothing happens."
                  // In reality the click IS being blocked, correctly, by the
                  // very same rule complete_stage() enforces server-side
                  // (e.g. the Posting Period's 10-day window not having
                  // elapsed yet) — the only thing missing was feedback.
                  //
                  // This computes a plain-language reason for the *current*
                  // block (checked in the same order complete_stage() in
                  // routes/document.py checks them), so it can be shown
                  // directly under the button below. It does not change
                  // markCompleteDisabled itself or any of the underlying
                  // gating rules — those are correct as-is.
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
                  // STAGE PERMISSION FIX (NEW): does the current user's
                  // role carry the specific document_stage_* permission
                  // this stage requires? Mirrors
                  // block_if_no_stage_permission() in routes/document.py
                  // exactly — a stage whose label doesn't match any of the
                  // six known stages has no required permission
                  // (stagePermission === null) and stays unrestricted,
                  // same as the backend. This is what scopes each role to
                  // only its own stage: a user whose only permission is
                  // "document_stage_registry_number" gets
                  // userHasStageAccess === false on every other stage, so
                  // the action panel below never renders for them there —
                  // only on "Assign Registry Number".
                  const stagePermission = stagePermissionForLabel(stage.label);
                  const userHasStageAccess = !stagePermission || hasAccess(stagePermission);
                  // PER-STAGE HANDLER FIX (NEW): this stage's OWN
                  // personnel, read straight off the stage row and
                  // nothing else. No fallback to selected.owner, to a
                  // neighbouring stage, or to handlers[0] — when this
                  // stage has nobody assigned, the name shown is
                  // UNSIGNED_LABEL.
                  const stageHandlerId = stage.assignedHandlerId ?? null;
                  const stageHandlerName = stage.assignedHandlerName || UNSIGNED_LABEL;
                  // The assigned person may have been soft-deleted out of
                  // the active pool, in which case there'd be no matching
                  // <option> for the select's value and the browser would
                  // silently show the first option instead — the exact
                  // "shows another name" symptom being fixed. Rendering a
                  // dedicated option for them keeps the select honest.
                  const stageHandlerMissingFromPool =
                    stageHandlerId != null && !handlers.some((h) => h.id === stageHandlerId);
                  // STAGE ASSIGNMENT FIX (NEW): whether THIS stage
                  // currently has nobody handling it. The blocked/action/
                  // admin panels below used to gate on the document-level
                  // `isUnassigned` (derived only from
                  // documents.assigned_handler_id), so a stage actually
                  // staffed via a Document Tracking role — e.g. jamaica
                  // holding "Registration", surfaced above as
                  // stageHandlerName via the ROLE-BASED HANDLER FIX — could
                  // still show "Unassigned — assign a handler before this
                  // step can be worked" and block "Mark complete", even
                  // though "Currently handling" already correctly showed
                  // her name. Basing this on the exact same resolved name
                  // shown in "Currently handling" keeps these panels
                  // consistent with what's actually displayed, and with
                  // the backend (complete_stage() in document.py never
                  // required a document-level handler in the first place —
                  // only block_if_no_stage_permission()).
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
                            {/* DOCUMENT-NUMBER-ON-STAGE FIX (NEW): every
                                stage now shows the document's own doc_number
                                right above its label, so whoever is
                                viewing/processing a stage can always tell at
                                a glance which document they're on — this
                                matters most once multiple documents are
                                open/worked across sessions or when scanning
                                a long timeline. Sourced straight from
                                selected.docNumber (already resolved via
                                mapDocumentSummary()/_summarize_document()),
                                so no backend change or extra request is
                                needed, and this is purely an added display
                                line — it doesn't affect stage.label,
                                stage.detail, gating, or any other existing
                                behavior.

                                UI REFINEMENT: the inline style on this line
                                moved into .dt-step-docno in the stylesheet
                                (same text, same content) so it stays a
                                quiet reference line above the stage name. */}
                            <p className="dt-step-docno">
                              Document No: {selected.docNumber}
                            </p>
                            <p className="dt-step-label">{stage.label}</p>
                            <p className="dt-step-detail">{stage.detail}</p>
                            <p className="dt-step-date">{stage.date}</p>
                            {/* WORKFLOW FIX: surfaces Registry Number /
                                release destination on their respective
                                stages, for everyone (admins included) —
                                not just while the stage is active — so
                                this information stays visible in the
                                timeline/history once entered. */}
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
                            {/* POSTING PERIOD FIX: surfaces the posting
                                window on its stage, for everyone (admins
                                included) — not just while the stage is
                                active — so this stays visible in the
                                timeline/history once started. */}
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

                        {/* PER-STAGE HANDLER FIX: "Currently handling"
                            for THIS step only, still read straight off
                            this stage's own assigned_handler_id, showing
                            "Unsigned" when it has none, and rendered for
                            every stage so the timeline stays a per-stage
                            record of who is/was responsible for each
                            step.

                            PERSONNEL-CONTROL REMOVAL: this is now
                            READ-ONLY for everyone, administrators
                            included. It previously rendered a <select>
                            for whoever could manage personnel, letting an
                            admin pick the person for this step; that
                            control has been removed, so the name is
                            simply displayed.

                            UI REFINEMENT: the inline style on the name
                            moved into .dt-handler-name, and
                            data-unsigned lets the stylesheet mute the
                            "Unsigned" placeholder so an empty stage
                            reads as empty rather than as a person's
                            name. The displayed text is unchanged. */}
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

                        {/* Blocked panel — active stage, but no handler is
                            assigned yet. Shown instead of either panel
                            below, for admins and regular users alike:
                            nobody can work an unassigned stage, and there
                            is no sign/authorize override for admins.

                            PERSONNEL-CONTROL REMOVAL: the line that told
                            an admin to use the "Document handler"
                            dropdown has been dropped along with that
                            dropdown.

                            STAGE ASSIGNMENT FIX: gated on stageIsUnassigned
                            (this stage's own resolved handler, the same
                            value shown in "Currently handling" above) —
                            see the definition of stageIsUnassigned above
                            for why the old document-level `isUnassigned`
                            was wrong here. */}
                        {isActive && stageIsUnassigned && (
                          <div className="dt-active-panel dt-active-panel-blocked">
                            <span className="dt-active-panel-label">
                              Unassigned — assign a handler before this step can be worked
                            </span>
                          </div>
                        )}

                        {/* Action panel — only the active (current) stage gets one,
                            and only for the assigned, non-admin user, and only
                            once a handler is actually assigned. This is the ONLY
                            place a stage can be completed, flagged, rejected, or
                            commented on — Administrators never get this panel,
                            see the read-only admin panel below instead.

                            STAGE PERMISSION FIX (NEW): also gated on
                            userHasStageAccess — a non-admin, assigned user
                            only sees this on the one stage their role's
                            document_stage_* permission actually covers.
                            See the "not your role" panel just below this
                            one for what renders instead on every other
                            active stage.

                            STAGE ASSIGNMENT FIX: gated on
                            !stageIsUnassigned (this stage's own resolved
                            handler) instead of the document-level
                            !isUnassigned — see stageIsUnassigned above. */}
                        {isActive && !is_admin && !stageIsUnassigned && userHasStageAccess && (
                          <div className="dt-active-panel">
                            <span className="dt-active-panel-label">
                              Current step — action needed
                            </span>

                            {/* 10 DAYS REGISTRATION FIX: this control now
                                always renders on the Posting Period
                                stage, for every document. Clicking
                                "10 Days Registration" starts the 10-day
                                window on THIS stage — if it's never
                                clicked, "Mark complete → next step"
                                below works right away with no waiting
                                and no forced comment, since
                                stagePostingNotElapsed /
                                stagePostingCommentMissing both stay
                                false until the button is clicked. */}
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

                            {/* WORKFLOW FIX: Registry Number entry — only
                                rendered on the "Assign Registry Number"
                                stage. Once saved, the input locks
                                (matching save_registry_number()'s one-way
                                write in routes/document.py) and
                                "Mark complete" unlocks. */}
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

                            {/* WORKFLOW FIX: release-destination selection
                                — only rendered on the final "Releasing"
                                stage. Once saved, "Mark complete" unlocks
                                and the document finishes the pipeline as
                                before. */}
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
                                // MARK-COMPLETE VISIBILITY FIX: explicit
                                // inline dimming so the button visibly
                                // looks locked whenever markCompleteDisabled
                                // is true, regardless of what dt-btn /
                                // dt-btn-primary do (or don't do) for
                                // :disabled in the stylesheet. Purely
                                // visual — the disabled attribute above is
                                // still what actually blocks the click, and
                                // that logic is unchanged.
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

                            {/* MARK-COMPLETE VISIBILITY FIX: plain-language
                                explanation for why "Mark complete" is
                                currently locked, shown right under the
                                action row. Only rendered while genuinely
                                blocked by one of the workflow rules above
                                (never for the transient `busy` state, which
                                resolves on its own within a moment), so
                                this never contradicts what the button is
                                doing — it just says out loud what
                                markCompleteDisabled was already enforcing
                                silently. */}
                            {markCompleteDisabledReason && (
                              <p style={{ fontSize: 12, color: "var(--ink-mid)", margin: "8px 0 0" }}>
                                {markCompleteDisabledReason}
                              </p>
                            )}

                            <form
                              className="dt-comment-form"
                              onSubmit={(e) => {
                                e.preventDefault();
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

                        {/* STAGE PERMISSION FIX (NEW): active stage,
                            handler assigned, non-admin — but this user's
                            role doesn't carry the document_stage_*
                            permission this specific stage requires. This
                            is the panel that now shows on Registration /
                            Civil Registrar / etc. for a user whose only
                            role is, say, "Assign Registry Number" —
                            mirroring the backend's
                            block_if_no_stage_permission() 403 on
                            complete/flag/reject/comment/registry-number/
                            release-destination/posting-period, so no
                            action control that would just hit that
                            rejection is ever rendered here.

                            STAGE ASSIGNMENT FIX: gated on
                            !stageIsUnassigned instead of the
                            document-level !isUnassigned — see
                            stageIsUnassigned above. */}
                        {isActive && !is_admin && !stageIsUnassigned && !userHasStageAccess && (
                          <div className="dt-active-panel dt-active-panel-blocked">
                            <span className="dt-active-panel-label">
                              This step belongs to a different role — you don't have access to work on it
                            </span>
                          </div>
                        )}

                        {/* Admin view — STRICTLY VIEW-ONLY. Per role
                            policy, Administrators only monitor/view
                            document status and create new documents
                            (plus personnel/assignment administration
                            elsewhere on this screen); they can never
                            complete, flag, reject, or comment on a
                            stage, whether or not a handler is assigned.
                            No action buttons or comment form are
                            rendered here — this mirrors the backend,
                            which rejects these same four actions from
                            an admin session via block_if_admin() in
                            routes/document.py, so there is no button
                            here that could ever hit that 403.

                            PER-STAGE HANDLER FIX: the person named here
                            is this stage's own handler (or "Unsigned"),
                            never the document-level one.

                            STAGE ASSIGNMENT FIX: gated on
                            !stageIsUnassigned instead of the
                            document-level !isUnassigned — see
                            stageIsUnassigned above. */}
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

      {/* "New Document" modal. Simple overlay (no new dependency)
          matching the styling already used inline elsewhere in this
          file. Escape / backdrop click closes it; Enter in the title
          field submits. Only reachable via the admin-only "+ New
          Document" trigger button above.
          Backdrop is a plain translucent dim (no blur), so the
          dashboard behind it stays fully visible, just darkened —
          matching the reference screenshot.
          position: "fixed" + inset: 0 covers the entire viewport
          (sidebar and topbar included), matching how Home's own
          logout confirmation modal behaves. */}
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
                ref={newDocTitleRef}
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
                  // Switching away from "Other" clears whatever was
                  // typed, so it can't linger and get silently reused
                  // if the person picks "Other" again later.
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

              {/* Free-text field revealed only when "Other" is selected —
                  this is what actually gets sent as doc_type in that case,
                  never the literal word "Other". */}
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

      {/* "Request changes" modal, replacing window.prompt(). Same
          overlay pattern as the New Document modal above: backdrop
          click or Escape cancels, Enter in the textarea would insert a
          newline (expected for a note), so submission is button-only
          here rather than on Enter. Only reachable from the non-admin
          action panel above, since admins never see the "Request
          changes" trigger button.
          Backdrop is a plain translucent dim (no blur), matching the
          other modals.
          position: "fixed" + inset: 0 covers the entire viewport
          (sidebar and topbar included), same as the New Document
          modal above. */}
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
      {/* Generic confirm modal — replaces window.confirm() for Reject
          and Delete, so the browser's plain native dialog never
          appears; this uses the same overlay/card styling as the
          "New Document" and "Request changes" modals above. Backdrop
          click or Escape cancels (same as the other modals); the
          primary button is autofocused so Enter confirms immediately.
          Same plain translucent dim backdrop as the other two modals,
          kept consistent across all three (no blur).
          position: "fixed" + inset: 0 covers the entire viewport
          (sidebar and topbar included), same as the other two modals. */}
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