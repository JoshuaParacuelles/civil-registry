import { useEffect, useState } from "react";
import { supabase } from "../services/supabaseClient";
import "./NotificationDetailModal.css";

/* ------------------------------------------------------------------
   CONFIG: adjust these to match your real Supabase table/columns.
------------------------------------------------------------------- */
const TABLE = "marriage_requests"; // <-- your table name
const ID_FIELD = "id";             // <-- column used to find the request
const STATUS_OPTIONS = ["Pending Review", "In Progress", "Completed"];

const SECTIONS = [
  {
    title: "Marriage information",
    fields: [
      ["Husband's full name", "husband_name"],
      ["Wife's maiden name", "wife_maiden_name"],
      ["Date of marriage", "date_of_marriage"],
      ["Place of marriage", "place_of_marriage"],
    ],
  },
  {
    title: "Request details",
    fields: [
      ["Form type", "form_type"],
      ["Number of copies", "number_of_copies"],
      ["Purpose", "purpose"],
      ["Search by", "search_by"],
    ],
  },
  {
    title: "Requester",
    fields: [
      ["Name", "requester_name"],
      ["Relationship to owner", "relationship_to_owner"],
      ["Address", "requester_address"],
      ["Telephone", "requester_telephone"],
      ["Email", "requester_email"],
      ["Signature over printed name", "requester_signature"],
    ],
  },
  {
    title: "Registry reference",
    fields: [
      ["Registry no.", "registry_no"],
      ["Date of registration", "date_of_registration"],
      ["Book", "book"],
      ["Page", "page"],
    ],
  },
];

const show = (v) => (v === null || v === undefined || v === "" ? "—" : String(v));

export default function NotificationDetailModal({
  notification,
  onClose,
  onOpenVerifier,
  onStatusChange,
}) {
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const requestId = notification?.request_id ?? notification?.data?.id ?? notification?.id;

  // Always load the FULL record. Never render status/fields from the
  // notification snapshot, which is what caused Pending -> Completed flicker.
  useEffect(() => {
    if (!notification) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setRequest(null);

    (async () => {
      const { data, error } = await supabase
        .from(TABLE)
        .select("*")
        .eq(ID_FIELD, requestId)
        .single();

      if (cancelled) return;
      if (error) setError(error.message);
      else setRequest(data);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [notification, requestId]);

  if (!notification) return null;

  const status = request?.status;
  const isCompleted = status === "Completed";

  const handleStatusChange = async (e) => {
    const next = e.target.value;
    setSaving(true);
    const { error } = await supabase
      .from(TABLE)
      .update({ status: next })
      .eq(ID_FIELD, requestId);
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setRequest((r) => ({ ...r, status: next }));
    onStatusChange?.(requestId, next);
  };

  const statusClass = (status || "").toLowerCase().replace(/\s+/g, "-");

  return (
    <div className="ndm-overlay" onClick={onClose}>
      <div className="ndm-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="ndm-header">
          <div className="ndm-title-wrap">
            <h2 className="ndm-title">
              {notification.title || "New Marriage Certificate Request"}
            </h2>
            <p className="ndm-sub">
              Control No: <code>{request?.control_no ?? notification.control_no ?? "—"}</code>
            </p>
          </div>

          {/* Badge only shows once real status is loaded */}
          {!loading && status && (
            <span className={`ndm-badge ndm-badge-${statusClass}`}>{status}</span>
          )}

          <button className="ndm-x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {/* Body */}
        <div className="ndm-body">
          {loading && <p className="ndm-loading">Loading request…</p>}
          {error && <p className="ndm-error">{error}</p>}

          {!loading && request && (
            <>
              {SECTIONS.map((section) => (
                <section key={section.title} className="ndm-section">
                  <h3>{section.title}</h3>
                  <div className="ndm-grid">
                    {section.fields.map(([label, key]) => (
                      <div key={key} className="ndm-field">
                        <span className="ndm-label">{label}</span>
                        <span className="ndm-value">{show(request[key])}</span>
                      </div>
                    ))}
                  </div>
                </section>
              ))}

              <section className="ndm-section">
                <h3>Request Status</h3>
                <select
                  className="ndm-select"
                  value={status}
                  disabled={isCompleted || saving}
                  onChange={handleStatusChange}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                {/* "can no longer be changed" message removed.
                    The select is still disabled when Completed. */}
              </section>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="ndm-footer">
          <button className="ndm-btn ndm-btn-secondary" onClick={onClose}>
            Close
          </button>
          <button
            className="ndm-btn ndm-btn-primary"
            disabled={loading || !request}
            onClick={() => onOpenVerifier?.(request)}
          >
            Open in Marriage Verifier
          </button>
        </div>
      </div>
    </div>
  );
}