import { useState, useCallback, useEffect } from "react";
import {
  browseExternalIndividuals,
  fetchExternalIndividuals,
  fetchExternalIndividual,
} from "../../services/externalIndividualsService";
import "./ExternalIndividualsLookup.css";

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const toTitleCase = (str = "") =>
  String(str || "").replace(/\b\w/g, (c) => c.toUpperCase());

// Some records put junk placeholder text in real fields
// (e.g. tel_no: "None", "none", "-", suffix: "N/A"). Treat those as empty.
const EMPTY_VALUES = new Set(["", "none", "n/a", "-", "null", "undefined"]);

const clean = (val) => {
  if (val === undefined || val === null) return undefined;
  const str = String(val).trim();
  if (EMPTY_VALUES.has(str.toLowerCase())) return undefined;
  return str;
};

/**
 * Merge the flat/normalized fields with whatever is inside raw.attributes.
 * The API sometimes puts richer data (blood_type, religion, height, weight,
 * tel_no, fax_no, website, photo) only inside `raw.attributes`, so we fall
 * back to that when the top-level field is missing.
 */
const mergePersonFields = (person) => {
  if (!person) return {};
  const attrs = person.raw?.attributes || {};

  const pickField = (...keys) => {
    for (const k of keys) {
      const v = clean(person[k]) ?? clean(attrs[k]);
      if (v !== undefined) return v;
    }
    return undefined;
  };

  return {
    entity_no:    pickField("entity_no"),
    prefix:       pickField("prefix"),
    first_name:   pickField("first_name"),
    middle_name:  pickField("middle_name"),
    last_name:    pickField("last_name"),
    suffix:       pickField("suffix"),
    full_name:    pickField("full_name"),
    gender:       pickField("gender"),
    birth_date:   pickField("birth_date"),
    place_birth:  pickField("place_birth"),
    civil_status: pickField("civil_status"),
    citizenship:  pickField("citizenship"),
    religion:     pickField("religion"),
    blood_type:   pickField("blood_type"),
    height:       pickField("height"),
    weight:       pickField("weight"),
    mobile_no:    pickField("mobile_no"),
    tel_no:       pickField("tel_no"),
    fax_no:       pickField("fax_no"),
    email_add:    pickField("email_add"),
    website:      pickField("website"),
    status:       pickField("status"),
    photo:        pickField("photo"),
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// DETAIL MODAL — styled to match NotificationDetailModal (blue theme)
// ─────────────────────────────────────────────────────────────────────────────
const PersonIcon = ({ color = "#ffffff" }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color}
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const SectionHeader = ({ title }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0 2px" }}>
    <span style={{
      fontSize: 10, fontWeight: 800, letterSpacing: "0.10em",
      textTransform: "uppercase", color: "#1d4ed8", whiteSpace: "nowrap",
    }}>
      {title}
    </span>
    <div style={{ flex: 1, height: 1, background: "#dbeafe" }} />
  </div>
);

const DetailRow = ({ label, value, mono, noBorder }) => (
  <div style={{
    display: "flex", flexDirection: "column", gap: 3,
    padding: "10px 0",
    borderBottom: noBorder ? "none" : "1px solid #f0f5ff",
  }}>
    <span style={{
      fontSize: 10, fontWeight: 800, color: "#93c5fd",
      letterSpacing: "0.07em", textTransform: "uppercase",
    }}>
      {label}
    </span>
    <span style={{
      fontSize: 13.5, fontWeight: 600, color: "#0f172a",
      fontFamily: mono ? "'DM Mono', monospace" : "inherit",
      letterSpacing: mono ? "0.04em" : "inherit",
      wordBreak: "break-word",
    }}>
      {value || <span style={{ color: "#cbd5e1", fontStyle: "italic", fontWeight: 400 }}>—</span>}
    </span>
  </div>
);

const StatusBadge = ({ status }) => {
  const isActive = /active/i.test(status || "");
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 10px", borderRadius: 999,
      fontSize: 11, fontWeight: 700, letterSpacing: "0.04em",
      background: isActive ? "rgba(29,78,216,0.10)" : "rgba(148,163,184,0.15)",
      color:      isActive ? "#1d4ed8"              : "#64748b",
      border: `1px solid ${isActive ? "rgba(29,78,216,0.25)" : "rgba(148,163,184,0.3)"}`,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: "50%",
        background: isActive ? "#2563eb" : "#94a3b8",
        flexShrink: 0,
      }} />
      {status || "Unknown"}
    </span>
  );
};

