import React, { useState, useEffect, useCallback } from "react";
import ReactDOM from "react-dom/client";
import "../VitalRecords.css";
import sccLogo from "../../../assets/images/scc.png";
import lcrLogo from "../../../assets/images/lcr.jpg";
import { pushToast } from "../../../services/toastService";
import AccuracyBadge from "../../../components/AccuracyBadge";
import { Skeleton, SkeletonTable } from "../../../components/Skeleton";
import UploadRecordsModal from "../../../components/UploadRecordsModal";
import { computeAccuracy } from "../../../utils/matchAccuracy";
import { isOnline, checkNow } from "../../../offline/connectivityService";
import { newOpId } from "../../../offline/outboxQueue";
import { apiFetch } from "../../../services/apiFetch";
import { useRegisterRefresh } from "../../../context/RefreshContext";
import { runBulkDelete } from "../../../utils/bulkDelete";
import {
  useVitalData, loadPdfForRecord, deleteRecordSmart, queueUpload, queueTransaction,
} from "../../../offline/vitalOffline";
import { verifyArchivePasswordOffline, refreshOfflineCredential } from "../../../offline/archivePassword";
import { useDataChanged } from "../../../hooks/useDataChanged";

const API = `${import.meta.env.VITE_API_BASE_URL || ""}/api/death`;
const ENTITY = "death";
const FEE = 75;

// Realtime: tables nga mo-trigger og reload sa Death Verifier.
const DEATH_LIVE_TABLES = ["death_records", "death_transactions"];

// Adapter: keeps showNotif("message", "success" | "error") working
// on top of the shared toastService (which uses success: true/false).
function useShowNotif() {
  return useCallback((message, type = "success") => {
    const ok = type === "success";
    pushToast({
      title: ok ? "Success" : "Error",
      message,
      success: ok,
      duration: 5000,
    });
  }, []);
}

// ── Office details ─────────────────────────────────────────────────────────
const OFFICE_CONFIG = {
  cityMunicipality: "this city/municipality",
  certifyingOfficer: {
    name: "EDDIE FLOR C. SILVA",
    title: "Acting City Gov't. Dept. Head I",
  },
  verifiedBy: {
    name: "FARRAH B. LARGO",
    title: "Administrative Assistant II",
  },
  amountPaid: "₱75.00",
};

const LOGO_SRC = sccLogo;
const LOGO_SRC_2 = lcrLogo;

const STEPS = [
  { key: "select", label: "Select Record" },
  { key: "payment", label: "Review & Print" },
  { key: "releasing", label: "Releasing" },
];

function useViewport() {
  const [width, setWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1024,
  );
  useEffect(() => {
    const handler = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  return {
    width,
    isMobile: width < 768,
    isTablet: width >= 768 && width < 1024,
  };
}

// ── Resilient JSON fetch ───────────────────────────────────────────────────
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJsonWithRetry(url, { signal, retries = 2, delay = 500 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await apiFetch(url, { signal });
      let body = null;
      try { body = await res.json(); } catch { /* non-JSON body */ }
      if (!res.ok) throw new Error(body?.error || `Server responded with ${res.status}`);
      return body;
    } catch (err) {
      if (err?.name === "AbortError") throw err;
      lastErr = err;
      if (attempt < retries) await sleep(delay * (attempt + 1));
    }
  }
  throw lastErr;
}

const formatDate = (d) => {
  if (!d) return "—";
  const parsed = new Date(d);
  if (Number.isNaN(parsed.getTime())) return d;
  return parsed.toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
};

const formatCertDate = (d) => {
  if (!d) return "";
  const parsed = new Date(d);
  if (Number.isNaN(parsed.getTime())) return d;
  return parsed.toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "2-digit",
  });
};

const formatTodayLong = () =>
  new Date().toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

