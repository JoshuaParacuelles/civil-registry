import React from "react";
import "./NotificationDetailModal.css";

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
  onOpenInVerifier,
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
  onReject,
  NOTIF_TARGETS,
  TYPE_SECTIONS,
  COMMON_SECTIONS,
  SIGNATURE_FIELD_KEY,
  getSignatureSrc,
  REQUEST_STATUS_OPTIONS,
  REQUEST_STATUS_LABELS,
  selectedNotif,
}) => {
  if (!notification) return null;

  const snap = notification.request_snapshot || {};
  const type = notification.record_type;
  const sections = [TYPE_SECTIONS[type], ...COMMON_SECTIONS].filter(Boolean);
  const target = NOTIF_TARGETS[type];
  const canOpen = Boolean(target && canAccess(target.permission));
  const signatureSrc = getSignatureSrc(snap, type, notification.record_id);
  const showSignatureImage = Boolean(snap.has_signature) && !sigFailed;
  const topStatusValue = statusDraft || (snap.status || "").toUpperCase();
  const topStatusLabel = REQUEST_STATUS_LABELS[topStatusValue] || topStatusValue;

  return (
    <div className="notif-detail-overlay" onClick={onClose}>
      <div
        className="notif-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Request details"
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
          {topStatusValue && (
            <span className={`notif-detail-status ${String(topStatusValue).toLowerCase()}`}>
              {topStatusLabel}
            </span>
          )}
          <button type="button" className="notif-detail-close" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <div className="notif-detail-body">
          {!notification.request_snapshot ? (
            <p className="notif-detail-fallback">{notification.message}</p>
          ) : (
            sections.map((section) => (
              <section key={section.title} className="notif-detail-section">
                <h3>{section.title}</h3>
                <dl className="notif-detail-grid">
                  {section.fields.map(([key, label]) => (
                    <div key={key} className="notif-detail-field">
                      <dt>{label}</dt>
                      {key === SIGNATURE_FIELD_KEY && showSignatureImage ? (
                        <dd>
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
                        </dd>
                      ) : (
                        <dd>{detailValue(snap[key])}</dd>
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
                <select
                  className="notif-status-select"
                  value={statusDraft}
                  onChange={(e) => setStatusDraft(e.target.value)}
                  disabled={statusSaving}
                >
                  {REQUEST_STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{REQUEST_STATUS_LABELS[s]}</option>
                  ))}
                  {statusDraft === "REJECTED" && (
                    <option value="REJECTED">{REQUEST_STATUS_LABELS.REJECTED}</option>
                  )}
                </select>

                <label className="notif-status-note-label" htmlFor="notif-status-remark">
                  Remark
                </label>
                <textarea
                  id="notif-status-remark"
                  className="notif-status-note"
                  placeholder="Remark to include in the citizen's email (required when rejecting)…"
                  value={statusNote}
                  onChange={(e) => setStatusNote(e.target.value)}
                  disabled={statusSaving}
                />
                <div className="notif-status-actions">
                  <button
                    type="button"
                    className="notif-status-update-btn"
                    onClick={updateRequestStatus}
                    disabled={
                      statusSaving ||
                      statusDraft === (notification?.request_snapshot?.status || "").toUpperCase()
                    }
                  >
                    {statusSaving ? "Updating…" : "Update Status"}
                  </button>

                  {(snap.status || "").toUpperCase() !== "REJECTED" && (
                    <button
                      type="button"
                      className="notif-status-reject-btn"
                      onClick={() => {
                        if (window.confirm("Reject this request? The citizen will be notified by email.")) {
                          onReject();
                        }
                      }}
                      disabled={statusSaving || !statusNote.trim()}
                      title={!statusNote.trim() ? "Enter a remark to reject" : undefined}
                    >
                      Reject
                    </button>
                  )}
                </div>
              </div>
            </section>
          )}

        </div>

        <div className="notif-detail-footer">
          <button type="button" className="logout-cancel-btn" onClick={onClose}>
            Close
          </button>
          {canOpen && (
            <button type="button" className="notif-detail-open-btn" onClick={() => onOpenInVerifier(notification)}>
              Open in {target.menu}
            </button>
          )}
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
