import React, { useState, useEffect, useRef, useCallback } from "react";
import ReactDOM from "react-dom/client";
import "../style/vital.css";
import sccLogo from "../../../assets/sidebar-icon/scc.png";
import lcrLogo from "../../../assets/lcr.jpg";

const API = `${import.meta.env.VITE_API_BASE_URL || ""}/api/birth`;
const FEE = 75;
const MAX_UPLOAD = 5;

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

const BTN = "h-[34px] px-[14px] border-0 rounded-full text-[12.5px] font-semibold cursor-pointer whitespace-nowrap inline-flex items-center gap-[5px] [font-family:var(--f)] transition-all duration-150 touch-manipulation [-webkit-tap-highlight-color:transparent] flex-shrink-0";
const BTN_PRIMARY = `${BTN} !bg-[#2563eb] !text-white shadow-[0_2px_8px_rgba(37,99,235,0.25)] min-w-[110px] justify-center hover:enabled:!bg-[#1d4ed8] hover:enabled:-translate-y-px hover:enabled:shadow-[0_4px_16px_rgba(37,99,235,0.35)] disabled:!bg-[rgba(37,99,235,0.35)] disabled:cursor-not-allowed disabled:shadow-none`;
const BTN_SECONDARY = `${BTN} !bg-white !text-[var(--txt2)] border border-[1.5px] border-[var(--border-strong)] shadow-none hover:enabled:!bg-[var(--surf-2)] hover:enabled:!text-[var(--txt)] hover:enabled:border-[var(--txt3)] hover:enabled:-translate-y-px disabled:!bg-white disabled:!text-[var(--txt3)] disabled:border-[var(--border-lt)] disabled:cursor-not-allowed`;

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
    isMobile: width < 480,
    isTablet: width >= 480 && width < 768,
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
  const first = cleanNamePart(record.child_first_name);
  const middle = cleanNamePart(record.child_middle_name);
  const last = cleanNamePart(record.child_last_name);
  const fromParts = formatFullName(first, middle, last);
  if (fromParts) return fromParts;
  if (record.child_full_name) return toTitleCase(record.child_full_name);
  return normalizeDisplayName(record.file_name || "");
}

function getFatherDisplayName(record) {
  return formatParentDisplayName(
    record?.father_first_name, record?.father_middle_name,
    record?.father_last_name, record?.father_full_name,
  );
}

function getMotherDisplayName(record) {
  return formatParentDisplayName(
    record?.mother_first_name, record?.mother_middle_name,
    record?.mother_last_name, record?.mother_full_name,
  );
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
  if (record?.child_last_name) return record.child_last_name.trim().toUpperCase();
  if (record?.child_full_name) {
    const parts = record.child_full_name.trim().split(/\s+/);
    return (parts[parts.length - 1] || "").toUpperCase();
  }
  const clean = (record?.file_name || "").replace(/\.pdf$/i, "").trim();
  if (clean.includes(",")) return clean.split(",")[0].trim().toUpperCase();
  const parts = clean.split(/[\s_]+/);
  return (parts[parts.length - 1] || "").toUpperCase();
}

function getRecordFirstName(record) {
  if (record?.child_first_name) return record.child_first_name.trim().toUpperCase();
  if (record?.child_full_name)
    return (record.child_full_name.trim().split(/\s+/)[0] || "").toUpperCase();
  return "";
}

function bytesFromBase64(b64) {
  const cleaned = b64.replace(/\s/g, "");
  const byteChars = atob(cleaned);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
  return new Uint8Array(byteNumbers);
}