function toTitleCase(str) {
  if (!str) return "";
  return str.toString().trim().replace(/\s+/g, " ").toLowerCase()
    .split(/\s+/).filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function cleanNamePart(value) {
  if (!value) return "";
  return value.toString().replace(/\s+/g, " ").trim();
}

function formatFullName(first, middle, last) {
  return [first, middle, last].map(cleanNamePart).filter(Boolean)
    .map(toTitleCase).join(" ");
}

function normalizeDisplayName(filename) {
  return (filename || "").replace(/\.pdf$/i, "").replace(/[_]+/g, " ")
    .replace(/-+/g, " ").replace(/\s+/g, " ").trim()
    .split(" ").filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

function getRecordDisplayName(record) {
  if (!record) return "";
  const first = cleanNamePart(record.deceased_first_name);
  const middle = cleanNamePart(record.deceased_middle_name);
  const last = cleanNamePart(record.deceased_last_name);
  const fromParts = formatFullName(first, middle, last);
  if (fromParts) return fromParts;
  if (record.deceased_full_name) return toTitleCase(record.deceased_full_name);
  return normalizeDisplayName(record.file_name || "");
}

function getFatherDisplayName(record) {
  const v = cleanNamePart(record?.father_name);
  return v ? toTitleCase(v) : "";
}

function getMotherDisplayName(record) {
  const v = cleanNamePart(record?.mother_name);
  return v ? toTitleCase(v) : "";
}

function getRecordIdentityKey(record) {
  const name = getRecordDisplayName(record).trim().toUpperCase();
  const father = getFatherDisplayName(record).trim().toUpperCase();
  const mother = getMotherDisplayName(record).trim().toUpperCase();
  return `${name}|${father}|${mother}`;
}

function normalizeForSearch(record) {
  const name = getRecordDisplayName(record);
  const fileName = (record.file_name || "").replace(/\.pdf$/i, "")
    .replace(/[_,]+/g, " ").replace(/-+/g, " ").trim();
  const father = getFatherDisplayName(record);
  const mother = getMotherDisplayName(record);
  return [name, fileName, father, mother].join(" ").toUpperCase();
}

function matchesSearch(record, query) {
  if (!query || !query.trim()) return true;
  const haystack = normalizeForSearch(record);
  const haystackWords = haystack.split(/\s+/).filter(Boolean);
  const queryWords = query.trim().toUpperCase().split(/\s+/).filter(Boolean);
  return queryWords.every((qw) => haystackWords.some((hw) => hw === qw));
}

function getRecordLastName(record) {
  if (record?.deceased_last_name) return record.deceased_last_name.trim().toUpperCase();
  if (record?.deceased_full_name) {
    const parts = record.deceased_full_name.trim().split(/\s+/);
    return (parts[parts.length - 1] || "").toUpperCase();
  }
  const clean = (record?.file_name || "").replace(/\.pdf$/i, "").trim();
  if (clean.includes(",")) return clean.split(",")[0].trim().toUpperCase();
  const parts = clean.split(/[\s_]+/);
  return (parts[parts.length - 1] || "").toUpperCase();
}

function getRecordFirstName(record) {
  if (record?.deceased_first_name) return record.deceased_first_name.trim().toUpperCase();
  if (record?.deceased_full_name)
    return (record.deceased_full_name.trim().split(/\s+/)[0] || "").toUpperCase();
  return "";
}

// First + middle name, used only for the accuracy score.
function getRecordGivenNames(record) {
  const first = cleanNamePart(record?.deceased_first_name);
  const middle = cleanNamePart(record?.deceased_middle_name);
  if (first) return [first, middle].filter(Boolean).join(" ");
  const parts = cleanNamePart(record?.deceased_full_name).split(/\s+/).filter(Boolean);
  if (parts.length > 1) return parts.slice(0, -1).join(" ");
  return parts[0] || "";
}

function looksLikePdfBytes(bytes) {
  if (!bytes || bytes.length < 5) return false;
  let i = 0;
  while (
    i < bytes.length &&
    (bytes[i] === 0x20 || bytes[i] === 0x0a || bytes[i] === 0x0d || bytes[i] === 0x09)
  ) i++;
  if (i + 5 > bytes.length) return false;
  let sig = "";
  for (let j = i; j < i + 5; j++) sig += String.fromCharCode(bytes[j]);
  return sig === "%PDF-";
}

function base64ToBytes(b64) {
  const cleaned = (b64 || "").replace(/\s/g, "");
  const byteChars = atob(cleaned);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
  return new Uint8Array(byteNumbers);
}

function createPdfBlobFromData(pdfData) {
  if (!pdfData) return null;
  try {
    if (pdfData instanceof Blob) {
      return pdfData.type === "application/pdf"
        ? pdfData : new Blob([pdfData], { type: "application/pdf" });
    }
    if (typeof pdfData !== "string") return null;

    if (pdfData.startsWith("blob:") || pdfData.startsWith("http://") || pdfData.startsWith("https://")) {
      return null;
    }

    if (pdfData.startsWith("%PDF")) {
      return new Blob([pdfData], { type: "application/pdf" });
    }

    let base64Str = pdfData.startsWith("data:application/pdf;base64,")
      ? pdfData.replace(/^data:application\/pdf;base64,/i, "")
      : pdfData;

    let bytes;
    try {
      bytes = base64ToBytes(base64Str);
    } catch (e) {
      console.error("PDF base64 decode failed:", e);
      return null;
    }

    if (!looksLikePdfBytes(bytes)) {
      try {
        let innerStr = "";
        for (let i = 0; i < bytes.length; i++) innerStr += String.fromCharCode(bytes[i]);
        const innerBytes = base64ToBytes(innerStr.replace(/\s/g, ""));
        if (looksLikePdfBytes(innerBytes)) bytes = innerBytes;
      } catch {
        // fall through
      }
    }

    if (!looksLikePdfBytes(bytes)) {
      console.error("PDF data does not contain a valid %PDF- header after decode attempts.");
      return null;
    }

    return new Blob([bytes], { type: "application/pdf" });
  } catch (error) {
    console.error("Failed to create PDF blob:", error);
    return null;
  }
}

function getPdfBlobUrl(pdfData) {
  if (!pdfData) return "";
  try {
    if (typeof pdfData === "string") {
      if (pdfData.startsWith("blob:")) return pdfData;
      if (pdfData.startsWith("http://") || pdfData.startsWith("https://")) return pdfData;
    }
    const blob = createPdfBlobFromData(pdfData);
    if (!blob) return "";
    return URL.createObjectURL(blob);
  } catch (error) {
    console.error("Failed to create PDF blob URL:", error);
    return "";
  }
}

function printPdfFromData(pdfData) {
  return new Promise((resolve, reject) => {
    try {
      const blob = createPdfBlobFromData(pdfData);
      if (!blob) { reject(new Error("This PDF is corrupted or invalid and cannot be printed.")); return; }
      const blobUrl = URL.createObjectURL(blob);
      const iframe = document.createElement("iframe");
      iframe.className = "print-iframe";
      iframe.setAttribute("aria-hidden", "true");
      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        setTimeout(() => {
          try { if (iframe.parentNode) iframe.parentNode.removeChild(iframe); } catch { /* iframe already removed */ }
          try { URL.revokeObjectURL(blobUrl); } catch { /* URL already revoked */ }
        }, 1500);
      };
      iframe.onload = () => {
        const printWindow = iframe.contentWindow;
        if (!printWindow) { cleanup(); reject(new Error("Unable to access print frame.")); return; }
        const doPrint = () => {
          try {
            printWindow.focus();
            try { printWindow.onafterprint = () => { cleanup(); resolve(); }; } catch { /* print window closed or blocked */ }
            printWindow.print();
            setTimeout(() => { cleanup(); resolve(); }, 2000);
          } catch (err) { cleanup(); reject(err); }
        };
        setTimeout(doPrint, 800);
      };
      iframe.onerror = () => { cleanup(); reject(new Error("Failed to load PDF for printing.")); };
      iframe.src = blobUrl;
      document.body.appendChild(iframe);
    } catch (err) { reject(err); }
  });
}

const OfficeLogo = ({ className = "" }) => (
  <div className="office-logo-group">
    <img src={LOGO_SRC} alt="Office Seal" className={className} />
    <img src={LOGO_SRC_2} alt="LCR Seal" className={className} />
  </div>
);

function NegativeCertDocument({ certData }) {
  const {
    subjectName, dateOfDeath, fatherName, motherName,
    requestorName, cityMunicipality, certifyingOfficer,
    verifiedBy, amountPaid, todayDate, orNumber, datePaid,
  } = certData;

  const dateStr = dateOfDeath ? `on ${formatCertDate(dateOfDeath)} ` : "";
  const fatherStr = (fatherName || "[Father's Name]").toUpperCase();
  const motherStr = (motherName || "[Mother's Name]").toUpperCase();
  const city = cityMunicipality || "this city/municipality";
  const reqName = (requestorName || "[Requestor's Name]").toUpperCase();
  const year = dateOfDeath ? new Date(dateOfDeath).getFullYear() : new Date().getFullYear();

  return (
    <div className="neg-print-page">
      <div className="neg-print-logo-wrap">
        <OfficeLogo className="neg-print-logo" />
      </div>
      <p className="neg-print-date">{todayDate}</p>
      <p className="neg-print-salutation">TO WHOM IT MAY CONCERN:</p>
      <p className="neg-print-para">
        We certify that this office has no records of death of{" "}
        <strong className="neg-cert-doc__highlight">{(subjectName || "").toUpperCase()}</strong>
        {" "}who is alleged to have died {dateStr}in {city}, child of{" "}
        <strong className="neg-cert-doc__highlight">{fatherStr}</strong> and{" "}
        <strong className="neg-cert-doc__highlight">{motherStr}</strong>, hence, we cannot issue,
        as requested, a true copy of his/her Certificate of Death or transcription from
        the Register of Deaths.
      </p>
      <p className="neg-print-para">
        We also certify that the records of Death for the
        year <strong>{year}</strong> are still intact in the archives of this office.
      </p>
      <p className="neg-print-para">
        This certification is issued to{" "}
        <strong className="neg-cert-doc__highlight">{reqName}</strong> upon his/her request.
      </p>
      <div className="neg-print-sig-block">
        <div className="neg-print-sig-right">
          <div className="neg-print-sig-name">{certifyingOfficer.name}</div>
          <div className="neg-print-sig-title"><strong>{certifyingOfficer.title}</strong></div>
        </div>
      </div>
      <div className="neg-print-verified">
        <div className="neg-print-verified-label">Verified by:</div>
        <span className="neg-print-verified-name">{verifiedBy.name}</span>
        <span className="neg-print-verified-title"><strong>{verifiedBy.title}</strong></span>
      </div>
      <div className="neg-print-payment">
        <div className="neg-print-payment-row">
          <span className="neg-print-payment-label">Amount Paid</span>
          <span className="neg-print-payment-colon">:</span>
          <span className="neg-print-payment-value">{amountPaid || "₱75.00"}</span>
        </div>
        <div className="neg-print-payment-row">
          <span className="neg-print-payment-label">O.R. Number</span>
          <span className="neg-print-payment-colon">:</span>
          <span className="neg-print-payment-value">{orNumber || ""}</span>
        </div>
        <div className="neg-print-payment-row">
          <span className="neg-print-payment-label">Date Paid</span>
          <span className="neg-print-payment-colon">:</span>
          <span className="neg-print-payment-value">{datePaid || todayDate}</span>
        </div>
      </div>
    </div>
  );
}

function printNegativeCertificate(certData) {
  const mountPoint = document.createElement("div");
  mountPoint.style.cssText = "position:absolute;left:-9999px;top:0;visibility:hidden;";
  document.body.appendChild(mountPoint);
  const root = ReactDOM.createRoot(mountPoint);
  root.render(<NegativeCertDocument certData={certData} />);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const renderedHtml = mountPoint.innerHTML;
      const fullHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<title></title>
<style>
  @page { size: letter; margin: 0; }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 100%; height: 100%; }
  body {
    font-family: "Times New Roman", Times, serif;
    font-size: 12pt;
    color: #000;
    background: #fff;
    padding: 1.2in 1in 1in 1in;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    line-height: 1.6;
  }
  .neg-print-page { width: 100%; position: relative; }
  .neg-print-logo-wrap { position: absolute; top: -48pt; left: -46pt; }
  .office-logo-group { display: flex; align-items: center; gap: 6pt; }
  .neg-print-logo { width: 62pt; height: 62pt; display: block; }
  .neg-print-date { text-align: right; margin-bottom: 28pt; font-size: 12pt; }
  .neg-print-salutation { font-size: 12pt; margin-bottom: 16pt; font-weight: normal; }
  .neg-print-para { text-indent: 36pt; text-align: justify; margin-bottom: 12pt; font-size: 12pt; }
  .neg-print-sig-block { margin-top: 36pt; display: flex; justify-content: flex-end; }
  .neg-print-sig-right { text-align: center; min-width: 200pt; }
  .neg-print-sig-name { font-weight: bold; font-size: 12pt; margin-bottom: 0; color: #000; }
  .neg-print-sig-title { font-style: italic; font-size: 12pt; font-weight: bold; color: #000; }
  .neg-print-verified { margin-top: 28pt; }
  .neg-print-verified-label { font-size: 12pt; margin-bottom: 18pt; }
  .neg-print-verified-name { font-weight: bold; font-size: 12pt; text-align: center; display: block; }
  .neg-print-verified-title { font-style: italic; font-size: 12pt; font-weight: bold; text-align: center; display: block; }
  .neg-print-payment { margin-top: 32pt; font-size: 12pt; }
  .neg-print-payment-row { margin-bottom: 6pt; display: flex; gap: 4pt; align-items: flex-end; }
  .neg-print-payment-label { min-width: 90pt; flex-shrink: 0; }
  .neg-print-payment-colon { min-width: 8pt; flex-shrink: 0; margin-right: 4pt; }
  .neg-print-payment-value { flex: 1; font-size: 12pt; color: #000; }
  .neg-print-payment-blank { flex: 1; min-width: 100pt; height: 14pt; display: inline-block; }
  .neg-cert-doc__highlight { font-weight: bold; color: #000; }
</style>
</head>
<body>${renderedHtml}</body>
</html>`;
      const iframe = document.createElement("iframe");
      iframe.className = "print-iframe";
      iframe.setAttribute("aria-hidden", "true");
      document.body.appendChild(iframe);
      iframe.onload = () => {
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        doc.open();
        doc.write(fullHtml);
        doc.close();
        setTimeout(() => {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
          setTimeout(() => {
            try { document.body.removeChild(iframe); } catch { /* iframe already removed */ }
            try { root.unmount(); document.body.removeChild(mountPoint); } catch { /* unmount cleanup already done */ }
          }, 2000);
        }, 600);
      };
      iframe.src = "about:blank";
    });
  });
}

const IconDocument = ({ className = "" }) => (
  <svg className={`icon-svg icon-svg--md ${className}`} viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
  </svg>
);

const IconClipboard = ({ className = "" }) => (
  <svg className={`icon-svg icon-svg--md ${className}`} viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="2" width="6" height="4" rx="1" ry="1"/>
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
    <line x1="12" y1="11" x2="12" y2="17"/>
    <line x1="9" y1="14" x2="15" y2="14"/>
  </svg>
);

const IconGrid = ({ className = "" }) => (
  <svg className={`icon-svg icon-svg--md ${className}`} viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
    <line x1="9" y1="9" x2="15" y2="9"/>
    <line x1="9" y1="13" x2="15" y2="13"/>
    <line x1="9" y1="17" x2="12" y2="17"/>
  </svg>
);

const IconArchive = ({ className = "" }) => (
  <svg className={`icon-svg icon-svg--sm ${className}`} viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="21 8 21 21 3 21 3 8"/>
    <rect x="1" y="3" width="22" height="5"/>
    <line x1="10" y1="12" x2="14" y2="12"/>
  </svg>
);

const IconLock = ({ className = "" }) => (
  <svg className={`icon-svg icon-svg--xl ${className}`} viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
);

const IconUpload = ({ className = "" }) => (
  <svg className={`icon-svg icon-svg--md ${className}`} viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="17 8 12 3 7 8"/>
    <line x1="12" y1="3" x2="12" y2="15"/>
  </svg>
);

const IconSearch = ({ className = "" }) => (
  <svg className={`icon-svg icon-svg--sm ${className}`} viewBox="0 0 24 24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/>
    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);

const IconPrint = ({ className = "" }) => (
  <svg className={`icon-svg icon-svg--sm ${className}`} viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 6 2 18 2 18 9"/>
    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
    <rect x="6" y="14" width="12" height="8"/>
  </svg>
);

const IconInfo = ({ className = "" }) => (
  <svg className={`icon-svg icon-svg--sm ${className}`} viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="8" x2="12" y2="12"/>
    <line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
);

const IconEye = ({ className = "" }) => (
  <svg className={`icon-svg icon-svg--lg ${className}`} viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
);

const IconEyeOff = ({ className = "" }) => (
  <svg className={`icon-svg icon-svg--lg ${className}`} viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
);

const IconFolder = ({ className = "" }) => (
  <svg className={`icon-svg icon-svg--xxxl ${className}`} viewBox="0 0 24 24" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
  </svg>
);

const IconDocumentLg = ({ className = "" }) => (
  <svg className={`icon-svg icon-svg--xxl ${className}`} viewBox="0 0 24 24" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
  </svg>
);

const ConfirmModal = ({
  title, message, confirmLabel, confirmColor = "#dc2626", onConfirm, onCancel,
}) => (
  <div className="overlay" onClick={onCancel}>
    <div className="modal-box" onClick={(e) => e.stopPropagation()}>
      <h3>{title}</h3>
      <p dangerouslySetInnerHTML={{ __html: message }} />
      <div className="modal-acts">
        <button className="modal-cancel" onClick={onCancel}>Cancel</button>
        <button
          className="modal-confirm modal-confirm--red"
          style={confirmColor ? { background: confirmColor, borderColor: confirmColor } : undefined}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  </div>
);

const NegCertField = ({ label, htmlFor, required, error, children }) => (
  <div className="negcert-info-modal__field">
    <label className="negcert-info-modal__label" htmlFor={htmlFor}>
      {label} {required && <span className="negcert-info-modal__required"> *</span>}
    </label>
    {children}
    {error && <span className="negcert-info-modal__error">&#9888; {error}</span>}
  </div>
);

const NegCertInfoModal = ({ subjectName, requestorName, onSubmit, onCancel }) => {
  const [dateOfDeath, setDateOfDeath] = useState("");
  const [fatherName, setFatherName] = useState("");
  const [motherName, setMotherName] = useState("");
  const [dodError, setDodError] = useState("");
  const [fatherError, setFatherError] = useState("");
  const [motherError, setMotherError] = useState("");

  const handleSubmit = () => {
    let valid = true;
    if (!dateOfDeath) { setDodError("Date of death is required."); valid = false; } else setDodError("");
    if (!fatherName.trim()) { setFatherError("Father's name is required."); valid = false; } else setFatherError("");
    if (!motherName.trim()) { setMotherError("Mother's name is required."); valid = false; } else setMotherError("");
    if (!valid) return;
    onSubmit({
      dateOfDeath,
      fatherName: fatherName.trim(),
      motherName: motherName.trim(),
      requestorName: requestorName || subjectName || "",
    });
  };

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal-box negcert-info-modal" onClick={(e) => e.stopPropagation()}>
        <div className="negcert-info-modal__hdr">
          <div className="negcert-info-modal__hdr-text">
            <h3 className="negcert-info-modal__title">Negative Certificate Details</h3>
            <p className="negcert-info-modal__sub">
              For <strong className="negcert-info-modal__name">{subjectName || "this person"}</strong>
            </p>
          </div>
        </div>

        <div className="negcert-info-modal__fields">
          <NegCertField label="Date of Death" htmlFor="negcert-date-of-death" required error={dodError}>
            <input
              id="negcert-date-of-death"
              name="dateOfDeath"
              type="date"
              className={`negcert-info-modal__input${dodError ? " negcert-info-modal__input--error" : ""}`}
              value={dateOfDeath}
              onChange={(e) => { setDateOfDeath(e.target.value); if (e.target.value) setDodError(""); }}
              autoFocus
            />
          </NegCertField>

          <NegCertField label="Father's Full Name" htmlFor="negcert-father-name" required error={fatherError}>
            <input
              id="negcert-father-name"
              name="fatherName"
              type="text"
              className={`negcert-info-modal__input${fatherError ? " negcert-info-modal__input--error" : ""}`}
              value={fatherName}
              onChange={(e) => { setFatherName(e.target.value); if (e.target.value.trim()) setFatherError(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
            />
          </NegCertField>

          <NegCertField label="Mother's Full Name" htmlFor="negcert-mother-name" required error={motherError}>
            <input
              id="negcert-mother-name"
              name="motherName"
              type="text"
              className={`negcert-info-modal__input${motherError ? " negcert-info-modal__input--error" : ""}`}
              value={motherName}
              onChange={(e) => { setMotherName(e.target.value); if (e.target.value.trim()) setMotherError(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
            />
          </NegCertField>
        </div>

        <div className="modal-acts negcert-info-modal__acts">
          <button className="modal-cancel" onClick={onCancel}>Cancel</button>
          <button
            className="modal-confirm negcert-info-modal__submit"
            onClick={handleSubmit}
          >
            Issue Negative Certificate &rarr;
          </button>
        </div>
      </div>
    </div>
  );
};

const PdfModal = ({ pdfData, pdfError, fileName, onClose, showNotif }) => {
  const [pdfUrl, setPdfUrl] = useState("");
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (pdfError) {
      setPdfUrl("");
      showNotif?.(pdfError, "error");
      return;
    }
    const url = getPdfBlobUrl(pdfData);
    setPdfUrl(url);
    if (pdfData && !url) {
      showNotif?.("This PDF appears to be corrupted and can't be displayed.", "error");
    }
    return () => { if (url && url.startsWith("blob:")) URL.revokeObjectURL(url); };
  }, [pdfData, pdfError, showNotif]);

  const handlePrint = async () => {
    if (!pdfData) { showNotif?.("No PDF available to print.", "error"); return; }
    try {
      setPrinting(true);
      await printPdfFromData(pdfData);
      showNotif?.("Printing selected PDF…", "success");
    } catch (error) {
      console.error(error);
      showNotif?.(error.message || "Failed to print PDF.", "error");
    } finally { setPrinting(false); }
  };

  return (
    <div className="pdf-overlay" onClick={onClose}>
      <div className="pdf-box" onClick={(e) => e.stopPropagation()}>
        <div className="pdf-hdr">
          <span className="pdf-hdr__label">
            <span className="pdf-hdr__label-icon"><IconDocument /></span>
            {fileName}
          </span>
          <div className="pdf-hdr-btns">
            {pdfUrl && (
              <button className="hdr-btn hdr-btn--print" onClick={handlePrint} disabled={printing}>
                {printing ? "Printing…" : "Print"}
              </button>
            )}
            <button className="hdr-btn hdr-btn--close" onClick={onClose}>✕ Close</button>
          </div>
        </div>
        <div className="pdf-body">
          {pdfUrl ? (
            <iframe key={pdfUrl} src={`${pdfUrl}#toolbar=1&navpanes=0`} title={fileName} className="pdf-body__iframe" />
          ) : (
            <div className="pdf-inline-empty">
              <span className="pdf-inline-empty__icon"><IconDocumentLg /></span>
              <div className="pdf-inline-empty__title">Unable to display PDF</div>
              <div className="pdf-inline-empty__sub">
                {pdfError || "The selected PDF is empty or invalid."}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const StepBar = ({ current }) => {
  const idx = STEPS.findIndex((s) => s.key === current);
  const { isMobile } = useViewport();
  return (
    <div className="ubr-stepbar-wrap">
      <div className="ubr-stepbar">
        <div className="ubr-stepbar__inner">
          {STEPS.map((s, i) => {
            const done = i < idx;
            const active = i === idx;
            const mod = done ? "done" : active ? "active" : "pending";
            const isLast = i === STEPS.length - 1;
            const segDone = i < idx;
            return (
              <React.Fragment key={s.key}>
                <div className="ubr-stepbar__step">
                  <div className={`ubr-stepbar__circle ubr-stepbar__circle--${mod}`}>
                    {done ? "✓" : i + 1}
                  </div>
                  {(!isMobile || active) && (
                    <span className={`ubr-stepbar__label ubr-stepbar__label--${mod}`}>{s.label}</span>
                  )}
                </div>
                {!isLast && (
                  <div className="ubr-stepbar__seg">
                    <div className="ubr-stepbar__seg-rail" />
                    {segDone && <div className="ubr-stepbar__seg-fill" />}
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const PasswordGate = ({ module, description, onUnlock, showNotif }) => {
  const [pwInput, setPwInput] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const unlockOffline = async (pw) => {
    try {
      const result = await verifyArchivePasswordOffline(module, pw);

      if (result === "ok") {
        showNotif("Unlocked offline.", "success");
        onUnlock();
      } else if (result === "wrong") {
        showNotif("Incorrect password.", "error");
      } else if (result === "locked") {
        showNotif("Too many wrong attempts. Try again in 5 minutes.", "error");
      } else if (result === "unset") {
        showNotif("No password is set for this module yet.", "error");
      } else {
        showNotif("This device hasn't saved the password data yet. Open the app once while online and logged in.", "error");
      }
    } catch (error) {
      console.error("Offline archive password verification failed:", error);
      showNotif("Unable to verify the offline password.", "error");
    }
  };

  const handleSubmit = async () => {
    const pw = pwInput.trim();
    if (!pw) { showNotif("Password is required.", "error"); return; }
    setLoading(true);
    try {
      if (!isOnline()) { await unlockOffline(pw); return; }

      let res;
      try {
        res = await apiFetch(`${API}/auth/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ module, password: pw }),
        });
      } catch {
        await unlockOffline(pw);
        return;
      }
      if (res.status >= 500) { await unlockOffline(pw); return; }

      const data = await res.json().catch(() => ({}));
      if (data.success) {
        refreshOfflineCredential(module, API);
        onUnlock();
      } else {
        showNotif(data.message || "Incorrect password.", "error");
      }
    } catch (error) {
      console.error("Archive password verification failed:", error);
      showNotif("Unable to verify the archive password.", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pw-gate">
      <div className="pw-gate__icon">
        <IconLock />
      </div>
      <p className="pw-gate__desc">{description}</p>
      <div className="pw-gate__form">
        <label className="pw-lbl" htmlFor="death-admin-password">Administrator Password</label>
        <div className="pw-input-wrap">
          <input
            id="death-admin-password"
            name="adminPassword"
            type={showPw ? "text" : "password"}
            value={pwInput}
            onChange={(e) => setPwInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !loading) handleSubmit(); }}
            placeholder="Enter password"
            className="pw-input"
            autoComplete="current-password"
            autoFocus
            disabled={loading}
          />
          <button
            className="pw-toggle"
            type="button"
            onClick={() => setShowPw((v) => !v)}
            title={showPw ? "Hide password" : "Show password"}
            aria-label={showPw ? "Hide password" : "Show password"}
            disabled={loading}
          >
            {showPw ? <IconEyeOff /> : <IconEye />}
          </button>
        </div>
        <button className="btn btn-primary pw-gate__submit-btn" onClick={handleSubmit} disabled={loading}>
          {loading ? (<><div className="spinner spinner--sm" />&nbsp;Verifying…</>) : "Unlock & View Records →"}
        </button>
      </div>
    </div>
  );
};

const RelativesChips = ({ record }) => {
  const father = getFatherDisplayName(record);
  const mother = getMotherDisplayName(record);
  if (!father && !mother) return <span className="tbl-relative-empty">—</span>;
  return (
    <div className="tbl-relatives">
      {father && <span className="tbl-relative-chip tbl-relative-chip--father">{father}</span>}
      {mother && <span className="tbl-relative-chip tbl-relative-chip--mother">{mother}</span>}
    </div>
  );
};

const NegativeCertPreview = ({
  subjectName, fatherName, motherName, dateOfDeath, requestorName,
  orNumber, onOrNumberChange, onPrint,
}) => {
  const todayDate = formatTodayLong();
  const officer = OFFICE_CONFIG.certifyingOfficer;
  const verified = OFFICE_CONFIG.verifiedBy;
  const year = dateOfDeath ? new Date(dateOfDeath).getFullYear() : new Date().getFullYear();

  return (
    <div className="neg-cert-preview-wrap">
      <div className="neg-cert-preview-toolbar">
        <div className="neg-cert-preview-toolbar__left">
          <span className="neg-cert-preview-toolbar__icon"><IconClipboard /></span>
          <span className="neg-cert-preview-toolbar__name">Certificate of No Death Record</span>
          <span className="neg-cert-preview-toolbar__badge">Negative Certificate</span>
        </div>
        <button className="pdf-inline-print-btn" onClick={onPrint}>
          <span className="pdf-inline-print-btn__icon"><IconPrint /></span>
          Print Certificate
        </button>
      </div>
      <div className="neg-cert-doc">
        <div className="neg-cert-doc__inner">
          <div className="neg-cert-doc__logo-wrap">
            <OfficeLogo className="neg-cert-doc__logo" />
          </div>
          <p className="neg-cert-doc__date">{todayDate}</p>
          <p className="neg-cert-doc__salutation">TO WHOM IT MAY CONCERN:</p>
          <p className="neg-cert-doc__para">
            We certify that this office has no records of death of{" "}
            <strong className="neg-cert-doc__highlight">{(subjectName || "").toUpperCase()}</strong>{" "}
            who is alleged to have died on{" "}
            {dateOfDeath
              ? <strong className="neg-cert-doc__highlight">{formatCertDate(dateOfDeath)}</strong>
              : <strong className="neg-cert-doc__highlight neg-cert-doc__placeholder">[DATE OF DEATH]</strong>
            }{" "}
            in {OFFICE_CONFIG.cityMunicipality}, child of{" "}
            {fatherName
              ? <strong className="neg-cert-doc__highlight">{fatherName.toUpperCase()}</strong>
              : <strong className="neg-cert-doc__highlight neg-cert-doc__placeholder">[FATHER'S NAME]</strong>
            }{" "}and{" "}
            {motherName
              ? <strong className="neg-cert-doc__highlight">{motherName.toUpperCase()}</strong>
              : <strong className="neg-cert-doc__highlight neg-cert-doc__placeholder">[MOTHER'S NAME]</strong>
            }, hence, we cannot issue, as requested, a true copy of his/her Certificate of Death or transcription from the Register of Deaths.
          </p>
          <p className="neg-cert-doc__para">
            We also certify that the records of Death for the year <strong>{year}</strong> are still intact in the archives of this office.
          </p>
          <p className="neg-cert-doc__para">
            This certification is issued to{" "}
            {requestorName
              ? <strong className="neg-cert-doc__highlight">{requestorName.toUpperCase()}</strong>
              : <strong className="neg-cert-doc__highlight neg-cert-doc__placeholder">[REQUESTOR'S NAME]</strong>
            }{" "}upon his/her request.
          </p>
          <div className="neg-cert-doc__sig-block">
            <div className="neg-cert-doc__sig-right">
              <div className="neg-cert-doc__sig-name">{officer.name}</div>
              <div className="neg-cert-doc__sig-title"><strong>{officer.title}</strong></div>
            </div>
          </div>
          <div className="neg-cert-doc__verified">
            <div className="neg-cert-doc__verified-label">Verified by:</div>
            <div className="neg-cert-doc__verified-name">{verified.name}</div>
            <div className="neg-cert-doc__verified-title"><strong>{verified.title}</strong></div>
          </div>
          <div className="neg-cert-doc__payment">
            <div className="neg-cert-doc__payment-row">
              <span className="neg-cert-doc__payment-label">Amount Paid</span>
              <span className="neg-cert-doc__payment-colon">:</span>
              <span className="neg-cert-doc__payment-value">{OFFICE_CONFIG.amountPaid}</span>
            </div>
            <div className="neg-cert-doc__payment-row">
              <span className="neg-cert-doc__payment-label">O.R. Number</span>
              <span className="neg-cert-doc__payment-colon">:</span>
              <input
                id="death-or-number"
                name="orNumber"
                type="text"
                aria-label="O.R. Number"
                className="neg-cert-doc__payment-value neg-cert-doc__payment-blank neg-cert-doc__or-input"
                style={{
                  border: "none",
                  borderBottom: "1px solid #94a3b8",
                  background: "transparent",
                  outline: "none",
                  font: "inherit",
                  color: "#1a3c6e",
                  fontWeight: 700,
                  padding: "0 4px",
                  flex: 1,
                  minWidth: "100pt",
                }}
                value={orNumber || ""}
                onChange={(e) => onOrNumberChange && onOrNumberChange(e.target.value)}
                placeholder="Enter O.R. Number"
              />
            </div>
            <div className="neg-cert-doc__payment-row">
              <span className="neg-cert-doc__payment-label">Date Paid</span>
              <span className="neg-cert-doc__payment-colon">:</span>
              <span className="neg-cert-doc__payment-value">{todayDate}</span>
            </div>
          </div>
        </div>
      </div>
      <div className="neg-cert-note">
        <span className="neg-cert-note__icon"><IconInfo /></span>
        <span>Preview reflects the data you entered. Enter the O.R. Number, then click "Print Certificate" to print the completed document.</span>
      </div>
    </div>
  );
};

const InlinePdfViewer = ({ pdfData, pdfError, record, onPrint, loadingPdf, showNotif }) => {
  const displayName = record ? getRecordDisplayName(record) : "";
  const [pdfUrl, setPdfUrl] = useState("");
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (pdfError) {
      setPdfUrl("");
      showNotif?.(pdfError, "error");
      return;
    }
    if (!pdfData) { setPdfUrl(""); return; }
    const url = getPdfBlobUrl(pdfData);
    setPdfUrl(url);
    if (pdfData && !url) {
      showNotif?.("This PDF appears to be corrupted and can't be displayed.", "error");
    }
    return () => { if (url && url.startsWith("blob:")) URL.revokeObjectURL(url); };
  }, [pdfData, pdfError, showNotif]);

  const handlePrint = async () => {
    if (!pdfData) { showNotif?.("No PDF available to print.", "error"); return; }
    try {
      setPrinting(true);
      await printPdfFromData(pdfData);
      onPrint && onPrint();
      showNotif?.("Printing selected PDF…", "success");
    } catch (error) {
      console.error(error);
      showNotif?.(error.message || "Failed to print PDF.", "error");
    } finally { setPrinting(false); }
  };

  if (loadingPdf) return (
    <div className="ui-skeleton-surface">
      <Skeleton h={34} />
      <Skeleton h="46vh" style={{ marginTop: 12 }} />
    </div>
  );

  if (!pdfUrl) return (
    <div className="pdf-inline-empty">
      <span className="pdf-inline-empty__icon"><IconDocumentLg /></span>
      <div className="pdf-inline-empty__title">
        {pdfError ? "Unable to display PDF" : "No document to display"}
      </div>
      <div className="pdf-inline-empty__sub">
        {pdfError || "Select a record to preview it here."}
      </div>
    </div>
  );

  return (
    <div className="pdf-inline-wrap">
      <div className="pdf-inline-toolbar">
        <div className="pdf-inline-toolbar__left">
          <span className="pdf-inline-toolbar__icon"><IconDocument /></span>
          <span className="pdf-inline-toolbar__name">{displayName}</span>
          <span className="pdf-inline-toolbar__badge">Death Certificate</span>
        </div>
        <button className="pdf-inline-print-btn" onClick={handlePrint} disabled={printing}>
          <span className="pdf-inline-print-btn__icon"><IconPrint /></span>
          {printing ? "Printing…" : "Print"}
        </button>
      </div>
      <div className="pdf-inline-viewer">
        <iframe key={pdfUrl} src={`${pdfUrl}#toolbar=1&navpanes=0`} title={displayName} className="pdf-inline-iframe" />
      </div>
    </div>
  );
};

const MobileRecordCardArchive = ({ record, index, selected, onToggle, onView, onDelete }) => {
  const displayName = getRecordDisplayName(record);
  const father = getFatherDisplayName(record);
  const mother = getMotherDisplayName(record);
  return (
    <div className={`mobile-record-card${selected ? " mobile-record-card--selected" : ""}`}>
      <div className="mobile-record-card__top">
        <input
          type="checkbox"
          className="tbl-checkbox"
          checked={!!selected}
          onChange={onToggle}
          aria-label={`Select ${displayName}`}
        />
        <span className="mobile-record-card__num">#{index + 1}</span>
        <span className="mobile-record-card__name">{displayName}</span>
      </div>
      {(father || mother) && (
        <div className="mobile-record-card__parents">
          {father && <span className="tbl-relative-chip tbl-relative-chip--father">{father}</span>}
          {mother && <span className="tbl-relative-chip tbl-relative-chip--mother">{mother}</span>}
        </div>
      )}
      <div className="mobile-record-card__date">{formatDate(record.archived_at)}</div>
      <div className="mobile-record-card__actions">
        <button className="tbl-btn tbl-btn--blue" onClick={onView}>View</button>
        <button className="tbl-btn tbl-btn--red" onClick={onDelete}>Delete</button>
      </div>
    </div>
  );
};

/* ── Main Component ──────────────────────────────────────────────────────── */
export default function UnifiedDeathRegistry({ initialView = null }) {
  const [tab, setTab] = useState(initialView === "archive" ? "archive" : "transaction");
  const [confirmModal, setConfirmModal] = useState(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [pdfModal, setPdfModal] = useState(null);
  const [negCertModal, setNegCertModal] = useState(null);
  const [negCertInfo, setNegCertInfo] = useState({ fatherName: "", motherName: "", dateOfDeath: "", requestorName: "" });
  const [orNumber, setOrNumber] = useState("");

  const showNotif = useShowNotif();

  const [step, setStep] = useState("select");
  const [srchFirstName, setSrchFirstName] = useState("");
  const [srchLastName, setSrchLastName] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [firstNameError, setFirstNameError] = useState("");
  const [lastNameError, setLastNameError] = useState("");
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [recordStatus, setRecordStatus] = useState(null);
  const [subjectName, setSubjectName] = useState("");
  const [payRef, setPayRef] = useState("");
  const [processing, setProcessing] = useState(false);

  const [step2PdfData, setStep2PdfData] = useState(null);
  const [step2PdfError, setStep2PdfError] = useState("");
  const [step2PdfLoading, setStep2PdfLoading] = useState(false);
  const [previewLoadingId, setPreviewLoadingId] = useState(null);

  const { allRecords, allArchivedRecords, loadingRecords, fetchRecords, fetchArchived } = useVitalData({
    entity: ENTITY, api: API, fetchJson: fetchJsonWithRetry,
    toBlob: createPdfBlobFromData, showNotif,
  });

  useRegisterRefresh(async () => {
    await Promise.all([fetchRecords(), fetchArchived()]);
  });

  useDataChanged(() => {
    if (isOnline()) { fetchRecords(); fetchArchived(); }
  }, { tables: DEATH_LIVE_TABLES, debounceMs: 750 });

  const [archiveSearch, setArchiveSearch] = useState("");
  const [archiveUnlocked, setArchiveUnlocked] = useState(false);

  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const { isMobile, isTablet } = useViewport();
  const useCards = isMobile || isTablet;

  const activeIdentityKeys = new Set(allRecords.map(getRecordIdentityKey));

  const allRecordsForSearch = [
    ...allRecords,
    ...allArchivedRecords
      .filter((r) => !activeIdentityKeys.has(getRecordIdentityKey(r)))
      .map((r) => ({ ...r, _isArchived: true })),
  ];

  const handleSearch = () => {
    let valid = true;
    if (!srchFirstName.trim()) { setFirstNameError("First name is required."); valid = false; } else setFirstNameError("");
    if (!srchLastName.trim()) { setLastNameError("Last name is required."); valid = false; } else setLastNameError("");
    if (!valid) return;
    setHasSearched(true);
  };

  const searchFN = srchFirstName.trim().toUpperCase();
  const searchLN = srchLastName.trim().toUpperCase();

  const searchResults = hasSearched && searchLN
    ? allRecordsForSearch.filter((r) => {
        const ln = getRecordLastName(r);
        const lnWords = ln.split(/\s+/).filter(Boolean);
        const qWords = searchLN.split(/\s+/).filter(Boolean);
        return qWords.every((qw) => lnWords.some((lw) => lw === qw));
      })
    : [];

  const getAccuracy = (r) =>
    computeAccuracy(
      { lastName: srchLastName, firstName: srchFirstName },
      { lastName: getRecordLastName(r), firstName: getRecordGivenNames(r) }
    );

  const sortedResults = [...searchResults].sort((a, b) => {
    const aFN = getRecordFirstName(a); const bFN = getRecordFirstName(b);
    if (!a._isArchived && b._isArchived) return -1;
    if (a._isArchived && !b._isArchived) return 1;
    const aExact = searchFN && aFN === searchFN;
    const bExact = searchFN && bFN === searchFN;
    if (aExact && !bExact) return -1;
    if (!aExact && bExact) return 1;
    const diff = getAccuracy(b) - getAccuracy(a);
    if (diff !== 0) return diff;
    return aFN.localeCompare(bFN);
  });

  const handleSelectFromSearch = (record) => {
    const displayName = getRecordDisplayName(record);
    setSelectedRecord(record);
    setRecordStatus("ACTIVE");
    setSubjectName(displayName);
    showNotif(`Selected: ${displayName}`, "success");
  };

  const openNegCertModal = () => {
    const autoRequestor = `${srchFirstName.trim()} ${srchLastName.trim()}`.trim();
    setNegCertModal({ nameTerm: autoRequestor, requestorName: autoRequestor });
  };

  const handleNegCertModalSubmit = ({ dateOfDeath, fatherName, motherName, requestorName }) => {
    const nameTerm = negCertModal.nameTerm;
    setNegCertModal(null);
    setNegCertInfo({ dateOfDeath, fatherName, motherName, requestorName });
    setOrNumber("");
    setSelectedRecord(null);
    setRecordStatus("NOT_FOUND");
    setSubjectName(nameTerm);
    setStep2PdfData(null);
    setStep2PdfError("");
    showNotif(`Issuing Negative Certificate for "${nameTerm}"`, "success");
    setStep("payment");
  };

  const handlePreviewPdf = async (id, record) => {
    setPreviewLoadingId(id);
    try {
      const pdfData = await loadPdfForRecord(ENTITY, API, id, record, createPdfBlobFromData);
      setPdfModal({ pdfData, pdfError: null, fileName: getRecordDisplayName(record), id });
    } catch (err) { showNotif(err.message, "error"); }
    finally { setPreviewLoadingId(null); }
  };

  const loadStep2Pdf = async (record) => {
    if (!record) { setStep2PdfData(null); setStep2PdfError(""); return; }
    setStep2PdfLoading(true);
    try {
      setStep2PdfData(await loadPdfForRecord(ENTITY, API, record.id, record, createPdfBlobFromData));
      setStep2PdfError("");
    } catch (err) {
      showNotif(err.message, "error"); setStep2PdfData(null); setStep2PdfError(err.message);
    } finally { setStep2PdfLoading(false); }
  };

  const handleProceedToPayment = async () => {
    setStep("payment");
    if (selectedRecord) await loadStep2Pdf(selectedRecord);
    else { setStep2PdfData(null); setStep2PdfError(""); }
  };

  const isPositive = recordStatus === "ACTIVE";
  const issuedDoc = isPositive
    ? "Certified True Copy of Death Certificate (Actual)"
    : "Certificate of No Death Record (Negative Certificate)";

  const handlePrintNegativeCert = () => {
    if (!orNumber.trim()) {
      showNotif("O.R. Number is required before printing the certificate.", "error");
      return;
    }
    printNegativeCertificate({
      subjectName,
      dateOfDeath: negCertInfo.dateOfDeath || null,
      fatherName: negCertInfo.fatherName || null,
      motherName: negCertInfo.motherName || null,
      requestorName: negCertInfo.requestorName || null,
      cityMunicipality: OFFICE_CONFIG.cityMunicipality,
      certifyingOfficer: OFFICE_CONFIG.certifyingOfficer,
      verifiedBy: OFFICE_CONFIG.verifiedBy,
      amountPaid: OFFICE_CONFIG.amountPaid,
      orNumber: orNumber.trim(),
      datePaid: formatTodayLong(),
      todayDate: formatTodayLong(),
    });
    showNotif("Printing Negative Certificate…", "success");
  };

  const handleConfirmPayment = () => {
    setPayRef("PAY-" + Date.now().toString().slice(-8));
    setStep("releasing");
    showNotif("Document reviewed. Proceeding to release.", "success");
  };

  const handleCompleteTransaction = async () => {
    setProcessing(true);
    const opId = newOpId();
    const url = `${API}/records/complete`;
    const payload = {
      searchOperator: subjectName, recordStatus,
      recordId: selectedRecord && !selectedRecord._pending ? selectedRecord.id : null,
      paymentMethod: "cash", paymentReference: payRef,
      paymentAmount: FEE, documentIssued: issuedDoc,
      orNumber: orNumber.trim() || null,
      first_name: selectedRecord?.deceased_first_name || srchFirstName.trim(),
      middle_name: selectedRecord?.deceased_middle_name || "",
      last_name: selectedRecord?.deceased_last_name || srchLastName.trim(),
    };
    const saveOffline = async () => {
      await queueTransaction(ENTITY, url, payload, subjectName, opId);
      showNotif("No connection. Transaction saved on this device and will sync automatically.", "success");
      return true;
    };
    try {
      if (!isOnline()) return await saveOffline();
      let res;
      try {
        res = await apiFetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Offline-Op-Id": opId },
          body: JSON.stringify(payload),
        });
      } catch { return await saveOffline(); }
      if (res.status >= 500 && !(await checkNow())) return await saveOffline();

      let data = {};
      try { data = await res.json(); } catch { /* non-JSON */ }
      if (!res.ok || data?.error) throw new Error(data?.error || "Failed to save the transaction. Please try again.");
      showNotif("Transaction completed successfully!", "success");
      return true;
    } catch (err) {
      showNotif(err.message || "Failed to save the transaction. Please try again.", "error");
      return false;
    } finally {
      setProcessing(false);
    }
  };

  const resetTransaction = () => {
    setStep("select");
    setSrchFirstName(""); setSrchLastName(""); setHasSearched(false);
    setFirstNameError(""); setLastNameError("");
    setSelectedRecord(null); setRecordStatus(null);
    setSubjectName(""); setPayRef(""); setStep2PdfData(null); setStep2PdfError("");
    setNegCertInfo({ fatherName: "", motherName: "", dateOfDeath: "", requestorName: "" });
    setOrNumber("");
    fetchRecords(); fetchArchived();
  };

  const handleViewPdf = async (id, record) => {
    try {
      const pdfData = await loadPdfForRecord(ENTITY, API, id, record, createPdfBlobFromData);
      setPdfModal({ pdfData, pdfError: null, fileName: getRecordDisplayName(record), id });
    } catch (err) { showNotif(err.message, "error"); }
  };

  const handleDelete = (id, record) => setConfirmModal({
    title: "Permanently Delete",
    message: `Permanently delete <strong>"${getRecordDisplayName(record)}"</strong>? This <strong>cannot be undone</strong>.`,
    confirmLabel: "Delete",
    confirmColor: "#dc2626",
    onConfirm: async () => {
      setConfirmModal(null);
      try {
        const result = await deleteRecordSmart(ENTITY, API, id, record, getRecordDisplayName(record));
        const name = getRecordDisplayName(record);
        if (result === "queued") showNotif(`"${name}" deleted offline. It will be removed from the server when you're back online.`, "success");
        else if (result === "removed") showNotif(`"${name}" removed from the upload queue.`, "success");
        else { showNotif(`"${name}" deleted.`, "success"); fetchArchived(); }
      } catch (err) { showNotif(err.message, "error"); }
    },
  });

  const filteredArchived = archiveSearch.trim()
    ? allArchivedRecords.filter((r) => matchesSearch(r, archiveSearch.trim()))
    : allArchivedRecords;

  const filteredIds = filteredArchived.map((r) => r.id);
  const allSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id));
  const someSelected = !allSelected && filteredIds.some((id) => selectedIds.has(id));

  const toggleSelect = (id) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const toggleSelectAll = () =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) filteredIds.forEach((id) => next.delete(id));
      else filteredIds.forEach((id) => next.add(id));
      return next;
    });

  const clearSelection = () => setSelectedIds(new Set());

  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const valid = new Set(allArchivedRecords.map((r) => r.id));
      const next = new Set([...prev].filter((id) => valid.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [allArchivedRecords]);

  const handleBulkDelete = () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    const byId = new Map(allArchivedRecords.map((r) => [r.id, r]));

    setConfirmModal({
      title: "Permanently Delete Selected",
      message: `Permanently delete <strong>${ids.length} record${ids.length !== 1 ? "s" : ""}</strong>? This <strong>cannot be undone</strong>.`,
      confirmLabel: `Delete ${ids.length}`,
      confirmColor: "#dc2626",
      onConfirm: async () => {
        setConfirmModal(null);
        setBulkDeleting(true);

        const result = await runBulkDelete({
          api: API,
          ids,
          byId,
          deleteOne: (id, record) =>
            deleteRecordSmart(ENTITY, API, id, record, getRecordDisplayName(record)),
        });

        if (result.deleted > 0) {
          showNotif(`${result.deleted} record${result.deleted !== 1 ? "s" : ""} deleted.`, "success");
        }
        if (result.queued > 0) {
          showNotif(`${result.queued} will be removed when you're back online.`, "success");
        }
        if (result.failedIds.length > 0) {
          showNotif(
            `${result.failedIds.length} record${result.failedIds.length !== 1 ? "s" : ""} could not be deleted. They are still selected, so you can try again.`,
            "error",
          );
          setSelectedIds(new Set(result.failedIds));
        } else {
          clearSelection();
        }

        await fetchArchived();
        setBulkDeleting(false);
      },
    });
  };

  /* ── Render ────────────────────────────────────────────────────────────── */
  return (
    <div className="ubr-root">

      {confirmModal && <ConfirmModal {...confirmModal} onCancel={() => setConfirmModal(null)} />}

      {negCertModal && (
        <NegCertInfoModal
          subjectName={negCertModal.nameTerm}
          requestorName={negCertModal.requestorName}
          onSubmit={handleNegCertModalSubmit}
          onCancel={() => setNegCertModal(null)}
        />
      )}

      {pdfModal && <PdfModal {...pdfModal} onClose={() => setPdfModal(null)} showNotif={showNotif} />}

      {showUploadModal && (
        <UploadRecordsModal
          section="death"
          api={API}
          getRecordDisplayName={getRecordDisplayName}
          queueOffline={(file) => queueUpload(ENTITY, `${API}/records`, file)}
          allRecords={[...allRecords, ...allArchivedRecords]}
          showNotif={showNotif}
          onUploadSuccess={() => { fetchRecords(); fetchArchived(); }}
          onClose={() => setShowUploadModal(false)}
        />
      )}

      <div className="ubr-header">
        <div className="ubr-header__brand">
          <span className="ubr-header__logo"><IconGrid /></span>
          {!isMobile && <span className="ubr-header__title">Death Registry</span>}
        </div>
        <div className="ubr-header__tabs">
          {[
            { key: "transaction", label: isMobile ? "Transaction" : "New Transaction" },
            { key: "archive",     label: "Archive" },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`ubr-tab-btn ubr-tab-btn--${tab === t.key ? "active" : "inactive"}`}
            >
              <span className="ubr-tab-btn__label">{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {tab === "transaction" && (
        <div className="ubr-body">
          <div className="ubr-tx">
            <StepBar current={step} />
            <div className="ubr-tx__scroll">
              <div className="ubr-card">

                {step === "select" && (
                  <>
                    <div className="step-scroll">
                      <div className="step-inner">
                        <div className="page-hdr">
                          <div className="page-hdr__title">Search &amp; Select Death Record</div>
                        </div>
                        <div className="search-form">
                          <div className="search-form__row">
                            <div className="field">
                              <label className="field-label" htmlFor="death-search-last-name">Last Name</label>
                              <input
                                id="death-search-last-name"
                                name="lastName"
                                className={`field-input${lastNameError ? " field-input--error" : ""}`}
                                type="text"
                                autoComplete="family-name"
                                value={srchLastName}
                                onChange={(e) => { setSrchLastName(e.target.value); setHasSearched(false); if (e.target.value.trim()) setLastNameError(""); }}
                                onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
                                placeholder="e.g. Dela Cruz"
                                autoFocus
                              />
                              {lastNameError && <span className="field-error-msg">&#9888; {lastNameError}</span>}
                            </div>
                            <div className="field">
                              <label className="field-label" htmlFor="death-search-first-name">First Name</label>
                              <input
                                id="death-search-first-name"
                                name="firstName"
                                className={`field-input${firstNameError ? " field-input--error" : ""}`}
                                type="text"
                                autoComplete="given-name"
                                value={srchFirstName}
                                onChange={(e) => { setSrchFirstName(e.target.value); setHasSearched(false); if (e.target.value.trim()) setFirstNameError(""); }}
                                onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
                                placeholder="e.g. Juan"
                              />
                              {firstNameError && <span className="field-error-msg">&#9888; {firstNameError}</span>}
                            </div>
                            <button className="search-btn" onClick={handleSearch}>Search</button>
                          </div>
                        </div>

                        {hasSearched && (
                          <div className="results-box">
                            <div className="results-hdr">
                              <div className="results-hdr__left">
                                <div className="results-hdr__count">
                                  {sortedResults.length} record{sortedResults.length !== 1 ? "s" : ""} found
                                  {sortedResults.filter((r) => r._isArchived).length > 0 && (
                                    <span className="results-hdr__archived-count">
                                      &nbsp;&middot;&nbsp;{sortedResults.filter((r) => r._isArchived).length} from archive
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {sortedResults.length === 0 ? (
                              <div className="no-results">
                                <p className="no-results__title">No records found for "{searchLN}"</p>
                                <button className="neg-btn" onClick={openNegCertModal}>
                                  Issue Negative Certificate
                                </button>
                              </div>
                            ) : (
                              <>
                                {sortedResults.map((r) => {
                                  const display = getRecordDisplayName(r);
                                  const father = getFatherDisplayName(r);
                                  const mother = getMotherDisplayName(r);
                                  const isLoadingPrev = previewLoadingId === r.id;
                                  const isSelected =
                                    selectedRecord?.id === r.id &&
                                    !!selectedRecord?._isArchived === !!r._isArchived;
                                  const accuracy = getAccuracy(r);

                                  return (
                                    <div
                                      key={`${r._isArchived ? "arc" : "act"}-${r.id}`}
                                      className={[
                                        "result-row",
                                        isSelected ? "result-row--selected" : "",
                                        r._isArchived ? "result-row--archived" : "",
                                      ].filter(Boolean).join(" ")}
                                    >
                                      <div className="result-row__info">
                                        <div className="result-row__card-title">
                                          <span className="result-row__card-name">{display}</span>
                                          {r._isArchived && <span className="archived-badge">Archived</span>}
                                          <AccuracyBadge value={accuracy} />
                                        </div>
                                        <div className="result-row__chips">
                                          {father && <span className="result-chip result-chip--father">{father}</span>}
                                          {mother && <span className="result-chip result-chip--mother">{mother}</span>}
                                          {!father && !mother && (
                                            <span className="result-row__no-parent">No parent info recorded</span>
                                          )}
                                        </div>
                                      </div>

                                      <div className="result-row__actions">
                                        <button
                                          className="view-pdf-btn"
                                          onClick={() => handlePreviewPdf(r.id, r)}
                                          disabled={isLoadingPrev}
                                          title="View Death PDF"
                                        >
                                          {isLoadingPrev
                                            ? <><div className="spinner spinner--sm" />&nbsp;Loading…</>
                                            : "View"}
                                        </button>
                                        <button
                                          className={`select-btn${isSelected ? " select-btn--selected" : ""}`}
                                          onClick={() => !isSelected && handleSelectFromSearch(r)}
                                        >
                                          {isSelected ? "Selected" : "Select →"}
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                                <div className="no-match-alt">
                                  <span className="no-match-alt__text">Not the right person?</span>
                                  <button className="neg-btn neg-btn--inline" onClick={openNegCertModal}>
                                    Issue Negative Certificate
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="ubr-action-bar">
                      <button
                        className="btn btn-primary btn-proceed-compact"
                        onClick={handleProceedToPayment}
                        disabled={!selectedRecord && recordStatus !== "NOT_FOUND"}
                      >
                        Proceed →
                      </button>
                    </div>
                  </>
                )}

                {step === "payment" && (
                  <>
                    <div className="step-scroll">
                      <div className="step-inner step-inner--pdf">
                        <div className="page-hdr">
                          <div className="page-hdr__title">Review &amp; Print Document</div>
                          <p className="page-hdr__sub">
                            {isPositive
                              ? "Review the Death Certificate below. Print the selected PDF before proceeding to release."
                              : "A Negative Certificate will be issued — no document on file for this record."}
                          </p>
                        </div>
                        {isPositive ? (
                          <InlinePdfViewer
                            pdfData={step2PdfData}
                            pdfError={step2PdfError}
                            record={selectedRecord}
                            loadingPdf={step2PdfLoading}
                            showNotif={showNotif}
                            onPrint={() => showNotif("Printing selected PDF…", "success")}
                          />
                        ) : (
                          <NegativeCertPreview
                            subjectName={subjectName}
                            fatherName={negCertInfo.fatherName}
                            motherName={negCertInfo.motherName}
                            dateOfDeath={negCertInfo.dateOfDeath}
                            requestorName={negCertInfo.requestorName}
                            orNumber={orNumber}
                            onOrNumberChange={setOrNumber}
                            onPrint={handlePrintNegativeCert}
                          />
                        )}
                      </div>
                    </div>
                    <div className="ubr-action-bar">
                      <button className="btn btn-secondary btn-thick" onClick={() => setStep("select")}>← Back</button>
                      <button className="btn btn-primary btn-thick" onClick={handleConfirmPayment}>
                        Proceed to Release →
                      </button>
                    </div>
                  </>
                )}

                {step === "releasing" && (
                  <>
                    <div className="step-scroll">
                      <div className="step-inner step-inner--centered">
                        <div className="release-complete-wrap">
                          <div className="release-complete__ring">
                            <div className="release-complete__ring-inner">
                              <span className="release-complete__check">&#10003;</span>
                            </div>
                          </div>
                          <div className="release-complete__pct">100%</div>
                          <div className="release-complete__title">Request Complete</div>
                          <div className="release-complete__sub">
                            The document is ready for release to the requester.
                          </div>
                          <div className="release-complete__badge">
                            <span className="release-complete__badge-dot" />
                            Ready for Release
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="ubr-action-bar">
                      <button
                        className="btn btn-secondary btn-thick"
                        onClick={() => setStep("payment")}
                        disabled={processing}
                      >
                        ← Back
                      </button>
                      <button
                        className="btn btn-primary btn-primary--wide btn-thick"
                        onClick={async () => {
                          const saved = await handleCompleteTransaction();
                          if (saved) resetTransaction();
                        }}
                        disabled={processing}
                      >
                        {processing
                          ? <><div className="spinner spinner--sm" />&nbsp;Saving…</>
                          : "Release & New Transaction"}
                      </button>
                    </div>
                  </>
                )}

              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "archive" && (
        <div className="tab-wrap">
          {!archiveUnlocked ? (
            <>
              <div className="tab-hdr">
                <div className="tab-hdr__icon"><IconArchive /></div>
                <div className="tab-hdr__info">
                  <h2>Archived Death Records</h2>
                  <p>Upload, view, or permanently delete archived records.</p>
                </div>
              </div>
              <div className="tab-card">
                <PasswordGate
                  module="archive_death"
                  description="The Archive section is restricted to authorized personnel. Enter the administrator password to upload, view, or delete records."
                  onUnlock={() => setArchiveUnlocked(true)}
                  showNotif={showNotif}
                />
              </div>
            </>
          ) : (
            <>
              <div className="tab-hdr">
                <div className="tab-hdr__icon"><IconArchive /></div>
                <div className="tab-hdr__info">
                  <h2>Archived Records</h2>
                  {!isMobile && <p>Upload new records, or view and permanently delete archived records.</p>}
                </div>
                <div className="tab-hdr__space" />
                <button className="upload-btn" onClick={() => setShowUploadModal(true)}>
                  <IconUpload />
                  {isMobile ? "Upload" : "Upload PDF"}
                </button>
                <div className="srch-wrap">
                  <span className="srch-icon"><IconSearch /></span>
                  <input
                    id="death-archive-search"
                    name="archiveSearch"
                    aria-label="Search archived records"
                    value={archiveSearch}
                    onChange={(e) => setArchiveSearch(e.target.value)}
                    placeholder="Search archived…"
                    className="srch-input"
                  />
                </div>
              </div>
              <div className="tab-card">
                {selectedIds.size > 0 && (
                  <div className="bulk-bar">
                    <span className="bulk-bar__count">{selectedIds.size} selected</span>
                    <div className="bulk-bar__acts">
                      <button className="bulk-bar__clear" onClick={clearSelection} disabled={bulkDeleting}>
                        Clear
                      </button>
                      <button
                        className="tbl-btn tbl-btn--red bulk-bar__delete"
                        onClick={handleBulkDelete}
                        disabled={bulkDeleting}
                      >
                        {bulkDeleting
                          ? <><div className="spinner spinner--sm spinner--white" />&nbsp;Deleting…</>
                          : `Delete Selected (${selectedIds.size})`}
                      </button>
                    </div>
                  </div>
                )}

                {loadingRecords ? (
                  <SkeletonTable rows={5} cols={4} />
                ) : filteredArchived.length === 0 ? (
                  <div className="tbl-empty">
                    <span className="tbl-empty__icon"><IconFolder /></span>
                    <div className="tbl-empty__title">No Archived Records Found</div>
                    <div className="tbl-empty__sub">
                      {archiveSearch
                        ? "No records match your search."
                        : "No records have been archived yet. Use the Upload button above to add new records."}
                    </div>
                  </div>
                ) : useCards ? (
                  <>
                    <label className="select-all-mobile">
                      <input
                        type="checkbox"
                        className="tbl-checkbox"
                        checked={allSelected}
                        ref={(el) => { if (el) el.indeterminate = someSelected; }}
                        onChange={toggleSelectAll}
                      />
                      <span>Select all ({filteredArchived.length})</span>
                    </label>
                    <div className="mobile-records-list">
                      {filteredArchived.map((r, i) => (
                        <MobileRecordCardArchive
                          key={r.id}
                          record={r}
                          index={i}
                          selected={selectedIds.has(r.id)}
                          onToggle={() => toggleSelect(r.id)}
                          onView={() => handleViewPdf(r.id, r)}
                          onDelete={() => handleDelete(r.id, r)}
                        />
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="tbl-wrap">
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th className="tbl-check-col">
                            <input
                              type="checkbox"
                              className="tbl-checkbox"
                              checked={allSelected}
                              ref={(el) => { if (el) el.indeterminate = someSelected; }}
                              onChange={toggleSelectAll}
                              title={allSelected ? "Unselect all" : "Select all"}
                              aria-label="Select all records"
                            />
                          </th>
                          <th>#</th>
                          <th>Name</th>
                          <th>Father / Mother</th>
                          <th>Archived Date</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredArchived.map((r, i) => {
                          const checked = selectedIds.has(r.id);
                          return (
                            <tr key={r.id} className={checked ? "tbl-row--selected" : ""}>
                              <td className="tbl-check-col">
                                <input
                                  type="checkbox"
                                  className="tbl-checkbox"
                                  checked={checked}
                                  onChange={() => toggleSelect(r.id)}
                                  aria-label={`Select ${getRecordDisplayName(r)}`}
                                />
                              </td>
                              <td className="tbl-num">{i + 1}</td>
                              <td>
                                <div className="tbl-file">
                                  <span className="tbl-file__icon"><IconDocument /></span>
                                  <span className="tbl-file-name">{getRecordDisplayName(r)}</span>
                                </div>
                              </td>
                              <td><RelativesChips record={r} /></td>
                              <td className="tbl-date">{formatDate(r.archived_at)}</td>
                              <td>
                                <div className="tbl-acts">
                                  <button className="tbl-btn tbl-btn--blue" onClick={() => handleViewPdf(r.id, r)}>View</button>
                                  <button className="tbl-btn tbl-btn--red"  onClick={() => handleDelete(r.id, r)}>Delete</button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}