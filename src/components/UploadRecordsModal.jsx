import React, { useEffect, useRef, useState } from "react";
import { isOnline } from "../offline/connectivityService";

const MAX_UPLOAD = 1000;
const QUEUE_RENDER_LIMIT = 200;
const MAX_CLIENT_ATTEMPTS = 3;
const RETRYABLE_STATUS = [502, 503, 504];

const SECTION_LABEL = { birth: "Birth", marriage: "Marriage", death: "Death" };

// Scroll layout, taken from the Death modal and applied to every section:
// the dialog never exceeds the viewport and the body scrolls.
const UPL_BOX_STYLE = {
  display: "flex",
  flexDirection: "column",
  maxHeight: "calc(100vh - 32px)",
  overflow: "hidden",
};
const UPL_BODY_STYLE = { flex: "1 1 auto", minHeight: 0, overflowY: "auto" };

const SUCCESS_BOX_STYLE = {
  display: "flex", flexDirection: "column", gap: 10,
  padding: "14px 16px", background: "#f0fdf4",
  border: "1px solid #bbf7d0", borderRadius: 12,
};
const FAILURE_BOX_STYLE = {
  display: "flex", flexDirection: "column", gap: 6,
  padding: "12px 14px", background: "#fef2f2",
  border: "1px solid #fecaca", borderRadius: 12, color: "#7f1d1d",
};
const MATCH_LIST_STYLE  = { maxHeight: 260, overflowY: "auto" };
const SCROLL_LIST_STYLE = { maxHeight: 140, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 };
const MATCH_ROW_STYLE   = { display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "nowrap", gap: 12 };
const MATCH_LEFT_STYLE  = { display: "flex", alignItems: "center", flexWrap: "nowrap", gap: 8, flex: "1 1 auto", minWidth: 0 };
const MATCH_ICON_STYLE  = { flexShrink: 0, display: "inline-flex" };
const MATCH_NAME_STYLE  = { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const MATCH_BADGE_STYLE = { flexShrink: 0, whiteSpace: "nowrap" };
const MATCH_DATE_STYLE  = { flexShrink: 0, whiteSpace: "nowrap" };
const TIMER_STYLE       = { fontSize: 12, color: "#475569", fontVariantNumeric: "tabular-nums" };
const COUNT_STYLE       = { fontSize: 13, fontWeight: 600, color: "#1e3a8a", fontVariantNumeric: "tabular-nums" };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const plural = (n, word) => `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;

// Formats seconds as m:ss, or h:mm:ss for long uploads.
function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

function normalizeFileKey(name) {
  return (name || "").toString().trim().replace(/\.pdf$/i, "")
    .replace(/[_]+/g, " ").replace(/-+/g, " ").replace(/\s+/g, " ").toLowerCase();
}

function ensurePdfName(name) {
  if (!name) return "";
  return /\.pdf$/i.test(name) ? name : `${name}.pdf`;
}

function formatDate(d) {
  if (!d) return "—";
  const parsed = new Date(d);
  if (Number.isNaN(parsed.getTime())) return String(d);
  return parsed.toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const IconUpload = () => (
  <svg className="icon-svg icon-svg--md" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="17 8 12 3 7 8"/>
    <line x1="12" y1="3" x2="12" y2="15"/>
  </svg>
);

const IconDocumentLg = () => (
  <svg className="icon-svg icon-svg--xxl" viewBox="0 0 24 24" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
  </svg>
);

const FileIconSm = () => (
  <svg className="icon-svg icon-svg--sm" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
  </svg>
);

const IconCheck = () => (
  <svg className="icon-svg icon-svg--md" viewBox="0 0 24 24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

function UploadProgressBar({ value = 0, width = "100%", height = 10, showLabel = true }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, width }}>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        style={{ flex: 1, height, background: "#e5e7eb", borderRadius: 999, overflow: "hidden" }}
      >
        <div style={{
          width: `${pct}%`, height: "100%", background: "#10b981",
          borderRadius: 999, transition: "width 0.2s ease",
        }} />
      </div>
      {showLabel && (
        <span style={{ minWidth: 34, textAlign: "right", fontSize: 12, fontWeight: 700, color: "#059669" }}>
          {pct}%
        </span>
      )}
    </div>
  );
}

// XHR, because fetch cannot report upload progress.
function uploadWithProgress(url, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.min(99, (e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText || "{}"); } catch { /* non-JSON body */ }
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve(data);
      } else {
        const err = new Error(data.error || "Upload failed");
        err.status = xhr.status;
        reject(err);
      }
    };
    xhr.onerror = () => reject(new Error("Cannot reach server."));
    xhr.send(formData);
  });
}

// Retries only when the request never reached the server or the gateway was
// briefly unavailable. Validation and duplicate errors are not retried.
async function uploadWithRetry(url, file, onProgress) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_CLIENT_ATTEMPTS; attempt++) {
    const fd = new FormData();
    fd.append("file", file);
    try {
      return await uploadWithProgress(url, fd, onProgress);
    } catch (err) {
      lastErr = err;
      const retryable = err.message === "Cannot reach server." || RETRYABLE_STATUS.includes(err.status);
      if (!retryable || attempt === MAX_CLIENT_ATTEMPTS) throw err;
      onProgress(0);
      await sleep(800 * attempt);
    }
  }
  throw lastErr;
}

export default function UploadRecordsModal({
  section,
  api,
  getRecordDisplayName,
  queueOffline,
  allRecords,
  showNotif,
  onUploadSuccess,
  onClose,
}) {
  const label = SECTION_LABEL[section] || "Record";

  const [stage, setStage] = useState("upload");     // "upload" | "results"
  const [queue, setQueue] = useState([]);
  const [results, setResults] = useState([]);       // saved rows (server or offline)
  const [failures, setFailures] = useState([]);     // { name, error } from the last run
  const [isUploading, setIsUploading] = useState(false);
  const [elapsed, setElapsed] = useState(0);        // seconds since upload started
  const [uploadTotal, setUploadTotal] = useState(0); // files in this run
  const [doneCount, setDoneCount] = useState(0);    // files finished in this run
  const fileRef = useRef(null);
  const startedAtRef = useRef(0);

  // Elapsed-time ticker. Runs only while an upload is in progress and is
  // cleared automatically when the upload ends or the modal unmounts.
  useEffect(() => {
    if (!isUploading) return undefined;
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [isUploading]);

  const limitReached = queue.length >= MAX_UPLOAD;
  const slotsLeft = Math.max(0, MAX_UPLOAD - queue.length);
  const toSend = queue.filter((q) => q.status !== "done" && q.status !== "queued");

  // Records the server moved to another section are saved there, but they are
  // not listed in this modal.
  const visibleResults = results.filter((r) => !r.routed);

  const overallProgress = queue.length
    ? queue.reduce((sum, q) => {
        if (q.status === "done" || q.status === "queued") return sum + 100;
        if (q.status === "uploading") return sum + (q.progress || 0);
        return sum;
      }, 0) / queue.length
    : 0;

  const limitClass = limitReached
    ? "upl-limit-badge--reached"
    : queue.length >= MAX_UPLOAD - 1 ? "upl-limit-badge--warn" : "upl-limit-badge--ok";

  const rowName = (r) => r.display_name || getRecordDisplayName(r) || r.file_name || "";

  const close = () => { if (!isUploading) onClose(); };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";

    const existingKeys = new Set(
      (allRecords || []).map((r) => normalizeFileKey(r.file_name || getRecordDisplayName(r))),
    );
    const seen = new Set(queue.map((q) => normalizeFileKey(q.file.name)));
    const added = [];
    const skipped = { notPdf: 0, duplicate: 0, limit: 0 };
    let count = queue.length;

    for (const file of files) {
      if (count >= MAX_UPLOAD) { skipped.limit++; continue; }
      const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
      if (!isPdf) { skipped.notPdf++; continue; }
      const key = normalizeFileKey(file.name);
      if (existingKeys.has(key) || seen.has(key)) { skipped.duplicate++; continue; }
      seen.add(key);
      added.push({
        id: `${Date.now()}-${Math.random()}`,
        file, status: "pending", progress: 0, error: null,
      });
      count++;
    }

    if (added.length) setQueue((q) => [...q, ...added]);

    const parts = [];
    if (skipped.notPdf)    parts.push(`${skipped.notPdf} not a PDF`);
    if (skipped.duplicate) parts.push(`${skipped.duplicate} already exist or are queued`);
    if (skipped.limit)     parts.push(`${skipped.limit} over the ${MAX_UPLOAD.toLocaleString()}-file limit`);
    if (parts.length) showNotif(`Skipped: ${parts.join(", ")}.`, "error");
  };

  const removeFromQueue = (id) => setQueue((q) => q.filter((item) => item.id !== id));

  const handleUploadAll = async () => {
    const todo = queue.filter((q) => q.status !== "done" && q.status !== "queued");
    if (todo.length === 0) { showNotif("Please add at least one file.", "error"); return; }

    startedAtRef.current = Date.now();
    setElapsed(0);
    setDoneCount(0);
    setUploadTotal(todo.length);
    setIsUploading(true);
    const saved = [];
    const failed = [];

    for (const item of todo) {
      const patch = (fields) =>
        setQueue((q) => q.map((qi) => (qi.id === item.id ? { ...qi, ...fields } : qi)));
      patch({ status: "uploading", progress: 0, error: null });

      const saveOffline = async () => {
        const op = await queueOffline(item.file);
        saved.push({
          id: `offline-${op.opId}`,
          file_name: item.file.name,
          uploaded_at: new Date(op.createdAt).toISOString(),
          _pending: true,
        });
        patch({ status: "queued", progress: 100 });
      };

      try {
        if (!isOnline()) { await saveOffline(); continue; }
        const data = await uploadWithRetry(`${api}/records`, item.file, (pct) => patch({ progress: pct }));
        saved.push(data);
        patch({ status: "done", progress: 100 });
      } catch (err) {
        let message = err.message || "Upload failed";
        if (err.message === "Cannot reach server.") {
          try { await saveOffline(); continue; } catch (e2) { message = e2.message || message; }
        }
        failed.push({ name: item.file.name, error: message });
        patch({ status: "error", error: message });
      } finally {
        setDoneCount((n) => n + 1);
      }
    }

    setIsUploading(false);
    setFailures(failed);
    if (saved.length > 0) {
      setResults((prev) => [...prev, ...saved]);
      setTimeout(() => onUploadSuccess(), 400);
      setStage("results");
    }

    const offlineCount = saved.filter((r) => r._pending).length;

    if (saved.length > 0) {
      showNotif(
        offlineCount
          ? `${plural(saved.length, "file")} processed. ${plural(offlineCount, "file")} saved on this device and will upload when you're back online.`
          : `${plural(saved.length, "file")} uploaded.`,
        "success",
      );
    }
    if (failed.length > 0) {
      showNotif(`${plural(failed.length, "file")} could not be saved. Review the list before closing.`, "error");
    }
  };

  const retryFailed = () => {
    setQueue((q) =>
      q.filter((i) => i.status === "error")
        .map((i) => ({ ...i, status: "pending", progress: 0, error: null })),
    );
    setFailures([]);
    setStage("upload");
  };

  const renderStatus = (item) => {
    switch (item.status) {
      case "pending":
        return "Pending";
      case "uploading":
        return <UploadProgressBar value={item.progress || 0} width={140} height={8} />;
      case "done":
        return "Done";
      case "queued":
        return "Saved offline";
      case "error":
        return <span title={item.error || ""}>{`Error: ${item.error || "Unknown"}`}</span>;
      default:
        return "";
    }
  };

  const uploadedNow = Math.min(doneCount, uploadTotal);
  const remainingNow = Math.max(0, uploadTotal - uploadedNow);

  return (
    <div className="overlay" onClick={close}>
      <div className="upl-modal" style={UPL_BOX_STYLE} onClick={(e) => e.stopPropagation()}>
        <div className="upl-hdr">
          <div className="upl-hdr__icon"><IconUpload /></div>
          <div className="upl-hdr__text">
            <div className="upl-hdr__title">Upload {label} Record PDFs</div>
            <div className="upl-hdr__sub">
              {stage === "upload"
                ? `Select up to ${MAX_UPLOAD.toLocaleString()} PDF files to upload`
                : `${plural(results.length, "file")} saved`}
            </div>
          </div>
          <button
            className="upl-close"
            onClick={close}
            disabled={isUploading}
            aria-label="Close upload dialog"
          >
            ✕
          </button>
        </div>

        {stage === "upload" && (
          <div className="upl-body" style={UPL_BODY_STYLE}>
            <div className="upl-limit-row">
              <span className={`upl-limit-badge ${limitClass}`}>
                {queue.length.toLocaleString()} / {MAX_UPLOAD.toLocaleString()} files
              </span>
              {limitReached && <span className="upl-limit-reached-msg">Maximum limit reached</span>}
            </div>

            <div
              className={`dropzone${limitReached ? " dropzone--disabled" : ""}`}
              onClick={() => !isUploading && !limitReached && fileRef.current?.click()}
            >
              <input
                id={`${section}-upload-file-input`}
                name={`${section}UploadFile`}
                ref={fileRef}
                type="file"
                accept="application/pdf"
                multiple
                onChange={handleFileChange}
                style={{ display: "none" }}
              />
              {isUploading ? (
                <div className="dropzone__uploading" style={{ flexDirection: "column", width: "80%", gap: 8 }}>
                  <span style={COUNT_STYLE}>
                    Uploaded {uploadedNow.toLocaleString()} of {uploadTotal.toLocaleString()} records
                  </span>
                  <UploadProgressBar value={overallProgress} height={12} />
                  <span style={TIMER_STYLE}>
                    {remainingNow.toLocaleString()} remaining · Elapsed {formatDuration(elapsed)}
                  </span>
                </div>
              ) : limitReached ? (
                <>
                  <div className="dropzone__title">Upload limit reached</div>
                  <div className="dropzone__sub">Remove a file to add another</div>
                </>
              ) : (
                <>
                  <div className="dropzone__icon-wrap"><IconDocumentLg /></div>
                  <div className="dropzone__title">Click to select PDF files</div>
                  <div className="dropzone__sub">
                    PDF only · Max {MAX_UPLOAD.toLocaleString()} files · Max 20 MB each
                    {queue.length > 0 ? ` · ${slotsLeft.toLocaleString()} slots remaining` : ""}
                  </div>
                </>
              )}
            </div>

            {queue.length > 0 && (
              <div className="upl-queue">
                <div className="upl-queue__hdr">
                  <span>Upload Queue ({queue.length.toLocaleString()})</span>
                  {!isUploading && (
                    <button className="upl-queue__clear-btn" onClick={() => setQueue([])}>Clear All</button>
                  )}
                </div>

                {queue.slice(0, QUEUE_RENDER_LIMIT).map((item) => (
                  <div key={item.id} className="upl-queue__item">
                    <span className="upl-queue__item-icon"><FileIconSm /></span>
                    <span className="upl-queue__name" title={item.file.name}>{ensurePdfName(item.file.name)}</span>
                    <span className={`upl-queue__status upl-queue__status--${item.status}`}>
                      {renderStatus(item)}
                    </span>
                    {!isUploading && item.status !== "done" && item.status !== "queued" && (
                      <button
                        className="upl-queue__remove"
                        onClick={() => removeFromQueue(item.id)}
                        title="Remove"
                        aria-label={`Remove ${ensurePdfName(item.file.name)} from queue`}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}

                {queue.length > QUEUE_RENDER_LIMIT && (
                  <div className="upl-matches-empty">
                    Showing the first {QUEUE_RENDER_LIMIT} of {queue.length.toLocaleString()} files.
                    All of them will be processed.
                  </div>
                )}
              </div>
            )}

            <div className="upl-foot">
              <button className="btn btn-secondary" onClick={close} disabled={isUploading}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={handleUploadAll}
                disabled={isUploading || toSend.length === 0}
              >
                {isUploading
                  ? `Uploading… ${Math.round(overallProgress)}%`
                  : `Upload ${toSend.length.toLocaleString()} File${toSend.length === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
        )}

        {stage === "results" && (
          <div className="upl-body" style={UPL_BODY_STYLE}>
            <div style={SUCCESS_BOX_STYLE}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
                  background: "#dcfce7", color: "#059669",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <IconCheck />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#065f46" }}>Upload complete</div>
                  <div style={{ fontSize: 12, color: "#047857" }}>
                    {results.length.toLocaleString()} of {(results.length + failures.length).toLocaleString()} files saved
                    {failures.length > 0 ? `, ${failures.length.toLocaleString()} failed` : ""}
                    {elapsed > 0 ? ` · Took ${formatDuration(elapsed)}` : ""}
                  </div>
                </div>
              </div>
              <UploadProgressBar value={100} height={6} showLabel={false} />
            </div>

            {failures.length > 0 && (
              <div style={FAILURE_BOX_STYLE} role="alert">
                <div style={{ fontSize: 14, fontWeight: 700 }}>
                  {plural(failures.length, "file")} could not be saved
                </div>
                <div style={SCROLL_LIST_STYLE}>
                  {failures.map((f, i) => (
                    <div key={`${f.name}-${i}`} style={{ fontSize: 12 }}>
                      <strong>{ensurePdfName(f.name)}</strong>: {f.error}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <div className="upl-matches-hdr">
                <span className="upl-matches-hdr__text">Saved records: {results.length.toLocaleString()}</span>
              </div>
              {visibleResults.length === 0 ? (
                <div className="upl-matches-empty">No records were saved.</div>
              ) : (
                <div style={MATCH_LIST_STYLE}>
                  {visibleResults.map((r, i) => (
                    <div
                      key={r.id || i}
                      className="upl-match-row upl-match-row--new"
                      style={MATCH_ROW_STYLE}
                    >
                      <div className="upl-match-row__left" style={MATCH_LEFT_STYLE}>
                        <span className="upl-match-row__left-icon" style={MATCH_ICON_STYLE}><FileIconSm /></span>
                        <span className="upl-match-row__name" style={MATCH_NAME_STYLE} title={rowName(r)}>
                          {rowName(r)}
                        </span>
                        <span className="upl-match-row__badge" style={MATCH_BADGE_STYLE}>
                          {r._pending ? "Saved offline" : "Just Uploaded"}
                        </span>
                      </div>
                      <span className="upl-match-row__date" style={MATCH_DATE_STYLE}>
                        {formatDate(r.uploaded_at || new Date())}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="upl-foot">
              {failures.length > 0 && (
                <button className="btn btn-secondary" onClick={retryFailed}>
                  Retry {failures.length.toLocaleString()} Failed
                </button>
              )}
              <button className="btn btn-primary" onClick={onClose}>Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}