import React, { useState, useEffect, useRef, useCallback } from "react";
import ReactDOM from "react-dom/client";
import "../style/vital.css";
import sccLogo from "../../../assets/sidebar-icon/scc.png";
// FIX: added the same second logo import used in the Birth section so
// the Death registry shows both seals side by side, identical to Birth.
import lcrLogo from "../../../assets/lcr.jpg";

const API = `${import.meta.env.VITE_API_BASE_URL || ""}/api/death`;
const FEE = 75;
const MAX_UPLOAD = 5;

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
// FIX: second logo shown beside the primary logo (lcr.jpg), same as Birth.
// Leave blank ("") to render only the primary logo, same as before.
const LOGO_SRC_2 = lcrLogo;

const STEPS = [
  { key: "select",    label: "Select Record" },
  { key: "payment",  label: "Review & Print" },
  { key: "releasing", label: "Releasing" },
];

const VISUALLY_HIDDEN_STYLE = {
  position: "absolute",
  width: "1px",
  height: "1px",
  padding: 0,
  margin: "-1px",
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
};

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
    isMobile:  width < 480,
    isTablet:  width >= 480 && width < 768,
    isDesktop: width >= 768,
    width,
  };
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

function normalizeFileKey(name) {
  return (name || "").toString().trim().replace(/\.pdf$/i, "")
    .replace(/[_]+/g, " ").replace(/-+/g, " ").replace(/\s+/g, " ").toLowerCase();
}

function ensurePdfName(name) {
  if (!name) return "";
  return /\.pdf$/i.test(name) ? name : `${name}.pdf`;
}

function formatParentDisplayName(first, middle, last, fullName = "") {
  const f = cleanNamePart(first);
  const m = cleanNamePart(middle);
  const l = cleanNamePart(last);
  const fromParts = formatFullName(f, m, l);
  if (fromParts) return fromParts;
  if (fullName) return toTitleCase(fullName);
  return "";
}

function getRecordDisplayName(record) {
  if (!record) return "";
  const first  = cleanNamePart(record.deceased_first_name);
  const middle = cleanNamePart(record.deceased_middle_name);
  const last   = cleanNamePart(record.deceased_last_name);
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
  const name   = getRecordDisplayName(record).trim().toUpperCase();
  const father = getFatherDisplayName(record).trim().toUpperCase();
  const mother = getMotherDisplayName(record).trim().toUpperCase();
  return `${name}|${father}|${mother}`;
}

function normalizeForSearch(record) {
  const name     = getRecordDisplayName(record);
  const fileName = (record.file_name || "").replace(/\.pdf$/i, "")
    .replace(/[_,]+/g, " ").replace(/-+/g, " ").trim();
  const father = getFatherDisplayName(record);
  const mother = getMotherDisplayName(record);
  return [name, fileName, father, mother].join(" ").toUpperCase();
}