function looksLikePdf(bytes) {
  return (
    !!bytes && bytes.length >= 4 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  );
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

    let cleaned = pdfData.startsWith("data:application/pdf;base64,")
      ? pdfData.replace(/^data:application\/pdf;base64,/i, "")
      : pdfData;
    cleaned = cleaned.replace(/\s/g, "");

    if (cleaned.startsWith("%PDF")) {
      return new Blob([cleaned], { type: "application/pdf" });
    }

    let bytes;
    try {
      bytes = bytesFromBase64(cleaned);
    } catch (e) {
      console.error("Invalid base64 PDF data:", e);
      return null;
    }

    if (!looksLikePdf(bytes)) {
      try {
        const innerText = new TextDecoder("ascii").decode(bytes).trim();
        const innerBytes = bytesFromBase64(innerText);
        if (looksLikePdf(innerBytes)) bytes = innerBytes;
      } catch {
      }
    }

    if (!looksLikePdf(bytes)) {
      console.error("Decoded PDF data does not start with the %PDF signature — data is invalid or corrupted.");
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
      if (!blob) { reject(new Error("Invalid PDF data.")); return; }
      const blobUrl = URL.createObjectURL(blob);
      const iframe = document.createElement("iframe");
      iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
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

const OfficeLogo = ({ className = "" }) => {
  if (LOGO_SRC || LOGO_SRC_2) {
    return (
      <div className="flex items-center gap-[6px]">
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
    subjectName, dateOfBirth, fatherName, motherName,
    requestorName, cityMunicipality, certifyingOfficer,
    verifiedBy, amountPaid, todayDate, orNumber, datePaid,
  } = certData;

  const dateStr = dateOfBirth ? `on ${formatCertDate(dateOfBirth)} ` : "";
  const fatherStr = (fatherName || "[Father's Name]").toUpperCase();
  const motherStr = (motherName || "[Mother's Name]").toUpperCase();
  const city = cityMunicipality || "this city/municipality";
  const reqName = (requestorName || "[Requestor's Name]").toUpperCase();
  const year = dateOfBirth ? new Date(dateOfBirth).getFullYear() : new Date().getFullYear();

  return (
    <div className="w-full">
      <div className="absolute -top-[48pt] -left-[46pt]">
        <OfficeLogo className="w-[62pt] h-[62pt] block" />
      </div>
      <p className="text-right mb-[28pt] text-[12pt]">{todayDate}</p>
      <p className="text-[12pt] mb-[16pt] font-normal">TO WHOM IT MAY CONCERN:</p>
      <p className="indent-[36pt] text-justify mb-[12pt] text-[12pt]">
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;We certify that this office has no records of birth of&nbsp;
        <strong className="font-bold text-black">{(subjectName || "").toUpperCase()}</strong>
        &nbsp;who is alleged to have been born {dateStr}in {city} from parents,&nbsp;
        <strong className="font-bold text-black">{fatherStr}</strong> and{" "}
        <strong className="font-bold text-black">{motherStr}</strong> hence, we cannot issue,
        as requested, a true copy of his/her Certificate of Live Birth or transcription from
        the Register of Births.
      </p>
      <p className="indent-[36pt] text-justify mb-[12pt] text-[12pt]">
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;We also certify that the records of Birth for the
        year <strong>{year}</strong> are still intact in the archives of this office.
      </p>
      <p className="indent-[36pt] text-justify mb-[12pt] text-[12pt]">
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;This certification is issued to&nbsp;
        <strong className="font-bold text-black">{reqName}</strong> upon his/her request.
      </p>
      <div className="mt-[36pt] flex justify-end">
        <div className="text-center min-w-[200pt]">
          <div className="font-bold text-[12pt] text-black">{certifyingOfficer.name}</div>
          <div className="italic text-[12pt] font-bold text-black">{certifyingOfficer.title}</div>
        </div>
      </div>
      <div className="mt-[28pt]">
        <div className="text-[12pt] mb-[18pt]">Verified by:</div>
        <span className="font-bold text-[12pt] text-center block">{verifiedBy.name}</span>
        <span className="italic text-[12pt] font-bold text-center block">{verifiedBy.title}</span>
      </div>
      <div className="mt-[32pt] text-[12pt]">
        <div className="mb-[6pt] flex gap-1 items-end">
          <span className="min-w-[90pt] flex-shrink-0">Amount Paid</span>
          <span className="min-w-[8pt] flex-shrink-0 mr-1">:</span>
          <span className="flex-1 text-[12pt] text-black">{amountPaid || "₱75.00"}</span>
        </div>
        <div className="mb-[6pt] flex gap-1 items-end">
          <span className="min-w-[90pt] flex-shrink-0">O.R. Number</span>
          <span className="min-w-[8pt] flex-shrink-0 mr-1">:</span>
          <span className="flex-1 text-[12pt] text-black">{orNumber || ""}</span>
        </div>
        <div className="mb-[6pt] flex gap-1 items-end">
          <span className="min-w-[90pt] flex-shrink-0">Date Paid</span>
          <span className="min-w-[8pt] flex-shrink-0 mr-1">:</span>
          <span className="flex-1 text-[12pt] text-black">{datePaid || todayDate}</span>
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
  .highlight { font-weight: bold; color: #000; }
</style>
</head>
<body>${renderedHtml}</body>
</html>`;
      const iframe = document.createElement("iframe");
      iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
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
  <svg className={`inline-flex items-center justify-center flex-shrink-0 align-middle stroke-current fill-none w-[14px] h-[14px] ${className}`} viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
  </svg>
);

const IconClipboard = ({ className = "" }) => (
  <svg className={`inline-flex items-center justify-center flex-shrink-0 align-middle stroke-current fill-none w-[14px] h-[14px] ${className}`} viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="2" width="6" height="4" rx="1" ry="1"/>
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
    <line x1="12" y1="11" x2="12" y2="17"/>
    <line x1="9" y1="14" x2="15" y2="14"/>
  </svg>
);

const IconGrid = ({ className = "" }) => (
  <svg className={`inline-flex items-center justify-center flex-shrink-0 align-middle stroke-current fill-none w-[14px] h-[14px] ${className}`} viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
    <line x1="9" y1="9" x2="15" y2="9"/>
    <line x1="9" y1="13" x2="15" y2="13"/>
    <line x1="9" y1="17" x2="12" y2="17"/>
  </svg>
);

const IconArchive = ({ className = "" }) => (
  <svg className={`inline-flex items-center justify-center flex-shrink-0 align-middle stroke-current fill-none w-[11px] h-[11px] ${className}`} viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="21 8 21 21 3 21 3 8"/>
    <rect x="1" y="3" width="22" height="5"/>
    <line x1="10" y1="12" x2="14" y2="12"/>
  </svg>
);

const IconLock = ({ className = "" }) => (
  <svg className={`inline-flex items-center justify-center flex-shrink-0 align-middle stroke-current fill-none w-[22px] h-[22px] ${className}`} viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
);

const IconUpload = ({ className = "" }) => (
  <svg className={`inline-flex items-center justify-center flex-shrink-0 align-middle stroke-current fill-none w-[14px] h-[14px] ${className}`} viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="17 8 12 3 7 8"/>
    <line x1="12" y1="3" x2="12" y2="15"/>
  </svg>
);

const IconSearch = ({ className = "" }) => (
  <svg className={`inline-flex items-center justify-center flex-shrink-0 align-middle stroke-current fill-none w-[11px] h-[11px] ${className}`} viewBox="0 0 24 24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/>
    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);

const IconPrint = ({ className = "" }) => (
  <svg className={`inline-flex items-center justify-center flex-shrink-0 align-middle stroke-current fill-none w-[11px] h-[11px] ${className}`} viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 6 2 18 2 18 9"/>
    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
    <rect x="6" y="14" width="12" height="8"/>
  </svg>
);

const IconInfo = ({ className = "" }) => (
  <svg className={`inline-flex items-center justify-center flex-shrink-0 align-middle stroke-current fill-none w-[11px] h-[11px] ${className}`} viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="8" x2="12" y2="12"/>
    <line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
);

const IconCheck = ({ className = "" }) => (
  <svg className={`inline-flex items-center justify-center flex-shrink-0 align-middle stroke-current fill-none w-[14px] h-[14px] ${className}`} viewBox="0 0 24 24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

const IconEye = ({ className = "" }) => (
  <svg className={`inline-flex items-center justify-center flex-shrink-0 align-middle stroke-current fill-none w-[18px] h-[18px] ${className}`} viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
);

const IconEyeOff = ({ className = "" }) => (
  <svg className={`inline-flex items-center justify-center flex-shrink-0 align-middle stroke-current fill-none w-[18px] h-[18px] ${className}`} viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
);

const IconFolder = ({ className = "" }) => (
  <svg className={`inline-flex items-center justify-center flex-shrink-0 align-middle stroke-current fill-none w-[30px] h-[30px] ${className}`} viewBox="0 0 24 24" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
  </svg>
);

const IconDocumentLg = ({ className = "" }) => (
  <svg className={`inline-flex items-center justify-center flex-shrink-0 align-middle stroke-current fill-none w-[26px] h-[26px] ${className}`} viewBox="0 0 24 24" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
  </svg>
);

const FileIconSm = () => (
  <svg className="inline-flex items-center justify-center flex-shrink-0 align-middle stroke-current fill-none w-[11px] h-[11px]" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
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
    <div className="fixed top-5 right-5 z-[99999] flex flex-col gap-[10px] pointer-events-none">
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
    error: "#dc2626",
  };
  const color = TOAST_COLORS[type] || TOAST_COLORS.success;

  return (
    <div
      className="bg-white border border-[#e5e7eb] rounded-[10px] shadow-[0_4px_20px_rgba(0,0,0,0.10),0_1px_6px_rgba(0,0,0,0.06)] pt-[13px] px-[14px] pb-4 min-w-[280px] max-w-[360px] flex items-start gap-[11px] pointer-events-auto relative overflow-hidden"
      style={{ animation: hiding ? "bvToastSlideOut 0.28s ease forwards" : "bvToastSlideIn 0.35s cubic-bezier(0.22,1,0.36,1) both" }}
    >
      <svg
        className="w-5 h-5 flex-shrink-0 mt-px"
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

      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-bold text-[#1a2332] mb-[2px] [font-family:var(--f)] leading-[1.3]">{title}</div>
        {message && <div className="text-xs text-[#4a5568] leading-[1.5] [font-family:var(--f)] break-words">{message}</div>}
      </div>

      <button className="bg-transparent border-0 cursor-pointer text-[#9ca3af] text-[17px] leading-none p-0 flex-shrink-0 -mt-px [font-family:var(--f)] transition-colors duration-150 hover:text-[#1a2332]" onClick={dismiss} aria-label="Dismiss">
        ×
      </button>

      <div className="h-[3px] bg-[#f3f4f6] absolute bottom-0 left-0 right-0 overflow-hidden rounded-b-[10px]">
        <div
          className="h-full w-full rounded-b-[10px]"
          style={{ animation: `bvToastShrink ${duration}ms linear forwards`, background: color }}
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
  <div className="fixed inset-0 bg-[rgba(15,23,42,0.45)] [backdrop-filter:blur(4px)] z-[9998] flex items-center justify-center p-4" style={{ animation: "fadeIn 0.15s ease" }} onClick={onCancel}>
    <div className="modal-box-glow bg-white rounded-[14px] px-[18px] py-5 max-w-[360px] w-full shadow-[0_16px_48px_rgba(0,0,0,0.16),0_4px_12px_rgba(0,0,0,0.08)] border border-[var(--border-strong)] relative overflow-hidden" style={{ animation: "slideUp 0.2s ease" }} onClick={(e) => e.stopPropagation()}>
      <h3 className="m-0 mb-[7px] text-[15px] font-bold text-[var(--txt)] [font-family:var(--fh)]">{title}</h3>
      <p className="m-0 mb-4 text-[12.5px] text-[var(--txt2)] leading-[1.6]" dangerouslySetInnerHTML={{ __html: message }} />
      <div className="flex gap-[7px] justify-end items-center flex-wrap">
        <button className="px-[14px] py-[7px] rounded-[7px] border border-[var(--border-strong)] !bg-white !text-[var(--txt2)] text-[12.5px] font-semibold cursor-pointer [font-family:var(--f)] transition-all duration-150 touch-manipulation flex-shrink-0 hover:!bg-[var(--surf-2)] hover:!text-[var(--txt)] hover:border-[var(--txt3)]" onClick={onCancel}>Cancel</button>
        <button
          className="px-[14px] py-[7px] rounded-[7px] border-0 !text-white text-[12.5px] font-semibold cursor-pointer [font-family:var(--f)] transition-[filter,transform] duration-150 touch-manipulation flex-shrink-0 !bg-[#dc2626] hover:brightness-90 hover:-translate-y-px"
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  </div>
);

const NegCertField = ({ label, htmlFor, required, error, children }) => (
  <div className="flex flex-col gap-1">
    <label className="flex items-center gap-[5px] text-[10px] font-bold uppercase tracking-[0.5px] text-[var(--txt3)] leading-none" htmlFor={htmlFor}>
      {label}
      {required && <span className="text-[#dc2626] ml-px text-[11px]"> *</span>}
    </label>
    {children}
    {error && <span className="text-[10.5px] font-semibold text-[var(--red)] flex items-center gap-[3px]">&#9888; {error}</span>}
  </div>
);

const NegCertInfoModal = ({ subjectName, requestorName, onSubmit, onCancel }) => {
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [fatherName, setFatherName] = useState("");
  const [motherName, setMotherName] = useState("");
  const [dobError, setDobError] = useState("");
  const [fatherError, setFatherError] = useState("");
  const [motherError, setMotherError] = useState("");

  const handleSubmit = () => {
    let valid = true;
    if (!dateOfBirth) { setDobError("Date of birth is required."); valid = false; } else setDobError("");
    if (!fatherName.trim()) { setFatherError("Father's name is required."); valid = false; } else setFatherError("");
    if (!motherName.trim()) { setMotherError("Mother's name is required."); valid = false; } else setMotherError("");
    if (!valid) return;
    onSubmit({
      dateOfBirth,
      fatherName: fatherName.trim(),
      motherName: motherName.trim(),
      requestorName: requestorName || subjectName || "",
    });
  };

  const inputCls = (err) => `h-9 px-[11px] border border-[1.5px] border-[var(--border-strong)] rounded-[7px] text-[13px] [font-family:var(--f)] text-[var(--txt)] bg-white outline-none w-full transition-[border-color,box-shadow,background] duration-150 [-webkit-appearance:none] focus:border-[var(--blue)] focus:shadow-[0_0_0_3px_rgba(37,99,235,0.12)] focus:bg-white${err ? " !border-[var(--red)] !shadow-[0_0_0_3px_rgba(220,38,38,0.10)]" : ""}`;

  return (
    <div className="fixed inset-0 bg-[rgba(15,23,42,0.45)] [backdrop-filter:blur(4px)] z-[9998] flex items-center justify-center p-4" style={{ animation: "fadeIn 0.15s ease" }} onClick={onCancel}>
      <div className="modal-box-glow bg-white rounded-[14px] max-w-[420px] w-full shadow-[0_16px_48px_rgba(0,0,0,0.16),0_4px_12px_rgba(0,0,0,0.08)] border border-[var(--border-strong)] relative overflow-hidden p-0" style={{ animation: "slideUp 0.2s ease" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-[11px] px-4 pt-[14px] pb-3 bg-[var(--surf-2)] border-b border-[var(--border)]">
          <div className="min-w-0">
            <h3 className="mb-[2px] [font-family:var(--fh)] text-[14px] font-extrabold text-[var(--txt)] tracking-[-0.2px]">Negative Certificate Details</h3>
            <p className="m-0 text-[11.5px] text-[var(--txt2)] leading-[1.4]">
              For&nbsp;<strong className="text-[var(--blue)]">{subjectName || "this person"}</strong>
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-[10px] px-4 pt-[14px]">
          <NegCertField label="Date of Birth" htmlFor="negcert-dob" required error={dobError}>
            <input
              id="negcert-dob"
              name="dateOfBirth"
              type="date"
              className={inputCls(dobError)}
              value={dateOfBirth}
              onChange={(e) => { setDateOfBirth(e.target.value); if (e.target.value) setDobError(""); }}
              autoFocus
            />
          </NegCertField>

          <NegCertField label="Father's Full Name" htmlFor="negcert-father" required error={fatherError}>
            <input
              id="negcert-father"
              name="fatherName"
              type="text"
              className={inputCls(fatherError)}
              value={fatherName}
              onChange={(e) => { setFatherName(e.target.value); if (e.target.value.trim()) setFatherError(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
            />
          </NegCertField>

          <NegCertField label="Mother's Full Name" htmlFor="negcert-mother" required error={motherError}>
            <input
              id="negcert-mother"
              name="motherName"
              type="text"
              className={inputCls(motherError)}
              value={motherName}
              onChange={(e) => { setMotherName(e.target.value); if (e.target.value.trim()) setMotherError(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
            />
          </NegCertField>
        </div>

        <div className="flex gap-[7px] justify-end items-center flex-wrap px-4 pt-3 pb-[14px] border-t border-[var(--border)] mt-3">
          <button className="px-[14px] py-[7px] rounded-[7px] border border-[var(--border-strong)] !bg-white !text-[var(--txt2)] text-[12.5px] font-semibold cursor-pointer [font-family:var(--f)] transition-all duration-150 touch-manipulation flex-shrink-0 hover:!bg-[var(--surf-2)] hover:!text-[var(--txt)] hover:border-[var(--txt3)]" onClick={onCancel}>Cancel</button>
          <button
            className="px-[14px] py-[7px] rounded-[7px] border-0 !text-white text-[12.5px] font-semibold cursor-pointer [font-family:var(--f)] transition-[filter,transform] duration-150 touch-manipulation flex-shrink-0 whitespace-nowrap !bg-[#d97706] hover:!bg-[#b45309]"
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
  const [pdfUrl, setPdfUrl] = useState("");
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    const url = getPdfBlobUrl(pdfData);
    setPdfUrl(url);
    if (pdfData && !url) {
      showNotif?.("This PDF could not be displayed — the stored file appears to be corrupted.", "error");
    }
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
    <div className="fixed inset-0 bg-[rgba(15,23,42,0.55)] [backdrop-filter:blur(6px)] z-[9999] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-[14px] w-full max-w-[900px] h-[88vh] flex flex-col overflow-hidden shadow-[0_16px_48px_rgba(0,0,0,0.16),0_4px_12px_rgba(0,0,0,0.08)] border border-[var(--border-strong)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-3 py-[10px] bg-[var(--surf-2)] text-[var(--txt)] flex-shrink-0 gap-[10px] flex-wrap border-b border-[var(--border)]">
          <span className="font-semibold text-[12.5px] flex-1 break-words text-[var(--txt)] flex items-center gap-[5px]">
            <span className="inline-flex items-center flex-shrink-0 text-[var(--txt3)]"><IconDocument /></span>
            {fileName}
          </span>
          <div className="flex gap-[5px] flex-shrink-0 items-center">
            {pdfUrl && (
              <button className="px-[10px] py-1 rounded-[5px] border-0 !text-white text-[11.5px] font-semibold cursor-pointer [font-family:var(--f)] transition-[filter,transform] duration-150 whitespace-nowrap touch-manipulation flex-shrink-0 !bg-[#2563eb] hover:brightness-90 hover:-translate-y-px" onClick={handlePrint} disabled={printing}>
                {printing ? "Printing…" : "Print"}
              </button>
            )}
            <button className="px-[10px] py-1 rounded-[5px] border-0 !text-white text-[11.5px] font-semibold cursor-pointer [font-family:var(--f)] transition-[filter,transform] duration-150 whitespace-nowrap touch-manipulation flex-shrink-0 !bg-[#64748b] hover:brightness-90 hover:-translate-y-px" onClick={onClose}>&#10005; Close</button>
          </div>
        </div>
        <div className="flex-1 overflow-hidden bg-[var(--bg)]">
          {pdfUrl ? (
            <iframe key={pdfUrl} src={`${pdfUrl}#toolbar=1&navpanes=0`} title={fileName} className="w-full h-full border-0 block" />
          ) : (
            <div className="flex flex-col items-center justify-center gap-[7px] py-11 px-[18px] border border-[1.5px] border-dashed border-[var(--border-strong)] rounded-[9px] bg-[var(--surf-2)] text-center">
              <span className="flex items-center justify-center text-[var(--txt3)]"><IconDocumentLg /></span>
              <div className="text-[13px] font-bold text-[var(--txt2)]">Unable to display PDF</div>
              <div className="text-[11.5px] text-[var(--txt3)] max-w-[260px] leading-[1.6]">The selected PDF is empty or invalid.</div>
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
    <div className="bg-white border-b border-[var(--border)] pt-[10px] px-[18px] pb-0 flex-shrink-0 w-full shadow-[inset_0_1px_0_rgba(255,255,255,0.80)] print:hidden">
      <div className="pb-[10px]">
        <div className="flex items-start relative">
          {STEPS.map((s, i) => {
            const done = i < idx;
            const active = i === idx;
            const isLast = i === STEPS.length - 1;
            const segDone = i < idx;
            const circleCls = done
              ? "!bg-[rgba(5,150,105,0.10)] !text-[#059669] !border-[rgba(5,150,105,0.30)]"
              : active
              ? "!bg-[#2563eb] !text-white !border-[#2563eb] shadow-[0_0_0_3px_rgba(37,99,235,0.18)]"
              : "!bg-[#f1f5f9] !text-[var(--txt3)] !border-[var(--border-strong)]";
            const labelCls = done
              ? "font-medium !text-[#059669]"
              : active
              ? "font-bold !text-[#2563eb]"
              : "font-normal text-[var(--txt3)]";
            return (
              <React.Fragment key={s.key}>
                <div className="flex flex-col items-center gap-[5px] flex-shrink-0 z-[2] relative">
                  <div className={`w-[26px] h-[26px] rounded-full flex items-center justify-center font-bold text-[11px] transition-all duration-300 [font-family:var(--f)] flex-shrink-0 border-2 ${circleCls}`}>
                    {done ? "✓" : i + 1}
                  </div>
                  {(!isMobile || active) && (
                    <span className={`text-[10px] whitespace-nowrap [font-family:var(--f)] ${labelCls}`}>{s.label}</span>
                  )}
                </div>
                {!isLast && (
                  <div className="flex-1 relative h-[26px] flex items-center min-w-[20px]">
                    <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[2px] bg-[var(--border-strong)] rounded-[2px]" />
                    {segDone && <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[2px] rounded-[2px] transition-all duration-500 bg-[linear-gradient(90deg,#059669,#2563eb)]" />}
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

  const handleSubmit = async () => {
    if (!pwInput.trim()) { showNotif("Password is required.", "error"); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/verify`, {
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
    <div className="flex flex-col items-center justify-center py-9 px-[18px] gap-[14px]">
      <div className="w-[52px] h-[52px] bg-[var(--blue-lt)] border border-[1.5px] border-[var(--blue-bd)] rounded-full flex items-center justify-center text-[var(--blue)] flex-shrink-0">
        <IconLock />
      </div>
      <p className="text-[12.5px] text-[var(--txt2)] text-center max-w-[340px] leading-[1.65]">{description}</p>
      <div className="w-full max-w-[300px] flex flex-col gap-[7px]">
        <label className="text-[10px] font-bold text-[var(--blue)] uppercase tracking-[0.4px]" htmlFor="pw-gate-input">Administrator Password</label>
        <div className="relative">
          <input
            id="pw-gate-input"
            name="password"
            type={showPw ? "text" : "password"}
            value={pwInput}
            onChange={(e) => setPwInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
            placeholder="Enter password"
            className="w-full h-[38px] pl-3 pr-[34px] border border-[1.5px] border-[var(--border-strong)] rounded-[7px] text-sm [font-family:var(--f)] text-[var(--txt)] bg-white outline-none tracking-[2px] transition-[border-color,box-shadow] duration-150 [-webkit-appearance:none] focus:border-[var(--blue)] focus:shadow-[0_0_0_3px_rgba(37,99,235,0.12)] focus:bg-white placeholder:tracking-normal"
            autoFocus
          />
          <button
            className="absolute right-[9px] top-1/2 -translate-y-1/2 bg-transparent border-0 cursor-pointer opacity-40 touch-manipulation flex items-center text-[var(--txt)] p-0 hover:opacity-75"
            type="button"
            onClick={() => setShowPw((v) => !v)}
            title={showPw ? "Hide password" : "Show password"}
            aria-label={showPw ? "Hide password" : "Show password"}
          >
            {showPw ? <IconEyeOff /> : <IconEye />}
          </button>
        </div>
        <button className={`${BTN_PRIMARY} w-full justify-center h-9 text-[12.5px]`} onClick={handleSubmit} disabled={loading}>
          {loading ? (<><div className="w-[13px] h-[13px] border-2 border-[var(--blue-md)] border-t-[var(--blue)] rounded-full animate-spin flex-shrink-0" />&nbsp;Verifying…</>) : "Unlock & View Records →"}
        </button>
      </div>
    </div>
  );
};

const RelativesChips = ({ record }) => {
  const father = getFatherDisplayName(record);
  const mother = getMotherDisplayName(record);
  if (!father && !mother) return <span className="text-[10.5px] text-[var(--txt3)] italic">—</span>;
  return (
    <div className="flex flex-col gap-[2px] min-w-[110px]">
      {father && <span className="inline-flex items-center gap-[3px] text-[10.5px] font-semibold px-[7px] py-[2px] rounded-[10px] whitespace-nowrap bg-[#dbeafe] text-[#1d4ed8] border border-[rgba(37,99,235,0.22)]">{father}</span>}
      {mother && <span className="inline-flex items-center gap-[3px] text-[10.5px] font-semibold px-[7px] py-[2px] rounded-[10px] whitespace-nowrap bg-[#fce7f3] text-[#9d174d] border border-[rgba(219,39,119,0.22)]">{mother}</span>}
    </div>
  );
};

const NegativeCertPreview = ({
  subjectName, fatherName, motherName, dateOfBirth, requestorName,
  orNumber, onOrNumberChange, onPrint,
}) => {
  const todayDate = formatTodayLong();
  const officer = OFFICE_CONFIG.certifyingOfficer;
  const verified = OFFICE_CONFIG.verifiedBy;
  const year = dateOfBirth ? new Date(dateOfBirth).getFullYear() : new Date().getFullYear();

  return (
    <div className="flex flex-col border border-[1.5px] border-[rgba(220,38,38,0.28)] rounded-[9px] overflow-hidden shadow-[var(--shadow-sm)]">
      <div className="flex items-center justify-between px-3 py-2 bg-[var(--surf-2)] gap-2 flex-shrink-0 flex-wrap border-b border-[var(--border)]">
        <div className="flex items-center gap-[7px] min-w-0 flex-1">
          <span className="inline-flex items-center flex-shrink-0 text-[var(--txt3)]"><IconClipboard /></span>
          <span className="text-[12.5px] font-semibold text-[var(--txt)] whitespace-nowrap overflow-hidden text-ellipsis">Certificate of No Birth Record</span>
          <span className="inline-flex items-center px-[7px] py-[2px] rounded-[20px] bg-[var(--blue-lt)] border border-[var(--blue-bd)] text-[9.5px] font-bold text-[var(--blue)] whitespace-nowrap tracking-[0.3px] flex-shrink-0">Negative Certificate</span>
        </div>
        <button className="inline-flex items-center gap-[5px] px-3 py-[6px] rounded-[7px] border-0 !bg-[#2563eb] !text-white text-xs font-bold cursor-pointer [font-family:var(--f)] whitespace-nowrap flex-shrink-0 transition-all duration-150 shadow-[0_2px_8px_rgba(37,99,235,0.25)] touch-manipulation hover:enabled:!bg-[#1d4ed8] hover:enabled:-translate-y-px" onClick={onPrint}>
          <span className="flex items-center flex-shrink-0"><IconPrint /></span>
          Print Certificate
        </button>
      </div>
      <div className="bg-white overflow-y-auto max-h-[calc(100vh-var(--home-topbar-height)-52px-240px)] min-h-[300px] [-webkit-overflow-scrolling:touch] max-[640px]:max-h-[44vh] max-[640px]:min-h-[220px] max-[480px]:max-h-[38vh] max-[480px]:min-h-[180px]">
        <div className="pt-10 px-[52px] pb-9 [font-family:'Times_New_Roman',Times,serif] text-black text-[13px] leading-[1.7] relative max-[640px]:pt-6 max-[640px]:px-5 max-[640px]:pb-5 max-[640px]:text-xs max-[480px]:pt-[18px] max-[480px]:px-[14px] max-[480px]:pb-4 max-[480px]:text-[11.5px]">
          <div className="absolute top-[18px] left-5 max-[640px]:top-3 max-[640px]:left-[14px] max-[480px]:top-2 max-[480px]:left-[10px]">
            <OfficeLogo className="w-14 h-14 block max-[640px]:w-[42px] max-[640px]:h-[42px] max-[480px]:w-[34px] max-[480px]:h-[34px]" />
          </div>
          <p className="text-right mb-6 text-[13px] text-black">{todayDate}</p>
          <p className="text-[13px] mb-4 font-normal text-black">TO WHOM IT MAY CONCERN:</p>
          <p className="text-justify mb-3 text-[13px] text-black leading-[1.75]">
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;We certify that this office has no records of birth of{" "}
            <strong className="font-bold text-black">{(subjectName || "").toUpperCase()}</strong>{" "}
            who is alleged to have been born on{" "}
            {dateOfBirth
              ? <strong className="font-bold text-black">{formatCertDate(dateOfBirth)}</strong>
              : <strong className="font-bold text-black !text-[#94a3b8] italic !font-normal">[DATE OF BIRTH]</strong>
            }{" "}
            in {OFFICE_CONFIG.cityMunicipality} from parents,{" "}
            {fatherName
              ? <strong className="font-bold text-black">{fatherName.toUpperCase()}</strong>
              : <strong className="font-bold text-black !text-[#94a3b8] italic !font-normal">[FATHER'S NAME]</strong>
            }{" "}and{" "}
            {motherName
              ? <strong className="font-bold text-black">{motherName.toUpperCase()}</strong>
              : <strong className="font-bold text-black !text-[#94a3b8] italic !font-normal">[MOTHER'S NAME]</strong>
            }{" "}hence, we cannot issue, as requested, a true copy of his/her Certificate of Live Birth or transcription from the Register of Births.
          </p>
          <p className="text-justify mb-3 text-[13px] text-black leading-[1.75]">
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;We also certify that the records of Birth for the year <strong>{year}</strong> are still intact in the archives of this office.
          </p>
          <p className="text-justify mb-3 text-[13px] text-black leading-[1.75]">
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;This certification is issued to{" "}
            {requestorName
              ? <strong className="font-bold text-black">{requestorName.toUpperCase()}</strong>
              : <strong className="font-bold text-black !text-[#94a3b8] italic !font-normal">[REQUESTOR'S NAME]</strong>
            }{" "}upon his/her request.
          </p>
          <div className="mt-8 flex justify-end">
            <div className="text-center min-w-[200px] max-[640px]:min-w-[150px]">
              <div className="font-bold text-[13px] text-black">{officer.name}</div>
              <div className="italic text-[12.5px] text-black"><strong>{officer.title}</strong></div>
            </div>
          </div>
          <div className="mt-6">
            <div className="text-[13px] text-black mb-[14px]">Verified by:</div>
            <div className="block font-bold text-[13px] text-black text-center">{verified.name}</div>
            <div className="block italic text-[12.5px] text-black text-center"><strong>{verified.title}</strong></div>
          </div>
          <div className="mt-7">
            <div className="flex items-end gap-1 mb-[6px] text-[13px] text-black">
              <span className="min-w-[90px] flex-shrink-0">Amount Paid</span>
              <span className="flex-shrink-0 mr-1">:</span>
              <span className="flex-1 text-[13px] text-black">{OFFICE_CONFIG.amountPaid}</span>
            </div>
            <div className="flex items-end gap-1 mb-[6px] text-[13px] text-black">
              <span className="min-w-[90px] flex-shrink-0">O.R. Number</span>
              <span className="flex-shrink-0 mr-1">:</span>
              <input
                id="or-number"
                name="orNumber"
                type="text"
                aria-label="O.R. Number"
                className="flex-1 min-w-[100pt] text-[13px] text-[#1a3c6e] font-bold px-1 border-0 border-b border-[#94a3b8] bg-transparent outline-none [font:inherit]"
                value={orNumber || ""}
                onChange={(e) => onOrNumberChange && onOrNumberChange(e.target.value)}
                placeholder="Enter O.R. Number"
              />
            </div>
            <div className="flex items-end gap-1 mb-[6px] text-[13px] text-black">
              <span className="min-w-[90px] flex-shrink-0">Date Paid</span>
              <span className="flex-shrink-0 mr-1">:</span>
              <span className="flex-1 text-[13px] text-black">{todayDate}</span>
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-start gap-[7px] px-3 py-2 bg-[rgba(217,119,6,0.06)] border-t border-[rgba(217,119,6,0.18)] text-[11px] text-[#92400e] leading-[1.55]">
        <span className="flex-shrink-0 flex items-center mt-px"><IconInfo /></span>
        <span>Preview reflects the data you entered. Enter the O.R. Number, then click "Print Certificate" to print the completed document.</span>
      </div>
    </div>
  );
};

const UploadModal = ({ onClose, onUploadSuccess, allRecords, showNotif }) => {
  const [stage, setStage] = useState("upload");
  const [queue, setQueue] = useState([]);
  const [uploadedRecords, setUploadedRecords] = useState([]);
  const [matches, setMatches] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileRef = useRef(null);

  const slotsLeft = MAX_UPLOAD - queue.length;
  const limitReached = queue.length >= MAX_UPLOAD;

  const getLimitClass = () => {
    if (limitReached) return "bg-[var(--red-lt)] text-[var(--red)] border border-[var(--red-bd)]";
    if (queue.length >= MAX_UPLOAD - 1) return "bg-[var(--amber-lt)] text-[var(--amber)] border border-[rgba(217,119,6,0.30)]";
    return "bg-[var(--green-lt)] text-[var(--green)] border border-[var(--green-bd)]";
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
      const uploadedLastNames = uploaded.map((r) => (r.child_last_name || "").trim().toUpperCase()).filter(Boolean);
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
    <div className="fixed inset-0 bg-[rgba(15,23,42,0.45)] [backdrop-filter:blur(4px)] z-[9998] flex items-center justify-center p-4 max-[480px]:items-end max-[480px]:p-0" style={{ animation: "fadeIn 0.15s ease" }} onClick={onClose}>
      <div className="bg-white rounded-[14px] w-full max-w-[500px] max-h-[90vh] flex flex-col overflow-hidden shadow-[var(--shadow-lg)] border border-[var(--border-strong)] max-[640px]:max-w-full max-[480px]:rounded-t-[14px] max-[480px]:rounded-b-none max-[480px]:fixed max-[480px]:bottom-0 max-[480px]:left-0 max-[480px]:right-0 max-[480px]:max-h-[92vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-[9px] px-[13px] py-[11px] bg-[var(--surf-2)] text-[var(--txt)] flex-shrink-0 border-b border-[var(--border)]">
          <div className="w-7 h-7 bg-[var(--blue-lt)] rounded-[6px] flex items-center justify-center flex-shrink-0 border border-[var(--blue-bd)] text-[var(--blue)]"><IconUpload /></div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-bold text-[var(--txt)]">Upload Birth Record PDFs</div>
            <div className="text-[10px] text-[var(--txt3)] mt-px">
              {stage === "upload"
                ? `Select up to ${MAX_UPLOAD} PDF files to upload`
                : `${uploadedRecords.length} file${uploadedRecords.length > 1 ? "s" : ""} uploaded successfully`}
            </div>
          </div>
          <button className="w-[26px] h-[26px] border border-[var(--border-strong)] !bg-white rounded-[5px] cursor-pointer flex items-center justify-center text-xs text-[var(--txt2)] flex-shrink-0 ml-auto touch-manipulation transition-all duration-150 hover:!bg-[var(--red-lt)] hover:border-[var(--red-bd)] hover:!text-[var(--red)]" onClick={onClose}>&#10005;</button>
        </div>

        {stage === "upload" && (
          <div className="flex-1 overflow-y-auto p-[14px] flex flex-col gap-[10px] [-webkit-overflow-scrolling:touch] bg-white">
            <div className="flex items-center justify-between gap-[7px] flex-wrap">
              <span className={`inline-flex items-center gap-1 px-2 py-[3px] rounded-[20px] text-[10.5px] font-bold ${getLimitClass()}`}>
                {queue.length} / {MAX_UPLOAD} files
              </span>
              {limitReached && <span className="text-[11px] text-[var(--red)] font-semibold">Maximum limit reached</span>}
            </div>
            <div
              className={`border-2 border-dashed border-[var(--blue-bd)] rounded-[9px] bg-[var(--blue-lt)] py-5 px-[14px] flex flex-col items-center gap-[7px] cursor-pointer text-center transition-all duration-150 touch-manipulation hover:border-[var(--blue)] hover:bg-[var(--blue-md)]${limitReached ? " opacity-45 !cursor-not-allowed pointer-events-none" : ""}`}
              onClick={() => !isUploading && !limitReached && fileRef.current?.click()}
            >
              <input
                id="birth-upload-file-input"
                name="birthUploadFile"
                ref={fileRef}
                type="file"
                accept="application/pdf"
                multiple
                onChange={handleFileChange}
                className="hidden"
              />
              {isUploading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-[var(--blue-md)] border-t-[var(--blue)] rounded-full animate-spin flex-shrink-0" />
                  <span className="text-[12.5px] text-[var(--blue)]">Uploading…</span>
                </div>
              ) : limitReached ? (
                <>
                  <div className="text-[26px] opacity-20">&#128683;</div>
                  <div className="text-[13px] font-bold text-[var(--txt)]">Upload limit reached</div>
                  <div className="text-[11.5px] text-[var(--txt2)] leading-[1.5]">Remove a file to add another</div>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-center text-[var(--txt3)] opacity-40"><IconDocumentLg /></div>
                  <div className="text-[13px] font-bold text-[var(--txt)]">Click to select PDF files</div>
                  <div className="text-[11.5px] text-[var(--txt2)] leading-[1.5]">
                    PDF only · Max {MAX_UPLOAD} files · Max 20 MB each
                    {slotsLeft < MAX_UPLOAD ? ` · ${slotsLeft} slot${slotsLeft !== 1 ? "s" : ""} remaining` : ""}
                  </div>
                </>
              )}
            </div>
            {queue.length > 0 && (
              <div className="border border-[var(--border-strong)] rounded-[7px] overflow-hidden">
                <div className="flex items-center justify-between px-[10px] py-[6px] bg-[var(--surf-2)] border-b border-[var(--border)] text-[11px] font-bold text-[var(--blue)] gap-[7px]">
                  <span>Upload Queue ({queue.length})</span>
                  {!isUploading && (
                    <button className="bg-transparent border-0 text-[11px] text-[var(--red)] font-bold cursor-pointer" onClick={() => setQueue([])}>Clear All</button>
                  )}
                </div>
                {queue.map((item) => (
                  <div key={item.id} className="flex items-center gap-[7px] px-[10px] py-[7px] border-b border-[var(--border-lt)] bg-white last:border-b-0">
                    <span className="flex-shrink-0 flex items-center opacity-50 text-[var(--txt3)]"><FileIconSm /></span>
                    <span className="flex-1 text-xs font-semibold text-[var(--txt)] overflow-hidden text-ellipsis whitespace-nowrap min-w-0" title={item.file.name}>{ensurePdfName(item.file.name)}</span>
                    <span className={`text-[10.5px] font-bold px-[7px] py-[2px] rounded-[10px] whitespace-nowrap flex-shrink-0 ${
                      item.status === "pending" ? "bg-[var(--amber-lt)] text-[var(--amber)] border border-[rgba(217,119,6,0.30)]" :
                      item.status === "uploading" ? "bg-[var(--blue-lt)] text-[var(--blue)] border border-[var(--blue-bd)]" :
                      item.status === "done" ? "bg-[var(--green-lt)] text-[var(--green)] border border-[var(--green-bd)]" :
                      "bg-[var(--red-lt)] text-[var(--red)] border border-[var(--red-bd)]"
                    }`}>
                      {item.status === "pending" && "Pending"}
                      {item.status === "uploading" && "Uploading…"}
                      {item.status === "done" && "Done"}
                      {item.status === "error" && `Error: ${item.error || "Unknown"}`}
                    </span>
                    {!isUploading && item.status !== "done" && (
                      <button className="bg-transparent border-0 cursor-pointer text-xs text-[var(--red)] px-[3px] py-[2px] rounded-[3px] transition-colors duration-150 flex-shrink-0 touch-manipulation hover:text-[#b91c1c] hover:bg-[var(--red-lt)]" onClick={() => removeFromQueue(item.id)} title="Remove">
                        &#10005;
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end items-center gap-[7px] pt-[6px] flex-wrap">
              <button className={BTN_SECONDARY} onClick={onClose} disabled={isUploading}>Cancel</button>
              <button
                className={BTN_PRIMARY}
                onClick={handleUploadAll}
                disabled={isUploading || queue.length === 0 || queue.every((q) => q.status === "done")}
              >
                {isUploading
                  ? <><div className="w-[13px] h-[13px] border-2 border-white/25 border-t-white rounded-full animate-spin flex-shrink-0" />&nbsp;Uploading…</>
                  : `Upload ${queue.filter((q) => q.status === "pending").length} File${queue.filter((q) => q.status === "pending").length !== 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
        )}

        {stage === "results" && (
          <div className="flex-1 overflow-y-auto p-[14px] flex flex-col gap-[10px] [-webkit-overflow-scrolling:touch] bg-white">
            <div className="flex items-start gap-[9px] bg-[var(--green-lt)] border border-[var(--green-bd)] rounded-[7px] px-3 py-[10px]">
              <div className="text-xl flex-shrink-0 flex items-center text-[var(--green)]"><IconCheck /></div>
              <div>
                <div className="text-[12.5px] font-bold text-[#065f46]">
                  {uploadedRecords.length} file{uploadedRecords.length > 1 ? "s" : ""} uploaded successfully
                </div>
                <div className="text-[11px] text-[#047857] mt-[2px] break-all">
                  {uploadedRecords.map((r) => getRecordDisplayName(r)).join(", ")}
                </div>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between px-[10px] py-[6px] bg-[var(--surf-2)] border border-[var(--border-strong)] rounded-t-[7px]">
                <span className="text-[11px] font-bold text-[var(--blue)]">Matching surname records: {matches.length}</span>
              </div>
              {matches.length === 0 ? (
                <div className="p-[10px] border border-[var(--border-lt)] text-xs text-[var(--txt3)] text-center bg-white">No other records share the same surname.</div>
              ) : matches.map((r, i) => {
                const isNew = uploadedRecords.some((u) => normalizeFileKey(u.file_name) === normalizeFileKey(r.file_name));
                return (
                  <div key={r.id || i} className={`flex items-center justify-between px-[10px] py-[6px] border border-t-0 border-[var(--border-lt)] bg-white flex-wrap gap-[5px]${isNew ? " !bg-[rgba(217,119,6,0.04)] border-l-[3px] border-l-[var(--amber)]" : ""}`}>
                    <div className="flex items-center gap-[6px] flex-wrap">
                      <span className="flex-shrink-0 flex items-center opacity-50 text-[var(--txt3)]"><FileIconSm /></span>
                      <span className="text-[12.5px] font-semibold text-[var(--txt)] break-words">{getRecordDisplayName(r)}</span>
                      {isNew && <span className="bg-[rgba(217,119,6,0.10)] text-[var(--amber)] text-[9.5px] font-bold px-[6px] py-px rounded-[20px] border border-[rgba(217,119,6,0.28)]">Just Uploaded</span>}
                    </div>
                    <span className="text-[11px] text-[var(--txt3)] whitespace-nowrap">{formatDate(r.uploaded_at || new Date())}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-end items-center gap-[7px] pt-[6px] flex-wrap">
              <button className={BTN_PRIMARY} onClick={onClose}>Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const InlinePdfViewer = ({ pdfData, record, onPrint, loadingPdf, showNotif }) => {
  const displayName = record ? getRecordDisplayName(record) : "";
  const [pdfUrl, setPdfUrl] = useState("");
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (!pdfData) { setPdfUrl(""); return; }
    const url = getPdfBlobUrl(pdfData);
    setPdfUrl(url);
    if (!url) {
      showNotif?.("This PDF could not be displayed — the stored file appears to be corrupted.", "error");
    }
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
    <div className="flex items-center justify-center gap-[10px] py-11 px-[18px] border border-[1.5px] border-dashed border-[var(--blue-bd)] rounded-[9px] bg-[var(--blue-lt)] text-[12.5px] text-[var(--blue)] font-semibold">
      <div className="w-4 h-4 border-2 border-[var(--blue-md)] border-t-[var(--blue)] rounded-full animate-spin flex-shrink-0" /><span>Loading document…</span>
    </div>
  );

  if (!pdfUrl) return (
    <div className="flex flex-col items-center justify-center gap-[7px] py-11 px-[18px] border border-[1.5px] border-dashed border-[var(--border-strong)] rounded-[9px] bg-[var(--surf-2)] text-center">
      <span className="flex items-center justify-center text-[var(--txt3)]"><IconDocumentLg /></span>
      <div className="text-[13px] font-bold text-[var(--txt2)]">No document to display</div>
      <div className="text-[11.5px] text-[var(--txt3)] max-w-[260px] leading-[1.6]">Select a record to preview it here.</div>
    </div>
  );

  return (
    <div className="flex flex-col border border-[1.5px] border-[var(--blue-bd)] rounded-[9px] overflow-hidden shadow-[var(--shadow-sm)]">
      <div className="flex items-center justify-between px-3 py-2 bg-[var(--surf-2)] gap-2 flex-shrink-0 flex-wrap border-b border-[var(--border)]">
        <div className="flex items-center gap-[7px] min-w-0 flex-1">
          <span className="flex items-center flex-shrink-0 text-[var(--txt3)]"><IconDocument /></span>
          <span className="text-[12.5px] font-semibold text-[var(--txt)] whitespace-nowrap overflow-hidden text-ellipsis max-w-[min(280px,38vw)]">{displayName}</span>
          <span className="inline-flex items-center px-[7px] py-[2px] rounded-[20px] bg-[rgba(0,0,0,0.05)] border border-[var(--border-strong)] text-[9.5px] font-bold text-[var(--txt2)] whitespace-nowrap tracking-[0.3px] flex-shrink-0">Live Birth Certificate</span>
        </div>
        <button className="inline-flex items-center gap-[5px] px-3 py-[6px] rounded-[7px] border-0 !bg-[#2563eb] !text-white text-xs font-bold cursor-pointer [font-family:var(--f)] whitespace-nowrap flex-shrink-0 transition-all duration-150 shadow-[0_2px_8px_rgba(37,99,235,0.25)] touch-manipulation disabled:opacity-60 disabled:cursor-not-allowed hover:enabled:!bg-[#1d4ed8] hover:enabled:-translate-y-px" onClick={handlePrint} disabled={printing}>
          <span className="flex items-center flex-shrink-0"><IconPrint /></span>
          {printing ? "Printing…" : "Print"}
        </button>
      </div>
      <div className="h-[calc(100vh-var(--home-topbar-height)-52px-200px)] min-h-[280px] bg-[var(--bg)] overflow-hidden max-[768px]:h-[46vh] max-[768px]:min-h-[260px] max-[640px]:h-[42vh] max-[640px]:min-h-[220px] max-[480px]:h-[38vh] max-[480px]:min-h-[185px]">
        <iframe key={pdfUrl} src={`${pdfUrl}#toolbar=1&navpanes=0`} title={displayName} className="w-full h-full border-0 block" />
      </div>
    </div>
  );
};

const MobileRecordCardArchive = ({ record, index, onView, onDelete }) => {
  const displayName = getRecordDisplayName(record);
  const father = getFatherDisplayName(record);
  const mother = getMotherDisplayName(record);
  return (
    <div className="px-4 py-[14px] border-b border-[var(--border-lt)] flex flex-col gap-2 bg-white transition-colors duration-150 last:border-b-0 hover:bg-[var(--surf-2)]">
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-[var(--txt3)] font-bold bg-[var(--surf-2)] px-[6px] py-[2px] rounded-[4px] flex-shrink-0 leading-[1.4]">#{index + 1}</span>
        <span className="text-[13.5px] font-bold text-[var(--txt)] flex-1 min-w-0 break-words leading-[1.4]">{displayName}</span>
      </div>
      {(father || mother) && (
        <div className="flex gap-[6px] flex-wrap [row-gap:6px]">
          {father && <span className="inline-flex items-center gap-[3px] text-[10.5px] font-semibold px-[7px] py-[2px] rounded-[10px] whitespace-nowrap bg-[#dbeafe] text-[#1d4ed8] border border-[rgba(37,99,235,0.22)]">{father}</span>}
          {mother && <span className="inline-flex items-center gap-[3px] text-[10.5px] font-semibold px-[7px] py-[2px] rounded-[10px] whitespace-nowrap bg-[#fce7f3] text-[#9d174d] border border-[rgba(219,39,119,0.22)]">{mother}</span>}
        </div>
      )}
      <div className="text-[11px] text-[var(--txt3)] font-medium leading-[1.4]">{formatDate(record.archived_at)}</div>
      <div className="flex items-center gap-2 flex-wrap pt-[2px]">
        <button className="inline-flex items-center gap-[3px] px-[14px] py-[6px] rounded-[6px] border-0 !text-white text-xs font-semibold cursor-pointer [font-family:var(--f)] transition-all duration-150 whitespace-nowrap touch-manipulation !bg-[#2563eb] hover:brightness-90 hover:-translate-y-px" onClick={onView}>View</button>
        <button className="inline-flex items-center gap-[3px] px-[14px] py-[6px] rounded-[6px] border-0 !text-white text-xs font-semibold cursor-pointer [font-family:var(--f)] transition-all duration-150 whitespace-nowrap touch-manipulation !bg-[#dc2626] hover:brightness-90 hover:-translate-y-px" onClick={onDelete}>Delete</button>
      </div>
    </div>
  );
};

export default function UnifiedBirthRegistry() {
  const [tab, setTab] = useState("transaction");
  const [confirmModal, setConfirmModal] = useState(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [pdfModal, setPdfModal] = useState(null);
  const [negCertModal, setNegCertModal] = useState(null);
  const [negCertInfo, setNegCertInfo] = useState({ fatherName: "", motherName: "", dateOfBirth: "", requestorName: "" });
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
  const [restoringId, setRestoringId] = useState(null);

  const [step2PdfData, setStep2PdfData] = useState(null);
  const [step2PdfLoading, setStep2PdfLoading] = useState(false);
  const [previewLoadingId, setPreviewLoadingId] = useState(null);

  const [allRecords, setAllRecords] = useState([]);
  const [allArchivedRecords, setAllArchivedRecords] = useState([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [archiveSearch, setArchiveSearch] = useState("");
  const [archiveUnlocked, setArchiveUnlocked] = useState(false);

  const { isMobile, isTablet } = useViewport();
  const useCards = isMobile || isTablet;

  const activeIdentityKeys = new Set(allRecords.map(getRecordIdentityKey));

  const allRecordsForSearch = [
    ...allRecords,
    ...allArchivedRecords
      .filter((r) => !activeIdentityKeys.has(getRecordIdentityKey(r)))
      .map((r) => ({ ...r, _isArchived: true })),
  ];
  const recordsAbortRef = useRef(null);
  const archivedAbortRef = useRef(null);

  const fetchRecords = useCallback(async () => {
    if (recordsAbortRef.current) recordsAbortRef.current.abort();
    const controller = new AbortController();
    recordsAbortRef.current = controller;

    setLoadingRecords(true);
    try {
      const res = await fetch(`${API}/records`, { signal: controller.signal });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setAllRecords(Array.isArray(data) ? data : []);
    } catch (err) {
      if (err?.name !== "AbortError") {
        showNotif("Failed to load records.", "error");
      }
    } finally {
      if (recordsAbortRef.current === controller) setLoadingRecords(false);
    }
  }, []);

  const fetchArchived = useCallback(async () => {

    if (archivedAbortRef.current) archivedAbortRef.current.abort();
    const controller = new AbortController();
    archivedAbortRef.current = controller;

    setLoadingRecords(true);
    try {
      const res = await fetch(`${API}/archived`, { signal: controller.signal });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const arr = Array.isArray(data) ? data : [];
      setAllArchivedRecords(arr);
    } catch (err) {
      if (err?.name !== "AbortError") {
        showNotif("Failed to load archived records.", "error");
      }
    } finally {
      if (archivedAbortRef.current === controller) setLoadingRecords(false);
    }
  }, []);

  useEffect(() => { fetchRecords(); fetchArchived(); }, [fetchRecords, fetchArchived]);

  const restoreRecord = useCallback(async (id) => {
    setRestoringId(id);
    try {
      const res = await fetch(`${API}/records/${id}/restore`, { method: "POST" });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Restore failed"); }
      await fetchRecords();
      await fetchArchived();
      return true;
    } catch (err) {
      showNotif(err.message || "Failed to restore record in the background.", "error");
      return false;
    } finally { setRestoringId(null); }
  }, [fetchRecords, fetchArchived]);

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

  const sortedResults = [...searchResults].sort((a, b) => {
    const aFN = getRecordFirstName(a); const bFN = getRecordFirstName(b);
    if (!a._isArchived && b._isArchived) return -1;
    if (a._isArchived && !b._isArchived) return 1;
    const aExact = searchFN && aFN === searchFN;
    const bExact = searchFN && bFN === searchFN;
    if (aExact && !bExact) return -1;
    if (!aExact && bExact) return 1;
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

  const handleNegCertModalSubmit = ({ dateOfBirth, fatherName, motherName, requestorName }) => {
    const nameTerm = negCertModal.nameTerm;
    setNegCertModal(null);
    setNegCertInfo({ dateOfBirth, fatherName, motherName, requestorName });
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
      const res = await fetch(`${API}/records/${id}`);
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
      const res = await fetch(`${API}/records/${record.id}`);
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
  const issuedDoc = isPositive
    ? "Certified True Copy of Birth Certificate (Actual)"
    : "Certificate of No Birth Record (Negative Certificate)";

  const handlePrintNegativeCert = () => {
    if (!orNumber.trim()) {
      showNotif("O.R. Number is required before printing the certificate.", "error");
      return;
    }
    printNegativeCertificate({
      subjectName,
      dateOfBirth: negCertInfo.dateOfBirth || null,
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
          first_name: selectedRecord?.child_first_name || srchFirstName.trim(),
          middle_name: selectedRecord?.child_middle_name || "",
          last_name: selectedRecord?.child_last_name || srchLastName.trim(),
        }),
      });

      let data = {};
      try { data = await res.json(); } catch { }

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
    setNegCertInfo({ fatherName: "", motherName: "", dateOfBirth: "", requestorName: "" });
    setOrNumber("");
    fetchRecords(); fetchArchived();
  };

  const handleViewPdf = async (id, record) => {
    try {
      const res = await fetch(`${API}/records/${id}`);
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

  return (
    <div className="flex flex-col [font-family:var(--f)] bg-[var(--bg)] antialiased w-full min-h-[calc(100vh-var(--home-topbar-height))] m-0 p-0 overflow-x-hidden text-[var(--txt)]">
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

      <div className="sticky top-0 z-[90] bg-white border-b border-[var(--border)] flex items-center justify-between px-4 flex-shrink-0 w-full min-h-[52px] gap-2 shadow-[0_1px_4px_rgba(0,0,0,0.06)] max-[768px]:px-[11px] max-[768px]:py-[7px] max-[480px]:min-h-[44px] max-[480px]:px-[9px] max-[480px]:py-[7px] max-[480px]:gap-[6px] print:hidden">
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-lg leading-none flex items-center text-[var(--blue)]"><IconGrid /></span>
          {!isMobile && <span className="[font-family:var(--fh)] text-[13px] font-bold text-[var(--txt)] whitespace-nowrap">Birth Registry</span>}
        </div>
        <div className="flex gap-[5px] items-center flex-nowrap max-[480px]:gap-[3px]">
          {[
            { key: "transaction", label: isMobile ? "Transaction" : "New Transaction" },
            { key: "archive", label: "Archive" },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-[13px] py-[6px] rounded-lg border border-transparent cursor-pointer text-xs font-semibold inline-flex items-center gap-[5px] [font-family:var(--f)] transition-all duration-150 leading-none whitespace-nowrap touch-manipulation flex-shrink-0 max-[480px]:px-[7px] max-[480px]:py-[5px] max-[480px]:text-[11px] max-[480px]:rounded-[7px] max-[480px]:gap-[3px] ${
                tab === t.key
                  ? "!bg-[#2563eb] !text-white !border-[#2563eb] shadow-[0_0_0_3px_rgba(37,99,235,0.15),0_2px_8px_rgba(37,99,235,0.25)] hover:!bg-[#1d4ed8] hover:-translate-y-px"
                  : "!bg-[rgba(37,99,235,0.07)] !text-[#2563eb] !border-[rgba(37,99,235,0.30)] hover:!bg-[rgba(37,99,235,0.14)] hover:!border-[#2563eb] hover:!text-[#1d4ed8] hover:-translate-y-px"
              }`}
            >
              <span className="leading-none max-[360px]:hidden">{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {tab === "transaction" && (
        <div className="w-full p-[14px] bg-[var(--bg)] max-[768px]:p-[9px] max-[480px]:p-[7px]">
          <div className="flex flex-col bg-transparent">
            <StepBar current={step} />
            <div className="pt-3 flex flex-col bg-transparent max-[900px]:pt-[9px] max-[768px]:pt-[7px] max-[480px]:pt-[5px]">
              <div className="bg-white rounded-[9px] border border-[var(--border)] shadow-[var(--shadow-sm)] flex flex-col">

                {step === "select" && (
                  <>
                    <div className="flex flex-col">
                      <div className="px-[18px] pt-4 pb-3 flex flex-col gap-[14px] max-[900px]:px-3 max-[900px]:pt-3 max-[900px]:pb-[9px] max-[768px]:px-[11px] max-[768px]:pt-[11px] max-[768px]:pb-[9px] max-[768px]:gap-[10px] max-[480px]:px-[9px] max-[480px]:pt-[9px] max-[480px]:pb-[7px] max-[480px]:gap-[9px]">
                        <div className="pb-[10px] border-b border-[var(--border)]">
                          <div className="[font-family:var(--fh)] text-[clamp(13px,3vw,15px)] font-extrabold text-[var(--txt)] mb-[3px] tracking-[-0.3px]">Search &amp; Select Birth Record</div>
                        </div>
                        <div className="bg-[var(--blue-lt)] border border-[1.5px] border-[var(--blue-bd)] rounded-[9px] px-[14px] py-3 max-[480px]:p-[10px]">
                          <div className="flex gap-2 items-end flex-wrap max-[480px]:flex-col max-[480px]:gap-[7px]">
                            <div className="flex flex-col gap-1 flex-1 min-w-[130px] max-[480px]:min-w-0 max-[480px]:w-full">
                              <label className="text-[10px] font-bold uppercase tracking-[0.5px] text-[var(--txt3)]" htmlFor="search-last-name">Last Name</label>
                              <input
                                id="search-last-name"
                                name="lastName"
                                className={`h-9 px-[11px] border border-[1.5px] border-[var(--border-strong)] rounded-[7px] text-[13px] [font-family:var(--f)] text-[var(--txt)] bg-white outline-none w-full transition-[border-color,box-shadow] duration-150 [-webkit-appearance:none] focus:border-[var(--blue)] focus:shadow-[0_0_0_3px_rgba(37,99,235,0.12)] max-[480px]:h-10 max-[480px]:text-base${lastNameError ? " !border-[var(--red)] !shadow-[0_0_0_3px_rgba(220,38,38,0.10)]" : ""}`}
                                type="text"
                                value={srchLastName}
                                onChange={(e) => { setSrchLastName(e.target.value); setHasSearched(false); if (e.target.value.trim()) setLastNameError(""); }}
                                onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
                                placeholder="e.g. Dela Cruz"
                                autoFocus
                              />
                              {lastNameError && <span className="text-[10.5px] font-semibold text-[var(--red)] flex items-center gap-[3px] mt-[2px]">&#9888; {lastNameError}</span>}
                            </div>
                            <div className="flex flex-col gap-1 flex-1 min-w-[130px] max-[480px]:min-w-0 max-[480px]:w-full">
                              <label className="text-[10px] font-bold uppercase tracking-[0.5px] text-[var(--txt3)]" htmlFor="search-first-name">First Name</label>
                              <input
                                id="search-first-name"
                                name="firstName"
                                className={`h-9 px-[11px] border border-[1.5px] border-[var(--border-strong)] rounded-[7px] text-[13px] [font-family:var(--f)] text-[var(--txt)] bg-white outline-none w-full transition-[border-color,box-shadow] duration-150 [-webkit-appearance:none] focus:border-[var(--blue)] focus:shadow-[0_0_0_3px_rgba(37,99,235,0.12)] max-[480px]:h-10 max-[480px]:text-base${firstNameError ? " !border-[var(--red)] !shadow-[0_0_0_3px_rgba(220,38,38,0.10)]" : ""}`}
                                type="text"
                                value={srchFirstName}
                                onChange={(e) => { setSrchFirstName(e.target.value); setHasSearched(false); if (e.target.value.trim()) setFirstNameError(""); }}
                                onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
                                placeholder="e.g. Juan"
                              />
                              {firstNameError && <span className="text-[10.5px] font-semibold text-[var(--red)] flex items-center gap-[3px] mt-[2px]">&#9888; {firstNameError}</span>}
                            </div>
                            <button className="h-9 px-[18px] border-0 rounded-full !bg-[#2563eb] !text-white text-[12.5px] font-bold cursor-pointer [font-family:var(--f)] whitespace-nowrap flex-shrink-0 inline-flex items-center justify-center transition-all duration-150 touch-manipulation self-end shadow-[0_2px_8px_rgba(37,99,235,0.25)] hover:enabled:!bg-[#1d4ed8] hover:enabled:-translate-y-px max-[480px]:w-full max-[480px]:justify-center max-[480px]:h-10 max-[480px]:text-[13px]" onClick={handleSearch}>Search</button>
                          </div>
                        </div>

                        {hasSearched && (
                          <div className="border border-[var(--border-strong)] rounded-[9px] overflow-hidden bg-white">
                            <div className="flex items-center justify-between px-3 py-[7px] bg-[var(--surf-2)] border-b border-[var(--border)] flex-wrap gap-[5px]">
                              <div className="flex flex-col gap-px">
                                <div className="text-[11px] text-[var(--txt3)] font-medium">
                                  {sortedResults.length} record{sortedResults.length !== 1 ? "s" : ""} found
                                  {sortedResults.filter((r) => r._isArchived).length > 0 && (
                                    <span className="text-[var(--amber)] font-bold">
                                      &nbsp;&middot;&nbsp;{sortedResults.filter((r) => r._isArchived).length} from archive
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {sortedResults.length === 0 ? (
                              <div className="py-7 px-4 text-center flex flex-col items-center gap-2">
                                <p className="text-[14px] font-bold text-[var(--txt)] m-0">No records found for "{searchLN}"</p>
                                <button className="px-[14px] py-[7px] rounded-full border border-[1.5px] border-[rgba(217,119,6,0.35)] !bg-[#d97706] !text-white text-xs font-bold cursor-pointer [font-family:var(--f)] inline-flex items-center justify-center flex-shrink-0 transition-all duration-150 touch-manipulation hover:!bg-[#b45309]" onClick={openNegCertModal}>
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

                                  return (
                                    <div
                                      key={`${r._isArchived ? "arc" : "act"}-${r.id}`}
                                      className={[
                                        "flex items-center px-[14px] py-[11px] gap-[10px] border-b border-[var(--border-lt)] bg-white transition-colors duration-150 flex-wrap last:border-b-0 hover:bg-[var(--surf-2)] max-[640px]:px-[11px] max-[640px]:py-[9px] max-[640px]:gap-2",
                                        isSelected ? "!bg-[rgba(37,99,235,0.05)] border-l-[3px] border-l-[var(--blue)] hover:!bg-[rgba(37,99,235,0.08)]" : "",
                                        r._isArchived ? "opacity-80" : "",
                                      ].filter(Boolean).join(" ")}
                                    >
                                      <div className="flex-1 min-w-0 flex flex-col gap-[5px]">
                                        <div className="flex items-center gap-[6px] flex-wrap leading-[1.3]">
                                          <span className="text-[13.5px] font-bold text-[var(--txt)] tracking-[-0.15px]">{display}</span>
                                          {r._isArchived && <span className="text-[9px] font-bold px-[7px] py-px rounded-[20px] bg-[var(--amber-lt)] text-[var(--amber)] border border-[rgba(217,119,6,0.30)] tracking-[0.2px] flex-shrink-0">Archived</span>}
                                        </div>
                                        <div className="flex gap-[5px] flex-wrap items-center">
                                          {father && <span className="inline-flex items-center text-[11px] font-semibold px-[10px] py-[3px] rounded-[20px] whitespace-nowrap tracking-[0.1px] bg-[#dbeafe] text-[#1d4ed8] border border-[rgba(37,99,235,0.25)]">{father}</span>}
                                          {mother && <span className="inline-flex items-center text-[11px] font-semibold px-[10px] py-[3px] rounded-[20px] whitespace-nowrap tracking-[0.1px] bg-[#fce7f3] text-[#9d174d] border border-[rgba(219,39,119,0.25)]">{mother}</span>}
                                          {!father && !mother && (
                                            <span className="text-[11px] text-[var(--txt3)]">No parent info recorded</span>
                                          )}
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-[5px] flex-shrink-0 max-[640px]:w-full max-[640px]:justify-start">
                                        <button
                                          className="inline-flex items-center justify-center align-middle gap-1 min-w-[80px] px-3 py-[5px] rounded-full border border-[1.5px] border-[#2563eb] !bg-[#2563eb] !text-white text-[11.5px] font-bold cursor-pointer [font-family:var(--f)] whitespace-nowrap transition-all duration-150 leading-none touch-manipulation flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0 hover:enabled:!bg-[#1d4ed8] hover:enabled:border-[#1d4ed8] hover:enabled:-translate-y-px hover:enabled:shadow-[0_3px_10px_rgba(37,99,235,0.25)]"
                                          onClick={() => handlePreviewPdf(r.id, r)}
                                          disabled={isLoadingPrev}
                                          title="View Live Birth PDF"
                                        >
                                          {isLoadingPrev
                                            ? <><div className="w-[13px] h-[13px] border-2 border-white/25 border-t-white rounded-full animate-spin flex-shrink-0" />&nbsp;Loading…</>
                                            : "View"}
                                        </button>
                                        <button
                                          className={`min-w-[80px] px-3 py-[5px] rounded-full border border-[1.5px] !text-white text-[11.5px] font-bold [font-family:var(--f)] whitespace-nowrap inline-flex items-center justify-center flex-shrink-0 transition-all duration-150 touch-manipulation ${
                                            isSelected
                                              ? "!bg-[#047857] border-[#047857] cursor-default"
                                              : "!bg-[#059669] border-[#059669] cursor-pointer hover:!bg-[#047857] hover:border-[#047857]"
                                          }`}
                                          onClick={() => !isSelected && handleSelectFromSearch(r)}
                                        >
                                          {isSelected ? "Selected" : "Select →"}
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                                <div className="flex items-center justify-center gap-2 px-[14px] py-[9px] bg-[var(--surf-2)] border-t border-[var(--border-lt)] flex-wrap">
                                  <span className="text-[11.5px] text-[var(--txt3)]">Not the right person?</span>
                                  <button className="px-[10px] py-1 rounded-full border border-[1.5px] border-[rgba(217,119,6,0.35)] !bg-[#d97706] !text-white text-[11px] font-bold cursor-pointer [font-family:var(--f)] inline-flex items-center justify-center flex-shrink-0 transition-all duration-150 touch-manipulation hover:!bg-[#b45309]" onClick={openNegCertModal}>
                                    Issue Negative Certificate
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-[7px] px-4 py-[10px] border-t border-[var(--border)] bg-[var(--surf-2)] justify-end items-center flex-shrink-0 flex-nowrap rounded-b-[9px] max-[768px]:px-[11px] max-[768px]:py-[7px] max-[768px]:gap-[5px] max-[480px]:px-[9px] max-[480px]:gap-2">
                      <button
                        className={`${BTN_PRIMARY} flex-shrink-0 !w-auto whitespace-nowrap`}
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
                    <div className="flex flex-col">
                      <div className="px-[14px] pt-4 pb-3 flex flex-col gap-[14px] max-[900px]:px-3 max-[900px]:pt-3 max-[900px]:pb-[9px] max-[768px]:px-[9px] max-[768px]:pt-[11px] max-[768px]:pb-[9px] max-[768px]:gap-[10px] max-[480px]:px-[9px] max-[480px]:pt-[9px] max-[480px]:pb-[7px] max-[480px]:gap-[9px]">
                        <div className="pb-[10px] border-b border-[var(--border)]">
                          <div className="[font-family:var(--fh)] text-[clamp(13px,3vw,15px)] font-extrabold text-[var(--txt)] mb-[3px] tracking-[-0.3px]">Review &amp; Print Document</div>
                          <p className="text-[clamp(11px,2vw,12px)] text-[var(--txt2)] m-0 leading-[1.6]">
                            {isPositive
                              ? "Review the Live Birth Certificate below. Print the selected PDF before proceeding to release."
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
                            dateOfBirth={negCertInfo.dateOfBirth}
                            requestorName={negCertInfo.requestorName}
                            orNumber={orNumber}
                            onOrNumberChange={setOrNumber}
                            onPrint={handlePrintNegativeCert}
                          />
                        )}
                      </div>
                    </div>
                    <div className="flex gap-[7px] px-4 py-[10px] border-t border-[var(--border)] bg-[var(--surf-2)] justify-end items-center flex-shrink-0 flex-nowrap rounded-b-[9px] max-[768px]:px-[11px] max-[768px]:py-[7px] max-[768px]:gap-[5px] max-[480px]:px-[9px] max-[480px]:gap-2">
                      <button className={`${BTN_SECONDARY} flex-shrink-0 !w-auto whitespace-nowrap`} onClick={() => setStep("select")}>← Back</button>
                      <button className={`${BTN_PRIMARY} flex-shrink-0 !w-auto whitespace-nowrap`} onClick={handleConfirmPayment}>
                        Proceed to Release →
                      </button>
                    </div>
                  </>
                )}

                {step === "releasing" && (
                  <>
                    <div className="flex flex-col">
                      <div className="px-[9px] pt-[9px] pb-[7px] flex flex-col gap-[9px] items-center max-[768px]:px-[11px] max-[768px]:pt-[11px] max-[768px]:pb-[9px] max-[900px]:px-3 max-[900px]:pt-3 max-[900px]:pb-[9px]">
                        <div className="flex flex-col items-center justify-center gap-[14px] py-9 px-5 text-center w-full max-[640px]:gap-[11px] max-[640px]:py-7 max-[640px]:px-[14px]" style={{ animation: "releaseIn 0.45s cubic-bezier(0.34,1.56,0.64,1) both" }}>
                          <div className="release-ring relative w-[86px] h-[86px] flex items-center justify-center max-[640px]:w-[74px] max-[640px]:h-[74px]">
                            <div className="w-[86px] h-[86px] rounded-full flex items-center justify-center shadow-[0_8px_32px_rgba(5,150,105,0.30),0_2px_8px_rgba(5,150,105,0.18),inset_0_1px_0_rgba(255,255,255,0.20)] max-[640px]:w-[74px] max-[640px]:h-[74px]" style={{ background: "linear-gradient(135deg,#059669 0%,#047857 60%,#065f46 100%)" }}>
                              <span className="text-[34px] text-white leading-none font-black max-[640px]:text-[28px]">&#10003;</span>
                            </div>
                          </div>
                          <div className="[font-family:var(--fh)] text-[clamp(32px,7vw,48px)] font-extrabold leading-none tracking-[-2px] bg-clip-text text-transparent" style={{ backgroundImage: "linear-gradient(135deg,var(--green),#34d399)" }}>100%</div>
                          <div className="[font-family:var(--fh)] text-[clamp(16px,3.5vw,20px)] font-extrabold text-[var(--txt)] tracking-[-0.4px] m-0">Request Complete</div>
                          <div className="text-[13px] text-[var(--txt2)] max-w-[280px] leading-[1.65] m-0">
                            The document is ready for release to the requester.
                          </div>
                          <div className="inline-flex items-center gap-[7px] px-[18px] py-[7px] rounded-[40px] bg-[var(--green-lt)] border border-[1.5px] border-[var(--green-bd)] text-[12.5px] font-bold text-[#065f46] [font-family:var(--fh)] shadow-[0_2px_12px_rgba(5,150,105,0.12)]">
                            <span className="w-2 h-2 rounded-full bg-[var(--green)] flex-shrink-0" style={{ animation: "dotBlink 1.4s ease-in-out infinite" }} />
                            Ready for Release
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-[7px] px-4 py-[10px] border-t border-[var(--border)] bg-[var(--surf-2)] justify-end items-center flex-shrink-0 flex-nowrap rounded-b-[9px] max-[768px]:px-[11px] max-[768px]:py-[7px] max-[768px]:gap-[5px] max-[480px]:px-[9px] max-[480px]:gap-2">
                      <button
                        className={`${BTN_SECONDARY} flex-shrink-0 !w-auto whitespace-nowrap`}
                        onClick={() => setStep("payment")}
                        disabled={processing}
                      >
                        ← Back
                      </button>
                      <button
                        className={`${BTN_PRIMARY} flex-shrink-0 !w-auto whitespace-nowrap min-w-[130px] max-[480px]:min-w-[145px]`}
                        onClick={async () => {
                          const saved = await handleCompleteTransaction();
                          if (saved) resetTransaction();
                        }}
                        disabled={processing}
                      >
                        {processing
                          ? <><div className="w-[13px] h-[13px] border-2 border-white/25 border-t-white rounded-full animate-spin flex-shrink-0" />&nbsp;Saving…</>
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
        <div className="w-full px-4 pb-4 bg-[var(--bg)] flex flex-col max-[768px]:px-[11px] max-[768px]:pb-[11px] max-[480px]:px-[9px] max-[480px]:pb-[9px]">
          {!archiveUnlocked ? (
            <>
              <div className="sticky top-[52px] z-[80] bg-white border border-[var(--border-strong)] rounded-t-[9px] px-[14px] py-[10px] flex items-center gap-2 flex-wrap w-full min-h-[56px] shadow-[0_1px_4px_rgba(0,0,0,0.05)] max-[768px]:static max-[768px]:px-[11px] max-[768px]:py-[9px] max-[768px]:min-h-0 max-[768px]:flex-wrap max-[768px]:gap-[7px]">
                <div className="w-7 h-7 bg-[var(--blue-lt)] border border-[1.5px] border-[var(--blue-bd)] rounded-full flex items-center justify-center flex-shrink-0 text-[var(--blue)] max-[480px]:hidden"><IconArchive /></div>
                <div>
                  <h2 className="text-[clamp(12px,2.5vw,13px)] font-bold text-[var(--txt)] m-0">Archived Birth Records</h2>
                  <p className="text-[11px] text-[var(--txt2)] mt-px mb-0">Upload, view, or permanently delete archived records.</p>
                </div>
              </div>
              <div className="bg-white rounded-b-[9px] border border-t-0 border-[var(--border-strong)] shadow-[var(--shadow-sm)] w-full overflow-hidden">
                <PasswordGate
                  module="archive_birth"
                  description="The Archive section is restricted to authorized personnel. Enter the administrator password to upload, view, or delete records."
                  onUnlock={() => setArchiveUnlocked(true)}
                  showNotif={showNotif}
                />
              </div>
            </>
          ) : (
            <>
              <div className="sticky top-[52px] z-[80] bg-white border border-[var(--border-strong)] rounded-t-[9px] px-[14px] py-[10px] flex items-center gap-2 flex-wrap w-full min-h-[56px] shadow-[0_1px_4px_rgba(0,0,0,0.05)] max-[768px]:static max-[768px]:px-[11px] max-[768px]:py-[9px] max-[768px]:min-h-0 max-[768px]:flex-wrap max-[768px]:gap-[7px]">
                <div className="w-7 h-7 bg-[var(--blue-lt)] border border-[1.5px] border-[var(--blue-bd)] rounded-full flex items-center justify-center flex-shrink-0 text-[var(--blue)] max-[480px]:hidden"><IconArchive /></div>
                <div>
                  <h2 className="text-[clamp(12px,2.5vw,13px)] font-bold text-[var(--txt)] m-0">Archived Records</h2>
                  {!isMobile && <p className="text-[11px] text-[var(--txt2)] mt-px mb-0">Upload new records, or view and permanently delete archived records.</p>}
                </div>
                <div className="flex-1 min-w-0 max-[768px]:hidden" />
                <button className="inline-flex items-center gap-1 !bg-[#2563eb] !text-white px-[11px] py-[5px] rounded-[7px] cursor-pointer text-xs font-semibold [font-family:var(--f)] border-0 flex-shrink-0 shadow-[0_2px_8px_rgba(37,99,235,0.22)] transition-all duration-150 whitespace-nowrap touch-manipulation hover:!bg-[#1d4ed8] hover:-translate-y-px max-[768px]:ml-auto max-[480px]:text-[11.5px] max-[480px]:px-[9px] max-[480px]:py-1" onClick={() => setShowUploadModal(true)}>
                  <IconUpload />
                  {isMobile ? "Upload" : "Upload PDF"}
                </button>
                <div className="relative w-[210px] flex-shrink-0 min-w-0 max-[900px]:w-[180px] max-[768px]:w-full">
                  <span className="absolute left-[7px] top-1/2 -translate-y-1/2 text-[11px] opacity-35 pointer-events-none flex items-center text-[var(--txt)]"><IconSearch /></span>
                  <input
                    id="archive-search"
                    name="archiveSearch"
                    aria-label="Search archived records"
                    value={archiveSearch}
                    onChange={(e) => setArchiveSearch(e.target.value)}
                    placeholder="Search archived…"
                    className="w-full py-[5px] pl-[26px] pr-[9px] text-[12.5px] border border-[var(--border-strong)] rounded-[7px] bg-[var(--surf-2)] text-[var(--txt)] outline-none [font-family:var(--f)] transition-[border-color,background] duration-150 [-webkit-appearance:none] focus:border-[var(--blue)] focus:bg-white focus:shadow-[0_0_0_3px_rgba(37,99,235,0.10)]"
                  />
                </div>
              </div>
              <div className="bg-white rounded-b-[9px] border border-t-0 border-[var(--border-strong)] shadow-[var(--shadow-sm)] w-full overflow-hidden">
                {loadingRecords ? (
                  <div className="p-8 text-center text-[13px] text-[var(--txt3)] flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-[var(--blue-md)] border-t-[var(--blue)] rounded-full animate-spin" />
                    <span>Loading archived records…</span>
                  </div>
                ) : filteredArchived.length === 0 ? (
                  <div className="py-9 px-[18px] text-center text-[var(--txt3)]">
                    <span className="text-[30px] opacity-20 flex items-center justify-center mx-auto mb-2 text-[var(--txt3)]"><IconFolder /></span>
                    <div className="font-semibold text-[13px] text-[var(--txt2)]">No Archived Records Found</div>
                    <div className="text-xs mt-[3px]">
                      {archiveSearch
                        ? "No records match your search."
                        : "No records have been archived yet. Use the Upload button above to add new records."}
                    </div>
                  </div>
                ) : useCards ? (
                  <div className="flex flex-col">
                    {filteredArchived.map((r, i) => (
                      <MobileRecordCardArchive
                        key={r.id}
                        record={r}
                        index={i}
                        onView={() => handleViewPdf(r.id, r)}
                        onDelete={() => handleDelete(r.id, r)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="w-full overflow-x-auto overflow-y-auto [-webkit-overflow-scrolling:touch] max-h-[calc(100vh-var(--home-topbar-height)-52px-56px-30px)] relative bg-white ubr-scroll max-[1024px]:max-h-[calc(100vh-var(--home-topbar-height)-180px)] max-[768px]:max-h-none max-[768px]:overflow-y-visible">
                    <table className="w-full border-separate [border-spacing:0] text-[12.5px] min-w-[560px] bg-white">
                      <thead>
                        <tr className="bg-[var(--surf-2)]">
                          <th className="sticky top-0 z-[20] px-[11px] py-[9px] text-left font-bold text-[9.5px] text-[var(--txt3)] tracking-[0.5px] uppercase whitespace-nowrap bg-[var(--surf-2)] border-b border-[var(--border-strong)] shadow-[0_1px_0_var(--border)] max-[768px]:static">#</th>
                          <th className="sticky top-0 z-[20] px-[11px] py-[9px] text-left font-bold text-[9.5px] text-[var(--txt3)] tracking-[0.5px] uppercase whitespace-nowrap bg-[var(--surf-2)] border-b border-[var(--border-strong)] shadow-[0_1px_0_var(--border)] max-[768px]:static">Name</th>
                          <th className="sticky top-0 z-[20] px-[11px] py-[9px] text-left font-bold text-[9.5px] text-[var(--txt3)] tracking-[0.5px] uppercase whitespace-nowrap bg-[var(--surf-2)] border-b border-[var(--border-strong)] shadow-[0_1px_0_var(--border)] max-[768px]:static">Father / Mother</th>
                          <th className="sticky top-0 z-[20] px-[11px] py-[9px] text-left font-bold text-[9.5px] text-[var(--txt3)] tracking-[0.5px] uppercase whitespace-nowrap bg-[var(--surf-2)] border-b border-[var(--border-strong)] shadow-[0_1px_0_var(--border)] max-[768px]:static">Archived Date</th>
                          <th className="sticky top-0 z-[20] px-[11px] py-[9px] text-left font-bold text-[9.5px] text-[var(--txt3)] tracking-[0.5px] uppercase whitespace-nowrap bg-[var(--surf-2)] border-b border-[var(--border-strong)] shadow-[0_1px_0_var(--border)] max-[768px]:static">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredArchived.map((r, i) => (
                          <tr key={r.id} className="border-b border-[var(--border-lt)] transition-colors duration-150 hover:bg-[var(--surf-2)]">
                            <td className="px-[11px] py-2 align-middle bg-transparent text-[var(--txt)] text-[var(--txt3)] text-[11px] w-8">{i + 1}</td>
                            <td className="px-[11px] py-2 align-middle bg-transparent text-[var(--txt)]">
                              <div className="flex items-center gap-[6px]">
                                <span className="text-[14px] flex-shrink-0 flex items-center text-[var(--txt3)]"><IconDocument /></span>
                                <span className="font-semibold text-[var(--txt)] text-[12.5px]">{getRecordDisplayName(r)}</span>
                              </div>
                            </td>
                            <td className="px-[11px] py-2 align-middle bg-transparent text-[var(--txt)]"><RelativesChips record={r} /></td>
                            <td className="px-[11px] py-2 align-middle bg-transparent text-[var(--txt2)] text-[11.5px] whitespace-nowrap">{formatDate(r.archived_at)}</td>
                            <td className="px-[11px] py-2 align-middle bg-transparent text-[var(--txt)]">
                              <div className="flex gap-[3px] flex-wrap items-center">
                                <button className="inline-flex items-center gap-[3px] px-[9px] py-1 rounded-[5px] border-0 !text-white text-[11px] font-semibold cursor-pointer [font-family:var(--f)] transition-all duration-150 whitespace-nowrap touch-manipulation !bg-[#2563eb] hover:brightness-90 hover:-translate-y-px" onClick={() => handleViewPdf(r.id, r)}>View</button>
                                <button className="inline-flex items-center gap-[3px] px-[9px] py-1 rounded-[5px] border-0 !text-white text-[11px] font-semibold cursor-pointer [font-family:var(--f)] transition-all duration-150 whitespace-nowrap touch-manipulation !bg-[#dc2626] hover:brightness-90 hover:-translate-y-px" onClick={() => handleDelete(r.id, r)}>Delete</button>
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