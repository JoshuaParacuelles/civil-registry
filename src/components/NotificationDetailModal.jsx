import React, { useEffect } from "react";
import "./NotificationDetailModal.css";
import { useRequestDetail } from "../hooks/useRequestDetail";

const CloseIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const BirthIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.6" />
    <path d="M4 21c0-4 3.5-6 8-6s8 2 8 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

const MarriageIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
  </svg>
);

const DeathIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 3v18M7 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

const SystemIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
    <path d="M12 8v5M12 16h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const NotifTypeIcon = ({ type }) => {
  if (type === "birth") return <BirthIcon />;
  if (type === "marriage") return <MarriageIcon />;
  if (type === "death") return <DeathIcon />;
  return <SystemIcon />;
};

const detailValue = (v) => (v === null || v === undefined || v === "" ? "—" : String(v));

const NotificationDetailModal = ({
  notification,
  onClose,
  canAccess,
  timeAgo,
  sigFailed,
  setSigFailed,
  sigZoomed,
  setSigZoomed,
  statusDraft,
  setStatusDraft,
  statusNote,
  setStatusNote,
  statusSaving,
  updateRequestStatus,
  NOTIF_TARGETS,
  TYPE_SECTIONS,
  COMMON_SECTIONS,
  SIGNATURE_FIELD_KEY,
  getSignatureSrc,
  REQUEST_STATUS_OPTIONS,
  REQUEST_STATUS_LABELS,
  fetchSnapshot, // async (notification) => latest request snapshot
}) => {
  // Hooks must run before any early return.
  const { key, phase, snapshot, refresh, retry } = useRequestDetail(notification, fetchSnapshot);

  const snap = snapshot || {};
  const currentStatus = (snap.status || "").toUpperCase();
  const loading = phase === "loading";
  const ready = phase === "ready";
  const editorLocked = loading || phase === "fallback";

  // Once fresh data lands, align the dropdown with the real status (and reset per-notification state).
  useEffect(() => {
    if (!key) return;
    setSigFailed(false);
    setSigZoomed(false);
    setStatusNote("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (ready) setStatusDraft(currentStatus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, key, currentStatus]);

  if (!notification) return null;

  const type = notification.record_type;
  const sections = [TYPE_SECTIONS[type], ...COMMON_SECTIONS].filter(Boolean);
  const target = NOTIF_TARGETS[type]; // only used for the header icon color now
  const signatureSrc = getSignatureSrc(snap, type, notification.record_id);
  const showSignatureImage = Boolean(snap.has_signature) && !sigFailed;

  // The header pill always reflects the SAVED status, never the dropdown draft.
  const topStatusValue = currentStatus;
  const topStatusLabel = REQUEST_STATUS_LABELS[topStatusValue] || topStatusValue;

  const statusOptions = Array.from(new Set([...(REQUEST_STATUS_OPTIONS || []), "REJECTED"]));
  const statusOptionLabel = (status) =>
    REQUEST_STATUS_LABELS[status] || (status === "REJECTED" ? "Rejected" : status);
  const selectValue = statusDraft || currentStatus;
  const isRejecting = selectValue === "REJECTED";
  const remarkMissing = isRejecting && !statusNote.trim();
  const FINAL_STATUSES = ["COMPLETED", "REJECTED"];
  const isFinalized = FINAL_STATUSES.includes(currentStatus);

  const handleUpdate = async () => {
    try {
      await updateRequestStatus();
    } finally {
      refresh(); // pull the new saved status so the header pill updates
    }
  };

  return (
    <div className="notif-detail-overlay" onClick={onClose}>
      <div
        className="notif-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Request details"
        aria-busy={loading}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="notif-detail-header">
          <div className={`notif-icon-wrap ${target ? type : "system"}`}>
            <NotifTypeIcon type={type} />
          </div>
          <div className="notif-detail-heading">
            <h2>{notification.title || "Request details"}</h2>
            <p>
              Control No: <strong>{notification.control_no || "—"}</strong>
              {" · "}
              {timeAgo(notification.created_at)}
            </p>
          </div>

          {loading ? (
            <span className="notif-detail-status skeleton" aria-hidden="true" />
          ) : (
            topStatusValue && (
              <span className={`notif-detail-status ${topStatusValue.toLowerCase()} notif-fade-in`}>
                {topStatusLabel}
              </span>
            )
          )}

          <button type="button" className="notif-detail-close" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <div className={`notif-detail-body ${ready ? "is-ready" : ""}`}>
          {phase === "fallback" && (
            <div className="notif-detail-banner" role="status">
              <span>Couldn't load the latest details. Showing the last saved copy.</span>
              <button type="button" onClick={retry}>Retry</button>
            </div>
          )}

          {!notification.request_snapshot ? (
            <p className="notif-detail-fallback">{notification.message}</p>
          ) : (
            sections.map((section) => (
              <section key={section.title} className="notif-detail-section">
                <h3>{section.title}</h3>
                <dl className="notif-detail-grid">
                  {section.fields.map(([fieldKey, label]) => (
                    <div key={fieldKey} className="notif-detail-field">
                      <dt>{label}</dt>
                      {loading ? (
                        <dd>
                          <span
                            className={`notif-skel ${fieldKey === SIGNATURE_FIELD_KEY ? "block" : ""}`}
                            aria-hidden="true"
                          />
                        </dd>
                      ) : fieldKey === SIGNATURE_FIELD_KEY && showSignatureImage ? (
                        <dd className="notif-detail-signature-wrap">
  <img
    className="notif-detail-signature"
    src={signatureSrc}
    alt="Requester signature — click to enlarge"
    title="Click to enlarge"
    loading="eager"
    decoding="sync"
    onError={() => setSigFailed(true)}
    onClick={() => setSigZoomed(true)}
    role="button"
    tabIndex={0}
    onKeyDown={(e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setSigZoomed(true);
      }
    }}
  />
  {snap.signature_printed_name && (
    <span className="notif-detail-signature-name">{snap.signature_printed_name}</span>
  )}
</dd>
                      ) : (
                        <dd>{detailValue(snap[fieldKey])}</dd>
                      )}
                    </div>
                  ))}
                </dl>
              </section>
            ))
          )}

          {canAccess("citizen_requests") && (
            <section className="notif-detail-section">
              <h3>Request Status</h3>
              <div className="notif-status-editor">
                {loading ? (
                  <span className="notif-skel select" aria-hidden="true" />
                ) : (
                  <select
                    className="notif-status-select"
                    value={selectValue}
                    onChange={(e) => setStatusDraft(e.target.value)}
                    disabled={statusSaving || isFinalized || editorLocked}
                  >
                    {statusOptions.map((status) => (
                      <option key={status} value={status}>{statusOptionLabel(status)}</option>
                    ))}
                  </select>
                )}

                {!isFinalized && !loading && (
                  <>
                    <label className="notif-status-note-label" htmlFor="notif-status-remark">
                      Remark{isRejecting ? " (required)" : ""}
                    </label>
                    <textarea
                      id="notif-status-remark"
                      className="notif-status-note"
                      placeholder="Remark to include in the citizen's email…"
                      value={statusNote}
                      onChange={(e) => setStatusNote(e.target.value)}
                      disabled={statusSaving || editorLocked}
                    />
                    <button
                      type="button"
                      className={`notif-status-update-btn ${isRejecting ? "reject" : ""}`}
                      onClick={handleUpdate}
                      disabled={statusSaving || editorLocked || selectValue === currentStatus || remarkMissing}
                      title={remarkMissing ? "Enter a remark to reject" : undefined}
                    >
                      {statusSaving ? "Updating…" : isRejecting ? "Reject Request" : "Update Status"}
                    </button>
                  </>
                )}
              </div>
            </section>
          )}
        </div>

        <div className="notif-detail-footer">
          <button type="button" className="logout-cancel-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      {sigZoomed && (
        <div
          className="sig-zoom-overlay"
          onClick={(e) => {
            e.stopPropagation();
            setSigZoomed(false);
          }}
        >
          <img
            className="sig-zoom-img"
            src={signatureSrc}
            alt="Requester signature (enlarged)"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            className="sig-zoom-close"
            aria-label="Close enlarged signature"
            onClick={(e) => {
              e.stopPropagation();
              setSigZoomed(false);
            }}
          >
            <CloseIcon />
          </button>
        </div>
      )}
    </div>
  );
};

export default NotificationDetailModal;