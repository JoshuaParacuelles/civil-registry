import React, { useEffect, useState } from "react";
import { getPdfBlobUrl, printPdfFromData } from "../utils/pdf";
import { IconDocument, IconDocumentLg } from "./VitalIcons";

export default function PdfModal({ pdfData, pdfError, fileName, onClose, showNotif }) {
  const [pdfUrl, setPdfUrl] = useState("");
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    const url = getPdfBlobUrl(pdfData);
    setPdfUrl(url);
    if (pdfData && !url) {
      showNotif?.("This PDF could not be displayed — the stored file appears to be corrupted.", "error");
    }
    return () => { if (url && url.startsWith("blob:")) URL.revokeObjectURL(url); };
  }, [pdfData, showNotif]);

  const handlePrint = async () => {
    if (!pdfData) { showNotif?.("No PDF available to print.", "error"); return; }
    try {
      setPrinting(true);
      await printPdfFromData(pdfData);
      showNotif?.("Printing selected PDF…", "success");
    } catch (error) {
      console.error(error);
      showNotif?.(error.message || "Failed to print PDF.", "error");
    } finally {
      setPrinting(false);
    }
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
}