function matchesSearch(record, query) {
  if (!query || !query.trim()) return true;
  const haystack      = normalizeForSearch(record);
  const haystackWords = haystack.split(/\s+/).filter(Boolean);
  const queryWords    = query.trim().toUpperCase().split(/\s+/).filter(Boolean);
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

function createPdfBlobFromData(pdfData) {
  if (!pdfData) return null;
  try {
    if (pdfData instanceof Blob)
      return pdfData.type === "application/pdf"
        ? pdfData : new Blob([pdfData], { type: "application/pdf" });
    if (typeof pdfData !== "string") return null;
    if (pdfData.startsWith("data:application/pdf;base64,")) {
      const cleaned      = pdfData.replace(/^data:application\/pdf;base64,/i, "").replace(/\s/g, "");
      const byteChars    = atob(cleaned);
      const byteNumbers  = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
      return new Blob([new Uint8Array(byteNumbers)], { type: "application/pdf" });
    }
    if (pdfData.startsWith("%PDF"))
      return new Blob([pdfData], { type: "application/pdf" });
    if (!pdfData.startsWith("blob:") && !pdfData.startsWith("http://") && !pdfData.startsWith("https://")) {
      const cleaned     = pdfData.replace(/\s/g, "");
      const byteChars   = atob(cleaned);
      const byteNumbers = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
      return new Blob([new Uint8Array(byteNumbers)], { type: "application/pdf" });
    }
    return null;
  } catch (error) {
    console.error("Failed to create PDF blob:", error);
    return null;
  }
}

function getPdfBlobUrl(pdfData) {
  if (!pdfData) return "";
  try {
    if (typeof pdfData === "string") {
      if (pdfData.startsWith("blob:"))   return pdfData;
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
      if (!blob) { reject(new Error("Invalid PDF data.")); return; }
      const blobUrl = URL.createObjectURL(blob);
      const iframe  = document.createElement("iframe");
      iframe.className = "print-iframe";
      iframe.setAttribute("aria-hidden", "true");
      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        setTimeout(() => {
          try { if (iframe.parentNode) iframe.parentNode.removeChild(iframe); } catch {}
          try { URL.revokeObjectURL(blobUrl); } catch {}
        }, 1500);
      };
      iframe.onload = () => {
        const printWindow = iframe.contentWindow;
        if (!printWindow) { cleanup(); reject(new Error("Unable to access print frame.")); return; }
        const doPrint = () => {
          try {
            printWindow.focus();
            try { printWindow.onafterprint = () => { cleanup(); resolve(); }; } catch {}
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

// ── Office Logo ─────────────────────────────────────────────────────────
// FIX: now renders BOTH logos side by side (LOGO_SRC first, then
// LOGO_SRC_2 next to it) when both are provided, using the same
// className on each <img> so existing sizing CSS still applies unchanged
// to each logo image — identical implementation to the Birth section.
// If only LOGO_SRC is set (LOGO_SRC_2 blank), behavior is identical to
// before — a single logo image is rendered.
const OfficeLogo = ({ className = "" }) => {
  if (LOGO_SRC || LOGO_SRC_2) {
    return (
      <div className="office-logo-group">
        {LOGO_SRC && <img src={LOGO_SRC} alt="Office Seal" className={className} />}
        {LOGO_SRC_2 && <img src={LOGO_SRC_2} alt="LCR Seal" className={className} />}
      </div>
    );
  }
  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="50" cy="50" r="47" fill="#f8fafc" stroke="#1a3c6e" strokeWidth="2.5" />
      <circle cx="50" cy="50" r="39" fill="none" stroke="#1a3c6e" strokeWidth="1.2" />
      <path
        d="M50 20 L54 32 L67 32 L57 40 L61 53 L50 45 L39 53 L43 40 L33 32 L46 32 Z"
        fill="#1a3c6e"
      />
      <text
        x="50" y="72" textAnchor="middle"
        fontFamily="Times New Roman, serif" fontSize="8.5" fontWeight="700"
        fill="#1a3c6e" letterSpacing="0.5"
      >
        OFFICE SEAL
      </text>
    </svg>
  );
};

function NegativeCertDocument({ certData }) {
  const {
    subjectName, dateOfDeath, fatherName, motherName,
    requestorName, cityMunicipality, certifyingOfficer,
    verifiedBy, amountPaid, todayDate, orNumber, datePaid,
  } = certData;

  const dateStr   = dateOfDeath ? `on ${formatCertDate(dateOfDeath)} ` : "";
  const fatherStr = (fatherName  || "[Father's Name]").toUpperCase();
  const motherStr = (motherName  || "[Mother's Name]").toUpperCase();
  const city      = cityMunicipality || "this city/municipality";
  const reqName   = (requestorName || "[Requestor's Name]").toUpperCase();
  const year      = dateOfDeath ? new Date(dateOfDeath).getFullYear() : new Date().getFullYear();

  return (
    <div className="neg-print-page">
      <div className="neg-print-logo-wrap">
        <OfficeLogo className="neg-print-logo" />
      </div>
      <p className="neg-print-date">{todayDate}</p>
      <p className="neg-print-salutation">TO WHOM IT MAY CONCERN:</p>
      <p className="neg-print-para">
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;We certify that this office has no records of death of&nbsp;
        <strong className="neg-cert-doc__highlight">{(subjectName || "").toUpperCase()}</strong>
        &nbsp;who is alleged to have died {dateStr}in {city}, child of&nbsp;
        <strong className="neg-cert-doc__highlight">{fatherStr}</strong> and{" "}
        <strong className="neg-cert-doc__highlight">{motherStr}</strong>, hence, we cannot issue,
        as requested, a true copy of his/her Certificate of Death or transcription from
        the Register of Deaths.
      </p>
      <p className="neg-print-para">
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;We also certify that the records of Death for the
        year <strong>{year}</strong> are still intact in the archives of this office.
      </p>
      <p className="neg-print-para">
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;This certification is issued to&nbsp;
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
    font-size: 12pt; color: #000; background: #fff;
    padding: 1.2in 1in 1in 1in;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
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
        doc.open(); doc.write(fullHtml); doc.close();
        setTimeout(() => {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
          setTimeout(() => {
            try { document.body.removeChild(iframe); } catch {}
            try { root.unmount(); document.body.removeChild(mountPoint); } catch {}
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

const IconCheck = ({ className = "" }) => (
  <svg className={`icon-svg icon-svg--md ${className}`} viewBox="0 0 24 24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
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

const FileIconSm = () => (
  <svg className="icon-svg icon-svg--sm" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
  </svg>
);

const IconRotateCcw = ({ className = "" }) => (
  <svg className={`icon-svg icon-svg--sm ${className}`} viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1 4 1 10 7 10"/>
    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
  </svg>
);

let _toastSetters = [];
let _toastIdCounter = 0;

function useToasts() {
  const [toasts, setToasts] = useState([]);
  useEffect(() => {
    _toastSetters.push(setToasts);
    return () => {
      _toastSetters = _toastSetters.filter((s) => s !== setToasts);
    };
  }, []);
  return toasts;
}

function pushToast(toast) {
  const id = `${Date.now()}-${++_toastIdCounter}`;
  _toastSetters.forEach((set) => set((prev) => [...prev, { ...toast, id }]));
  return id;
}

function removeToast(id) {
  _toastSetters.forEach((set) =>
    set((prev) => prev.filter((t) => t.id !== id)),
  );
}

function ToastContainer() {
  const toasts = useToasts();
  return (
    <div className="bv-toast-wrap">
      {toasts.map((t) => (
        <Toast key={t.id} {...t} />
      ))}
    </div>
  );
}

function Toast({ id, title, message, duration = 5000, type = "success" }) {
  const [hiding, setHiding] = useState(false);

  const dismiss = () => {
    setHiding(true);
    setTimeout(() => removeToast(id), 300);
  };

  useEffect(() => {
    const timer = setTimeout(dismiss, duration);
    return () => clearTimeout(timer);
  }, []);

  const TOAST_COLORS = {
    success: "#059669",
    warning: "#d97706",
    error:   "#dc2626",
  };
  const color = TOAST_COLORS[type] || TOAST_COLORS.success;

  return (
    <div className={`bv-toast${hiding ? " bv-toast--hiding" : ""}`}>
      <svg
        className="bv-toast__icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {type === "success" && (
          <>
            <circle cx="12" cy="12" r="10" />
            <path d="M9 12l2 2 4-4" />
          </>
        )}
        {type === "warning" && (
          <>
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </>
        )}
        {type === "error" && (
          <>
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4m0 4h.01" />
          </>
        )}
      </svg>

      <div className="bv-toast__body">
        <div className="bv-toast__title">{title}</div>
        {message && <div className="bv-toast__msg">{message}</div>}
      </div>

      <button className="bv-toast__close" onClick={dismiss} aria-label="Dismiss">
        ×
      </button>

      <div className="bv-toast__progress">
        <div
          className="bv-toast__progress-bar"
          style={{ animationDuration: `${duration}ms`, background: color }}
        />
      </div>
    </div>
  );
}

function useShowNotif() {
  return (message, type = "success") => {
    const TOAST_TITLES = { success: "Success", warning: "Notice", error: "Error" };
    const title = TOAST_TITLES[type] || "Notice";
    pushToast({ title, message, type, duration: 5000 });
  };
}

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

const NegCertField = ({ label, required, error, htmlFor, children }) => (
  <div className="negcert-info-modal__field">
    <label className="negcert-info-modal__label" htmlFor={htmlFor}>
      {label}
      {required && <span className="negcert-info-modal__required"> *</span>}
    </label>
    {children}
    {error && <span className="negcert-info-modal__error" role="alert">&#9888; {error}</span>}
  </div>
);

const NegCertInfoModal = ({ subjectName, requestorName, onSubmit, onCancel }) => {
  const [dateOfDeath, setDateOfDeath] = useState("");
  const [fatherName,  setFatherName]  = useState("");
  const [motherName,  setMotherName]  = useState("");
  const [dodError,    setDodError]    = useState("");
  const [fatherError, setFatherError] = useState("");
  const [motherError, setMotherError] = useState("");

  const handleSubmit = () => {
    let valid = true;
    if (!dateOfDeath)       { setDodError("Date of death is required.");    valid = false; } else setDodError("");
    if (!fatherName.trim()) { setFatherError("Father's name is required."); valid = false; } else setFatherError("");
    if (!motherName.trim()) { setMotherError("Mother's name is required."); valid = false; } else setMotherError("");
    if (!valid) return;
    onSubmit({
      dateOfDeath,
      fatherName:    fatherName.trim(),
      motherName:    motherName.trim(),
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
              For&nbsp;<strong className="negcert-info-modal__name">{subjectName || "this person"}</strong>
            </p>
          </div>
        </div>

        <div className="negcert-info-modal__fields">
          <NegCertField label="Date of Death" required error={dodError} htmlFor="negcert-date-of-death">
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

          <NegCertField label="Father's Full Name" required error={fatherError} htmlFor="negcert-father-name">
            <input
              id="negcert-father-name"
              name="fatherName"
              type="text"
              autoComplete="off"
              className={`negcert-info-modal__input${fatherError ? " negcert-info-modal__input--error" : ""}`}
              value={fatherName}
              onChange={(e) => { setFatherName(e.target.value); if (e.target.value.trim()) setFatherError(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
            />
          </NegCertField>

          <NegCertField label="Mother's Full Name" required error={motherError} htmlFor="negcert-mother-name">
            <input
              id="negcert-mother-name"
              name="motherName"
              type="text"
              autoComplete="off"
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

const PdfModal = ({ pdfData, fileName, onClose, showNotif }) => {
  const [pdfUrl,   setPdfUrl]   = useState("");
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    const url = getPdfBlobUrl(pdfData);
    setPdfUrl(url);
    return () => { if (url && url.startsWith("blob:")) URL.revokeObjectURL(url); };
  }, [pdfData]);

  const handlePrint = async () => {
    if (!pdfData) { showNotif?.("No PDF available to print.", "error"); return; }
    try {
      setPrinting(true);
      await printPdfFromData(pdfData);
      showNotif?.("Printing selected PDF…", "success");
    } catch (error) {
      console.error(error);
      showNotif?.("Failed to print PDF.", "error");
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
            <button className="hdr-btn hdr-btn--close" onClick={onClose}>&#10005; Close</button>
          </div>
        </div>
        <div className="pdf-body">
          {pdfUrl ? (
            <iframe key={pdfUrl} src={`${pdfUrl}#toolbar=1&navpanes=0`} title={fileName} className="pdf-body__iframe" />
          ) : (
            <div className="pdf-inline-empty">
              <span className="pdf-inline-empty__icon"><IconDocumentLg /></span>
              <div className="pdf-inline-empty__title">Unable to display PDF</div>
              <div className="pdf-inline-empty__sub">The selected PDF is empty or invalid.</div>
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
            const done   = i < idx;
            const active = i === idx;
            const mod    = done ? "done" : active ? "active" : "pending";
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
  const [showPw,  setShowPw]  = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!pwInput.trim()) { showNotif("Password is required.", "error"); return; }
    setLoading(true);
    try {
      const res  = await fetch(`${API}/auth/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module, password: pwInput }),
      });
      const data = await res.json();
      if (data.success) onUnlock();
      else showNotif(data.message || "Incorrect password.", "error");
    } catch { showNotif("Cannot reach server.", "error"); }
    finally { setLoading(false); }
  };

  return (
    <div className="pw-gate">
      <div className="pw-gate__icon">
        <IconLock />
      </div>
      <p className="pw-gate__desc">{description}</p>
      <div className="pw-gate__form">
        <label className="pw-lbl" htmlFor="archive-admin-password">Administrator Password</label>
        <div className="pw-input-wrap">
          <input
            id="archive-admin-password"
            name="adminPassword"
            type={showPw ? "text" : "password"}
            value={pwInput}
            onChange={(e) => setPwInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
            placeholder="Enter password"
            className="pw-input"
            autoComplete="current-password"
            autoFocus
          />
          <button
            className="pw-toggle"
            type="button"
            onClick={() => setShowPw((v) => !v)}
            title={showPw ? "Hide password" : "Show password"}
            aria-label={showPw ? "Hide password" : "Show password"}
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
  const officer   = OFFICE_CONFIG.certifyingOfficer;
  const verified  = OFFICE_CONFIG.verifiedBy;
  const year      = dateOfDeath ? new Date(dateOfDeath).getFullYear() : new Date().getFullYear();

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
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;We certify that this office has no records of death of{" "}
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
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;We also certify that the records of Death for the year <strong>{year}</strong> are still intact in the archives of this office.
          </p>
          <p className="neg-cert-doc__para">
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;This certification is issued to{" "}
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
              <label className="neg-cert-doc__payment-label" htmlFor="neg-cert-or-number">O.R. Number</label>
              <span className="neg-cert-doc__payment-colon">:</span>
              <input
                id="neg-cert-or-number"
                name="orNumber"
                type="text"
                autoComplete="off"
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

const UploadModal = ({ onClose, onUploadSuccess, allRecords, showNotif }) => {
  const [stage,           setStage]           = useState("upload");
  const [queue,           setQueue]           = useState([]);
  const [uploadedRecords, setUploadedRecords] = useState([]);
  const [matches,         setMatches]         = useState([]);
  const [isUploading,     setIsUploading]     = useState(false);
  const fileRef = useRef(null);

  const slotsLeft    = MAX_UPLOAD - queue.length;
  const limitReached = queue.length >= MAX_UPLOAD;

  const getLimitClass = () => {
    if (limitReached)                   return "upl-limit-badge--reached";
    if (queue.length >= MAX_UPLOAD - 1) return "upl-limit-badge--warn";
    return "upl-limit-badge--ok";
  };

  const existingFileKeys = new Set(
    (allRecords || []).map((r) => normalizeFileKey(r.file_name || getRecordDisplayName(r))),
  );

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    const newFiles = [];
    const tempQueued = new Set(queue.map((q) => normalizeFileKey(q.file.name)));
    for (const file of files) {
      if (queue.length + newFiles.length >= MAX_UPLOAD) { showNotif(`Maximum ${MAX_UPLOAD} files allowed.`, "error"); break; }
      if (file.type !== "application/pdf") { showNotif(`"${file.name}" is not a PDF.`, "error"); continue; }
      const key = normalizeFileKey(file.name);
      if (existingFileKeys.has(key)) { showNotif(`"${ensurePdfName(file.name)}" already exists.`, "error"); continue; }
      if (tempQueued.has(key)) { showNotif(`"${ensurePdfName(file.name)}" is already in queue.`, "error"); continue; }
      tempQueued.add(key);
      newFiles.push({ file, status: "pending", error: null, id: Date.now() + Math.random() });
    }
    if (newFiles.length > 0) setQueue((q) => [...q, ...newFiles]);
  };

  const removeFromQueue = (id) => setQueue((q) => q.filter((item) => item.id !== id));

  const handleUploadAll = async () => {
    if (queue.length === 0) { showNotif("Please add at least one file.", "error"); return; }
    setIsUploading(true);
    const uploaded = [];
    for (const item of queue) {
      setQueue((q) => q.map((qi) => qi.id === item.id ? { ...qi, status: "uploading" } : qi));
      try {
        const fd = new FormData();
        fd.append("file", item.file);
        const res = await fetch(`${API}/records`, { method: "POST", body: fd });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Upload failed"); }
        const data = await res.json();
        uploaded.push(data);
        setQueue((q) => q.map((qi) => qi.id === item.id ? { ...qi, status: "done" } : qi));
      } catch (err) {
        setQueue((q) => q.map((qi) => qi.id === item.id ? { ...qi, status: "error", error: err.message } : qi));
        showNotif(`Failed to upload "${item.file.name}": ${err.message}`, "error");
      }
    }
    setIsUploading(false);
    if (uploaded.length > 0) {
      setUploadedRecords(uploaded);
      onUploadSuccess();
      const uploadedLastNames = uploaded.map((r) => (r.deceased_last_name || "").trim().toUpperCase()).filter(Boolean);
      const refreshed = [...allRecords, ...uploaded.map((r) => ({ ...r, uploaded_at: new Date().toISOString() }))];
      setMatches(refreshed.filter((r) => {
        const ln = getRecordLastName(r);
        return uploadedLastNames.some((ul) => ul && ln && (ul === ln || ul.includes(ln) || ln.includes(ul)));
      }));
      setStage("results");
      showNotif(`${uploaded.length} file${uploaded.length > 1 ? "s" : ""} uploaded!`, "success");
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="upl-modal" onClick={(e) => e.stopPropagation()}>
        <div className="upl-hdr">
          <div className="upl-hdr__icon"><IconUpload /></div>
          <div className="upl-hdr__text">
            <div className="upl-hdr__title">Upload Death Record PDFs</div>
            <div className="upl-hdr__sub">
              {stage === "upload"
                ? `Select up to ${MAX_UPLOAD} PDF files to upload`
                : `${uploadedRecords.length} file${uploadedRecords.length > 1 ? "s" : ""} uploaded successfully`}
            </div>
          </div>
          <button className="upl-close" onClick={onClose} aria-label="Close upload dialog">&#10005;</button>
        </div>

        {stage === "upload" && (
          <div className="upl-body">
            <div className="upl-limit-row">
              <span className={`upl-limit-badge ${getLimitClass()}`}>
                {queue.length} / {MAX_UPLOAD} files
              </span>
              {limitReached && <span className="upl-limit-reached-msg">Maximum limit reached</span>}
            </div>
            <div
              className={`dropzone${limitReached ? " dropzone--disabled" : ""}`}
              onClick={() => !isUploading && !limitReached && fileRef.current?.click()}
            >
              <label style={VISUALLY_HIDDEN_STYLE} htmlFor="death-record-pdf-upload">
                Select PDF files to upload
              </label>
              <input
                id="death-record-pdf-upload"
                name="pdfFiles"
                ref={fileRef}
                type="file"
                accept="application/pdf"
                multiple
                onChange={handleFileChange}
                style={{ display: "none" }}
              />
              {isUploading ? (
                <div className="dropzone__uploading">
                  <div className="spinner" />
                  <span className="dropzone__uploading-text">Uploading…</span>
                </div>
              ) : limitReached ? (
                <>
                  <div className="dropzone__icon-wrap dropzone__icon-wrap--blocked">&#128683;</div>
                  <div className="dropzone__title">Upload limit reached</div>
                  <div className="dropzone__sub">Remove a file to add another</div>
                </>
              ) : (
                <>
                  <div className="dropzone__icon-wrap"><IconDocumentLg /></div>
                  <div className="dropzone__title">Click to select PDF files</div>
                  <div className="dropzone__sub">
                    PDF only · Max {MAX_UPLOAD} files · Max 20 MB each
                    {slotsLeft < MAX_UPLOAD ? ` · ${slotsLeft} slot${slotsLeft !== 1 ? "s" : ""} remaining` : ""}
                  </div>
                </>
              )}
            </div>
            {queue.length > 0 && (
              <div className="upl-queue">
                <div className="upl-queue__hdr">
                  <span>Upload Queue ({queue.length})</span>
                  {!isUploading && (
                    <button className="upl-queue__clear-btn" onClick={() => setQueue([])}>Clear All</button>
                  )}
                </div>
                {queue.map((item) => (
                  <div key={item.id} className="upl-queue__item">
                    <span className="upl-queue__item-icon"><FileIconSm /></span>
                    <span className="upl-queue__name" title={item.file.name}>{ensurePdfName(item.file.name)}</span>
                    <span className={`upl-queue__status upl-queue__status--${item.status}`}>
                      {item.status === "pending"   && "Pending"}
                      {item.status === "uploading" && "Uploading…"}
                      {item.status === "done"      && "Done"}
                      {item.status === "error"     && `Error: ${item.error || "Unknown"}`}
                    </span>
                    {!isUploading && item.status !== "done" && (
                      <button className="upl-queue__remove" onClick={() => removeFromQueue(item.id)} title="Remove" aria-label={`Remove ${ensurePdfName(item.file.name)} from queue`}>
                        &#10005;
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="upl-foot">
              <button className="btn btn-secondary" onClick={onClose} disabled={isUploading}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={handleUploadAll}
                disabled={isUploading || queue.length === 0 || queue.every((q) => q.status === "done")}
              >
                {isUploading
                  ? <><div className="spinner spinner--sm" />&nbsp;Uploading…</>
                  : `Upload ${queue.filter((q) => q.status === "pending").length} File${queue.filter((q) => q.status === "pending").length !== 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
        )}

        {stage === "results" && (
          <div className="upl-body">
            <div className="upl-ok">
              <div className="upl-ok__emoji"><IconCheck /></div>
              <div>
                <div className="upl-ok__title">
                  {uploadedRecords.length} file{uploadedRecords.length > 1 ? "s" : ""} uploaded successfully
                </div>
                <div className="upl-ok__sub">
                  {uploadedRecords.map((r) => getRecordDisplayName(r)).join(", ")}
                </div>
              </div>
            </div>
            <div>
              <div className="upl-matches-hdr">
                <span className="upl-matches-hdr__text">Matching surname records: {matches.length}</span>
              </div>
              {matches.length === 0 ? (
                <div className="upl-matches-empty">No other records share the same surname.</div>
              ) : matches.map((r, i) => {
                const isNew = uploadedRecords.some((u) => normalizeFileKey(u.file_name) === normalizeFileKey(r.file_name));
                return (
                  <div key={r.id || i} className={`upl-match-row${isNew ? " upl-match-row--new" : ""}`}>
                    <div className="upl-match-row__left">
                      <span className="upl-match-row__left-icon"><FileIconSm /></span>
                      <span className="upl-match-row__name">{getRecordDisplayName(r)}</span>
                      {isNew && <span className="upl-match-row__badge">Just Uploaded</span>}
                    </div>
                    <span className="upl-match-row__date">{formatDate(r.uploaded_at || new Date())}</span>
                  </div>
                );
              })}
            </div>
            <div className="upl-foot">
              <button className="btn btn-primary" onClick={onClose}>Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const InlinePdfViewer = ({ pdfData, record, onPrint, loadingPdf, showNotif }) => {
  const displayName             = record ? getRecordDisplayName(record) : "";
  const [pdfUrl,   setPdfUrl]   = useState("");
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (!pdfData) { setPdfUrl(""); return; }
    const url = getPdfBlobUrl(pdfData);
    setPdfUrl(url);
    return () => { if (url && url.startsWith("blob:")) URL.revokeObjectURL(url); };
  }, [pdfData]);

  const handlePrint = async () => {
    if (!pdfData) { showNotif?.("No PDF available to print.", "error"); return; }
    try {
      setPrinting(true);
      await printPdfFromData(pdfData);
      onPrint && onPrint();
      showNotif?.("Printing selected PDF…", "success");
    } catch (error) {
      console.error(error);
      showNotif?.("Failed to print PDF.", "error");
    } finally { setPrinting(false); }
  };

  if (loadingPdf) return (
    <div className="pdf-inline-loading"><div className="spinner" /><span>Loading document…</span></div>
  );

  if (!pdfUrl) return (
    <div className="pdf-inline-empty">
      <span className="pdf-inline-empty__icon"><IconDocumentLg /></span>
      <div className="pdf-inline-empty__title">No document to display</div>
      <div className="pdf-inline-empty__sub">Select a record to preview it here.</div>
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

const MobileRecordCardArchive = ({ record, index, onView, onDelete, onRestore, restoring }) => {
  const displayName = getRecordDisplayName(record);
  const father      = getFatherDisplayName(record);
  const mother      = getMotherDisplayName(record);
  return (
    <div className="mobile-record-card">
      <div className="mobile-record-card__top">
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
        <button
          className="tbl-btn tbl-btn--green"
          style={{ background: "#059669", borderColor: "#059669", color: "#fff" }}
          onClick={onRestore}
          disabled={restoring}
        >
          {restoring ? "Restoring…" : "Restore"}
        </button>
        <button className="tbl-btn tbl-btn--red"  onClick={onDelete}>Delete</button>
      </div>
    </div>
  );
};

/* ── Main Component ──────────────────────────────────────────────────────── */
export default function UnifiedDeathRegistry() {
  const [tab,             setTab]             = useState("transaction");
  const [confirmModal,    setConfirmModal]    = useState(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [pdfModal,        setPdfModal]        = useState(null);
  const [negCertModal,    setNegCertModal]    = useState(null);
  const [negCertInfo,     setNegCertInfo]     = useState({ fatherName: "", motherName: "", dateOfDeath: "", requestorName: "" });
  const [orNumber,        setOrNumber]        = useState("");

  const showNotif = useShowNotif();

  const [step,           setStep]           = useState("select");
  const [srchFirstName,  setSrchFirstName]  = useState("");
  const [srchLastName,   setSrchLastName]   = useState("");
  const [hasSearched,    setHasSearched]    = useState(false);
  const [firstNameError, setFirstNameError] = useState("");
  const [lastNameError,  setLastNameError]  = useState("");
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [recordStatus,   setRecordStatus]   = useState(null);
  const [subjectName,    setSubjectName]    = useState("");
  const [payRef,         setPayRef]         = useState("");
  const [processing,     setProcessing]     = useState(false);
  const [restoringId,    setRestoringId]    = useState(null);

  const [step2PdfData,     setStep2PdfData]     = useState(null);
  const [step2PdfLoading,  setStep2PdfLoading]  = useState(false);
  const [previewLoadingId, setPreviewLoadingId] = useState(null);

  const [allRecords,         setAllRecords]         = useState([]);
  const [allArchivedRecords, setAllArchivedRecords] = useState([]);
  const [loadingRecords,     setLoadingRecords]     = useState(false);
  const [archiveSearch,      setArchiveSearch]      = useState("");
  const [archiveUnlocked,    setArchiveUnlocked]    = useState(false);

  const fetchRecordsAbortRef  = useRef(null);
  const fetchArchivedAbortRef = useRef(null);

  const { isMobile, isTablet } = useViewport();
  const useCards = isMobile || isTablet;

  const activeIdentityKeys = new Set(allRecords.map(getRecordIdentityKey));

  const allRecordsForSearch = [
    ...allRecords,
    ...allArchivedRecords
      .filter((r) => !activeIdentityKeys.has(getRecordIdentityKey(r)))
      .map((r) => ({ ...r, _isArchived: true })),
  ];

  const fetchRecords = useCallback(async () => {
    if (fetchRecordsAbortRef.current) fetchRecordsAbortRef.current.abort();
    const controller = new AbortController();
    fetchRecordsAbortRef.current = controller;

    setLoadingRecords(true);
    try {
      const res  = await fetch(`${API}/records`, { signal: controller.signal });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setAllRecords(Array.isArray(data) ? data : []);
    } catch (err) {
      if (err?.name !== "AbortError") showNotif("Failed to load records.", "error");
    } finally {
      if (fetchRecordsAbortRef.current === controller) setLoadingRecords(false);
    }
  }, []);

  const fetchArchived = useCallback(async () => {
    if (fetchArchivedAbortRef.current) fetchArchivedAbortRef.current.abort();
    const controller = new AbortController();
    fetchArchivedAbortRef.current = controller;

    setLoadingRecords(true);
    try {
      const res  = await fetch(`${API}/archived`, { signal: controller.signal });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const arr  = Array.isArray(data) ? data : [];
      setAllArchivedRecords(arr);
    } catch (err) {
      if (err?.name !== "AbortError") showNotif("Failed to load archived records.", "error");
    } finally {
      if (fetchArchivedAbortRef.current === controller) setLoadingRecords(false);
    }
  }, []);

  useEffect(() => { fetchRecords(); fetchArchived(); }, [fetchRecords, fetchArchived]);

  // Explicit, user-initiated restore only. This is now the ONLY place in the
  // component that calls the restore endpoint — it's wired to a visible
  // "Restore" button in the Archive tab (see below), never fired implicitly
  // from search/select. Selecting a record from search results
  // (handleSelectFromSearch) does NOT call this.
  const restoreRecord = useCallback(async (id, record) => {
    setRestoringId(id);
    try {
      const res = await fetch(`${API}/records/${id}/restore`, { method: "POST" });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Restore failed"); }
      await fetchRecords();
      await fetchArchived();
      showNotif(`"${getRecordDisplayName(record)}" restored to active records.`, "success");
      return true;
    } catch (err) {
      showNotif(err.message || "Failed to restore record.", "error");
      return false;
    } finally { setRestoringId(null); }
  }, [fetchRecords, fetchArchived]);

  const handleRestoreClick = (id, record) => setConfirmModal({
    title: "Restore Record",
    message: `Restore <strong>"${getRecordDisplayName(record)}"</strong> from the archive back to active records?`,
    confirmLabel: "Restore",
    confirmColor: "#059669",
    onConfirm: async () => {
      setConfirmModal(null);
      await restoreRecord(id, record);
    },
  });

  const handleSearch = () => {
    let valid = true;
    if (!srchFirstName.trim()) { setFirstNameError("First name is required."); valid = false; } else setFirstNameError("");
    if (!srchLastName.trim())  { setLastNameError("Last name is required.");   valid = false; } else setLastNameError("");
    if (!valid) return;
    setHasSearched(true);
  };

  const searchFN = srchFirstName.trim().toUpperCase();
  const searchLN = srchLastName.trim().toUpperCase();

  const searchResults = hasSearched && searchLN
    ? allRecordsForSearch.filter((r) => {
        const ln      = getRecordLastName(r);
        const lnWords = ln.split(/\s+/).filter(Boolean);
        const qWords  = searchLN.split(/\s+/).filter(Boolean);
        return qWords.every((qw) => lnWords.some((lw) => lw === qw));
      })
    : [];

  const sortedResults = [...searchResults].sort((a, b) => {
    const aFN = getRecordFirstName(a); const bFN = getRecordFirstName(b);
    if (!a._isArchived && b._isArchived) return -1;
    if (a._isArchived  && !b._isArchived) return 1;
    const aExact = searchFN && aFN === searchFN;
    const bExact = searchFN && bFN === searchFN;
    if (aExact && !bExact) return -1;
    if (!aExact && bExact) return 1;
    return aFN.localeCompare(bFN);
  });

  // FIX: selecting a record — whether active or archived — is purely a
  // local/UI action. It only sets which record is chosen for this
  // transaction; it never calls the backend and never changes the
  // record's real is_archived status in the database. Archived records
  // stay archived until an admin explicitly clicks "Restore" in the
  // Archive tab (see restoreRecord/handleRestoreClick above).
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
    showNotif(`Issuing Negative Certificate for "${nameTerm}"`, "success");
    setStep("payment");
  };

  const handlePreviewPdf = async (id, record) => {
    setPreviewLoadingId(id);
    try {
      const res  = await fetch(`${API}/records/${id}`);
      if (!res.ok) throw new Error("Failed to load PDF.");
      const data = await res.json();
      if (!data?.pdf_data) throw new Error("No PDF data returned by the server.");
      setPdfModal({ pdfData: data.pdf_data, fileName: getRecordDisplayName(record || data), id });
    } catch (err) { showNotif(err.message, "error"); }
    finally { setPreviewLoadingId(null); }
  };

  const loadStep2Pdf = async (record) => {
    if (!record) { setStep2PdfData(null); return; }
    setStep2PdfLoading(true);
    try {
      const res  = await fetch(`${API}/records/${record.id}`);
      if (!res.ok) throw new Error("Failed to load PDF.");
      const data = await res.json();
      if (!data?.pdf_data) throw new Error("No PDF data returned by the server.");
      setStep2PdfData(data.pdf_data);
    } catch (err) { showNotif(err.message, "error"); setStep2PdfData(null); }
    finally { setStep2PdfLoading(false); }
  };

  const handleProceedToPayment = async () => {
    setStep("payment");
    if (selectedRecord) await loadStep2Pdf(selectedRecord);
    else setStep2PdfData(null);
  };

  const isPositive = recordStatus === "ACTIVE";
  const issuedDoc  = isPositive
    ? "Certified True Copy of Death Certificate (Actual)"
    : "Certificate of No Death Record (Negative Certificate)";

  const handlePrintNegativeCert = () => {
    if (!orNumber.trim()) {
      showNotif("O.R. Number is required before printing the certificate.", "error");
      return;
    }
    printNegativeCertificate({
      subjectName,
      dateOfDeath:       negCertInfo.dateOfDeath  || null,
      fatherName:        negCertInfo.fatherName    || null,
      motherName:        negCertInfo.motherName    || null,
      requestorName:     negCertInfo.requestorName || null,
      cityMunicipality:  OFFICE_CONFIG.cityMunicipality,
      certifyingOfficer: OFFICE_CONFIG.certifyingOfficer,
      verifiedBy:        OFFICE_CONFIG.verifiedBy,
      amountPaid:        OFFICE_CONFIG.amountPaid,
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
    try {
      const res = await fetch(`${API}/records/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          searchOperator: subjectName, recordStatus,
          recordId: selectedRecord?.id || null,
          paymentMethod: "cash", paymentReference: payRef,
          paymentAmount: FEE, documentIssued: issuedDoc,
          orNumber: orNumber.trim() || null,
          first_name:  selectedRecord?.deceased_first_name  || srchFirstName.trim(),
          middle_name: selectedRecord?.deceased_middle_name || "",
          last_name:   selectedRecord?.deceased_last_name   || srchLastName.trim(),
        }),
      });

      let data = {};
      try { data = await res.json(); } catch { /* non-JSON body — data stays {} */ }

      if (!res.ok || data?.error) {
        throw new Error(data?.error || "Failed to save the transaction. Please try again.");
      }

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
    setSubjectName(""); setPayRef(""); setStep2PdfData(null);
    setNegCertInfo({ fatherName: "", motherName: "", dateOfDeath: "", requestorName: "" });
    setOrNumber("");
    fetchRecords(); fetchArchived();
  };

  const handleViewPdf = async (id, record) => {
    try {
      const res  = await fetch(`${API}/records/${id}`);
      if (!res.ok) throw new Error("Failed to load PDF.");
      const data = await res.json();
      if (!data?.pdf_data) throw new Error("No PDF data returned by the server.");
      setPdfModal({ pdfData: data.pdf_data, fileName: getRecordDisplayName(record || data), id });
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
        const res = await fetch(`${API}/records/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error((await res.json()).error || "Delete failed");
        showNotif(`"${getRecordDisplayName(record)}" deleted.`, "success");
        fetchArchived();
      } catch (err) { showNotif(err.message, "error"); }
    },
  });

  const filteredArchived = archiveSearch.trim()
    ? allArchivedRecords.filter((r) => matchesSearch(r, archiveSearch.trim()))
    : allArchivedRecords;

  /* ── Render ────────────────────────────────────────────────────────────── */
  return (
    <div className="ubr-root">
      <ToastContainer />

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
        <UploadModal
          onClose={() => setShowUploadModal(false)}
          onUploadSuccess={() => { fetchRecords(); fetchArchived(); }}
          allRecords={[...allRecords, ...allArchivedRecords]}
          showNotif={showNotif}
        />
      )}

      {/* ── Header / Tab bar ──────────────────────────────────────────── */}
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

      {/* ── Transaction Tab ───────────────────────────────────────────── */}
      {tab === "transaction" && (
        <div className="ubr-body">
          <div className="ubr-tx">
            <StepBar current={step} />
            <div className="ubr-tx__scroll">
              <div className="ubr-card">

                {/* Step 1 — Select */}
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
                              <label className="field-label" htmlFor="search-last-name">Last Name</label>
                              <input
                                id="search-last-name"
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
                              {lastNameError && <span className="field-error-msg" role="alert">&#9888; {lastNameError}</span>}
                            </div>
                            <div className="field">
                              <label className="field-label" htmlFor="search-first-name">First Name</label>
                              <input
                                id="search-first-name"
                                name="firstName"
                                className={`field-input${firstNameError ? " field-input--error" : ""}`}
                                type="text"
                                autoComplete="given-name"
                                value={srchFirstName}
                                onChange={(e) => { setSrchFirstName(e.target.value); setHasSearched(false); if (e.target.value.trim()) setFirstNameError(""); }}
                                onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
                                placeholder="e.g. Juan"
                              />
                              {firstNameError && <span className="field-error-msg" role="alert">&#9888; {firstNameError}</span>}
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
                                  const display       = getRecordDisplayName(r);
                                  const father        = getFatherDisplayName(r);
                                  const mother        = getMotherDisplayName(r);
                                  const isLoadingPrev = previewLoadingId === r.id;
                                  const isSelected    =
                                    selectedRecord?.id === r.id &&
                                    !!selectedRecord?._isArchived === !!r._isArchived;

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
                        className="btn btn-primary"
                        onClick={handleProceedToPayment}
                        disabled={!selectedRecord && recordStatus !== "NOT_FOUND"}
                      >
                        Proceed →
                      </button>
                    </div>
                  </>
                )}

                {/* Step 2 — Review & Print */}
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
                      <button className="btn btn-secondary" onClick={() => setStep("select")}>← Back</button>
                      <button className="btn btn-primary" onClick={handleConfirmPayment}>
                        Proceed to Release →
                      </button>
                    </div>
                  </>
                )}

                {/* Step 3 — Release */}
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
                        className="btn btn-secondary"
                        onClick={() => setStep("payment")}
                        disabled={processing}
                      >
                        ← Back
                      </button>
                      <button
                        className="btn btn-primary btn-primary--wide"
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

      {/* ── Archive Tab ───────────────────────────────────────────────── */}
      {tab === "archive" && (
        <div className="tab-wrap">
          {!archiveUnlocked ? (
            <>
              <div className="tab-hdr">
                <div className="tab-hdr__icon"><IconArchive /></div>
                <div className="tab-hdr__info">
                  <h2>Archived Death Records</h2>
                  <p>Upload, view, restore, or permanently delete archived records.</p>
                </div>
              </div>
              <div className="tab-card">
                <PasswordGate
                  module="archive_death"
                  description="The Archive section is restricted to authorized personnel. Enter the administrator password to upload, view, restore, or delete records."
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
                  {!isMobile && <p>Upload new records, or view, restore, and permanently delete archived records.</p>}
                </div>
                <div className="tab-hdr__space" />
                <button className="upload-btn" onClick={() => setShowUploadModal(true)}>
                  <IconUpload />
                  {isMobile ? "Upload" : "Upload PDF"}
                </button>
                <div className="srch-wrap">
                  <span className="srch-icon"><IconSearch /></span>
                  <label style={VISUALLY_HIDDEN_STYLE} htmlFor="archive-search-input">Search archived records</label>
                  <input
                    id="archive-search-input"
                    name="archiveSearch"
                    value={archiveSearch}
                    onChange={(e) => setArchiveSearch(e.target.value)}
                    placeholder="Search archived…"
                    className="srch-input"
                    type="search"
                    autoComplete="off"
                  />
                </div>
              </div>
              <div className="tab-card">
                {loadingRecords ? (
                  <div className="tbl-loading">
                    <div className="spinner" />
                    <span>Loading archived records…</span>
                  </div>
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
                  <div className="mobile-records-list">
                    {filteredArchived.map((r, i) => (
                      <MobileRecordCardArchive
                        key={r.id}
                        record={r}
                        index={i}
                        onView={() => handleViewPdf(r.id, r)}
                        onRestore={() => handleRestoreClick(r.id, r)}
                        restoring={restoringId === r.id}
                        onDelete={() => handleDelete(r.id, r)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="tbl-wrap">
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Name</th>
                          <th>Father / Mother</th>
                          <th>Archived Date</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredArchived.map((r, i) => (
                          <tr key={r.id}>
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
                                <button
                                  className="tbl-btn tbl-btn--green"
                                  style={{ background: "#059669", borderColor: "#059669", color: "#fff" }}
                                  onClick={() => handleRestoreClick(r.id, r)}
                                  disabled={restoringId === r.id}
                                  title="Restore to active records"
                                >
                                  {restoringId === r.id ? (
                                    <><div className="spinner spinner--sm" />&nbsp;Restoring…</>
                                  ) : (
                                    <><IconRotateCcw />&nbsp;Restore</>
                                  )}
                                </button>
                                <button className="tbl-btn tbl-btn--red"  onClick={() => handleDelete(r.id, r)}>Delete</button>
                              </div>
                            </td>
                          </tr>
                        ))}
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