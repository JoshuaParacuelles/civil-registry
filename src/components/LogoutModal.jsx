import React from "react";
import "./LogoutModal.css";

const LogoutModal = ({ open, loggingOut, onClose, onConfirm }) => {
  if (!open) return null;

  return (
    <div className="logout-modal-overlay" onClick={() => !loggingOut && onClose()}>
      <div className="logout-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Confirm Logout</h2>
        <p>Are you sure you want to exit? You'll need to sign in again to continue.</p>
        <div className="logout-modal-actions">
          <button type="button" className="logout-cancel-btn" onClick={onClose} disabled={loggingOut}>
            Cancel
          </button>
          <button type="button" className="logout-confirm-btn" onClick={onConfirm} disabled={loggingOut}>
            {loggingOut ? "Logging out…" : "Yes, Logout"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LogoutModal;