const ExternalIndividualDetailModal = ({ person, onClose }) => {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!person) return null;

  const f = mergePersonFields(person);

  const fullName =
    f.full_name ||
    [f.prefix, f.first_name, f.middle_name, f.last_name, f.suffix]
      .filter(Boolean).join(" ") ||
    f.entity_no;

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="External individual detail"
      style={{
        position: "fixed", inset: 0,
        background: "rgba(15,23,42,0.50)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 4000, padding: 20,
        backdropFilter: "blur(6px)",
        animation: "eiOverlayIn 0.18s ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 520,
          background: "#ffffff",
          borderRadius: 22,
          boxShadow: "0 32px 72px rgba(29,78,216,0.18), 0 4px 16px rgba(0,0,0,0.08)",
          overflow: "hidden",
          animation: "eiModalIn 0.22s cubic-bezier(0.22,1,0.36,1)",
          fontFamily: "'DM Sans', sans-serif",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* ── Blue header ── */}
        <div style={{
          background: "linear-gradient(135deg, #1d4ed8 0%, #2563eb 60%, #3b82f6 100%)",
          padding: "20px 22px 18px",
          display: "flex", alignItems: "flex-start",
          justifyContent: "space-between", gap: 12,
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
            <div style={{
              width: 46, height: 46, borderRadius: 13,
              background: "rgba(255,255,255,0.18)",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
              border: "1px solid rgba(255,255,255,0.28)",
              overflow: "hidden",
            }}>
              <PersonIcon />
            </div>
            <div>
              <div style={{
                fontSize: 10.5, fontWeight: 800, color: "rgba(255,255,255,0.70)",
                letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 3,
              }}>
                SCIMS Record
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#ffffff", lineHeight: 1.3 }}>
                {toTitleCase(fullName)}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 30, height: 30, borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.28)",
              background: "rgba(255,255,255,0.12)",
              cursor: "pointer", display: "flex",
              alignItems: "center", justifyContent: "center",
              color: "#ffffff", flexShrink: 0,
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.22)"}
            onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.12)"}
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M2 2l10 10M12 2L2 12" />
            </svg>
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div style={{ overflowY: "auto", flex: 1 }}>
          <div style={{ padding: "0 22px 4px" }}>

            <SectionHeader title="Identification" />
            <div style={{
              padding: "10px 0", borderBottom: "1px solid #f0f5ff",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <span style={{
                fontSize: 10, fontWeight: 800, color: "#93c5fd",
                letterSpacing: "0.07em", textTransform: "uppercase",
              }}>Status</span>
              <StatusBadge status={f.status} />
            </div>
            <DetailRow label="Entity No." value={f.entity_no} mono />
            <DetailRow label="Prefix" value={f.prefix} />
            <DetailRow label="First Name" value={toTitleCase(f.first_name)} />
            <DetailRow label="Middle Name" value={toTitleCase(f.middle_name)} />
            <DetailRow label="Last Name" value={toTitleCase(f.last_name)} />
            <DetailRow label="Suffix" value={f.suffix} noBorder />

            <SectionHeader title="Personal Information" />
            <DetailRow label="Gender" value={f.gender} />
            <DetailRow label="Birth Date" value={f.birth_date} />
            <DetailRow label="Place of Birth" value={f.place_birth} />
            <DetailRow label="Civil Status" value={f.civil_status} />
            <DetailRow label="Citizenship" value={f.citizenship} />
            <DetailRow label="Religion" value={f.religion} />
            <DetailRow label="Blood Type" value={f.blood_type} />
            <DetailRow label="Height" value={f.height} />
            <DetailRow label="Weight" value={f.weight} noBorder />

            <SectionHeader title="Contact Information" />
            <DetailRow label="Mobile No." value={f.mobile_no} mono />
            <DetailRow label="Telephone No." value={f.tel_no} mono />
            <DetailRow label="Fax No." value={f.fax_no} mono />
            <DetailRow label="Email Address" value={f.email_add} />
            <DetailRow label="Website" value={f.website} noBorder />

            <SectionHeader title="Other" />
            <DetailRow label="Photo" value={f.photo} noBorder />

          </div>
        </div>

        {/* ── Footer ── */}
        <div style={{
          padding: "12px 22px 18px",
          borderTop: "1px solid #dbeafe",
          display: "flex", gap: 8, justifyContent: "flex-end",
          background: "#f8fbff",
          flexShrink: 0,
        }}>
          <button
            onClick={onClose}
            style={{
              padding: "9px 20px", borderRadius: 10,
              border: "1px solid #bfdbfe",
              background: "#ffffff", color: "#475569",
              fontSize: 13, fontWeight: 700,
              fontFamily: "'DM Sans', sans-serif",
              cursor: "pointer", transition: "all 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#eff6ff"; e.currentTarget.style.color = "#1d4ed8"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "#ffffff"; e.currentTarget.style.color = "#475569"; }}
          >
            Close
          </button>
        </div>
      </div>

      <style>{`
        @keyframes eiOverlayIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes eiModalIn {
          from { opacity: 0; transform: scale(0.93) translateY(12px); }
          to   { opacity: 1; transform: scale(1)    translateY(0); }
        }
      `}</style>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function ExternalIndividualsLookup() {
  const [search, setSearch] = useState("");
  const [entities, setEntities] = useState([]);
  const [status, setStatus] = useState("idle"); // idle | loading | success | error
  const [errorMessage, setErrorMessage] = useState("");

  // True only while an actual search submit is in flight — separate from
  // `status === "loading"` so the initial automatic browse load (page 1 on
  // mount) doesn't make the button say "Searching…" when the user hasn't
  // typed or submitted anything.
  const [isSearching, setIsSearching] = useState(false);

  // Pagination (only meaningful in browse mode, i.e. no active search term)
  const [pagination, setPagination] = useState(null); // { current_page, last_page, per_page, total }
  const [activeSearchTerm, setActiveSearchTerm] = useState(""); // "" = browsing, else searching

  const [selected, setSelected] = useState(null);       // full record shown in modal
  const [selectedId, setSelectedId] = useState(null);    // which row is currently loading
  const [detailStatus, setDetailStatus] = useState("idle"); // idle | loading | success | error
  const [detailError, setDetailError] = useState("");

  // ── Load the masterlist automatically on mount (browse mode, page 1) ──
  const loadPage = useCallback(async (page = 1) => {
    setStatus("loading");
    setErrorMessage("");
    try {
      const result = await browseExternalIndividuals(page);
      setEntities(result.entities || []);
      setPagination(result.pagination || null);
      setActiveSearchTerm("");
      setStatus("success");
    } catch (err) {
      console.error("[ExternalIndividualsLookup] loadPage failed:", err);
      setErrorMessage(err.message || "Something went wrong fetching entities.");
      setEntities([]);
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    loadPage(1);
  }, [loadPage]);

  const runSearch = useCallback(async (term) => {
    const trimmed = term.trim();

    // Empty search box -> just go back to browsing the masterlist
    if (!trimmed) {
      loadPage(1);
      return;
    }

    setStatus("loading");
    setIsSearching(true);
    setErrorMessage("");
    try {
      const result = await fetchExternalIndividuals(trimmed);
      setEntities(result.entities || []);
      setPagination(null); // search mode returns the full matching set, no pager
      setActiveSearchTerm(trimmed);
      setStatus("success");
    } catch (err) {
      console.error("[ExternalIndividualsLookup] search failed:", err);
      setErrorMessage(err.message || "Something went wrong fetching entities.");
      setEntities([]);
      setStatus("error");
    } finally {
      setIsSearching(false);
    }
  }, [loadPage]);

  const handleSubmit = (e) => {
    e.preventDefault();
    runSearch(search);
  };

  const clearSearch = () => {
    setSearch("");
    loadPage(1);
  };

  const viewDetails = useCallback(async (entityNo) => {
    if (!entityNo) {
      console.error("[ExternalIndividualsLookup] viewDetails called with no entityNo");
      setDetailError("This record has no entity number to look up.");
      setDetailStatus("error");
      return;
    }

    setSelectedId(entityNo);
    setDetailStatus("loading");
    setDetailError("");

    try {
      const full = await fetchExternalIndividual(entityNo);
      setSelected(full);       // opens the modal (see render below)
      setDetailStatus("success");
    } catch (err) {
      console.error("[ExternalIndividualsLookup] viewDetails failed for", entityNo, err);
      setDetailError(err.message || "Could not load that individual's full record.");
      setDetailStatus("error");
    }
  }, []);

  const closeModal = useCallback(() => {
    setSelected(null);
    setSelectedId(null);
    setDetailStatus("idle");
  }, []);

  const isBrowsing = !activeSearchTerm;
  const canPage = isBrowsing && pagination && pagination.last_page > 1;

  return (
    <div className="external-individuals-lookup">
      <form onSubmit={handleSubmit} className="external-individuals-lookup__form">
        <input
          id="external-individuals-search"
          name="externalIndividualsSearch"
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by first name, last name, or entity no. (e.g. GLPLCA5343)"
          aria-label="Search SCIMS individuals"
          autoComplete="off"
        />
        <button type="submit" disabled={status === "loading"}>
          {isSearching ? "Searching…" : "Search"}
        </button>
        {activeSearchTerm && (
          <button
            type="button"
            className="external-individuals-lookup__clear-btn"
            onClick={clearSearch}
            disabled={status === "loading"}
          >
            Clear
          </button>
        )}
      </form>

      {status === "loading" && (
        <p className="external-individuals-lookup__status">Loading individuals…</p>
      )}

      {status === "error" && (
        <p className="external-individuals-lookup__status external-individuals-lookup__status--error">
          {errorMessage}
        </p>
      )}

      {status === "success" && entities.length === 0 && (
        <p className="external-individuals-lookup__status">
          {activeSearchTerm
            ? "No matching individuals found in SCIMS."
            : "No individuals available."}
        </p>
      )}

      {/* Inline error just for a failed detail fetch (modal never opened) */}
      {detailStatus === "error" && (
        <p className="external-individuals-lookup__status external-individuals-lookup__status--error">
          {detailError}
        </p>
      )}

      {status === "success" && entities.length > 0 && (
        <>
          <div className="external-individuals-lookup__table-wrap">
            <table className="external-individuals-lookup__table">
              <thead>
                <tr>
                  <th>Entity No.</th>
                  <th>Full Name</th>
                  <th>Gender</th>
                  <th>Birth Date</th>
                  <th>Civil Status</th>
                  <th>Mobile No.</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {entities.map((entity) => (
                  <tr key={entity.entity_no}>
                    <td className="external-individuals-lookup__mono">{entity.entity_no}</td>
                    <td>{toTitleCase(entity.full_name) || "—"}</td>
                    <td>{entity.gender || "—"}</td>
                    <td>{clean(entity.birth_date) || "—"}</td>
                    <td>{entity.civil_status || "—"}</td>
                    <td className="external-individuals-lookup__mono">{clean(entity.mobile_no) || "—"}</td>
                    <td className="external-individuals-lookup__actions">
                      <button
                        type="button"
                        onClick={() => viewDetails(entity.entity_no)}
                        disabled={detailStatus === "loading" && selectedId === entity.entity_no}
                      >
                        {detailStatus === "loading" && selectedId === entity.entity_no
                          ? "Loading…"
                          : "View Details"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="external-individuals-lookup__footer">
            <span className="external-individuals-lookup__count">
              {isBrowsing && pagination
                ? `Showing page ${pagination.current_page} of ${pagination.last_page} (${pagination.total} total)`
                : `Showing ${entities.length} matching ${entities.length === 1 ? "entry" : "entries"}`}
            </span>

            {canPage && (
              <div className="external-individuals-lookup__pager">
                <button
                  type="button"
                  onClick={() => loadPage(pagination.current_page - 1)}
                  disabled={status === "loading" || pagination.current_page <= 1}
                >
                  Prev
                </button>
                <button
                  type="button"
                  onClick={() => loadPage(pagination.current_page + 1)}
                  disabled={status === "loading" || pagination.current_page >= pagination.last_page}
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── The modal itself — renders on top of everything when `selected` is set ── */}
      {selected && (
        <ExternalIndividualDetailModal
          person={selected}
          onClose={closeModal}
        />
      )}
    </div>
  );
}