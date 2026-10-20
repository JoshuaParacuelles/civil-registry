import { useEffect, useRef, useState } from "react";
import UserAvatar from "./UserAvatar";
import {
  avatarUrl,
  fetchProfile,
  removeAvatar,
  updateDisplayName,
  uploadAvatar,
} from "../services/profileService";
import { pushToast } from "../services/toastService";
import "./ProfileModal.css";

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const NAME_MAX_LENGTH = 100;

const notify = (title, message, type) =>
  pushToast({ title, message, type, presentation: "status", duration: 5000 });

const ProfileModal = ({ open, username, profile, onProfileChange, onClose }) => {
  const [nameDraft, setNameDraft] = useState("");
  const [pendingFile, setPendingFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);

  const savedName = profile?.display_name || "";
  const trimmedName = nameDraft.trim();
  const nameChanged = trimmedName.length > 0 && trimmedName !== savedName;
  const hasChanges = nameChanged || pendingFile !== null;

  // Load fresh profile data each time the modal opens.
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setLoading(true);
    fetchProfile()
      .then((data) => {
        if (!cancelled) onProfileChange(data);
      })
      .catch((err) => {
        if (!cancelled) notify("Error", err.message || "Could not load profile.", "error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, onProfileChange]);

  // Reset the form whenever the modal opens or the saved name changes.
  useEffect(() => {
    if (!open) return;
    setNameDraft(savedName);
    setPendingFile(null);
  }, [open, savedName]);

  // Preview the chosen file, and release the object URL when it changes.
  useEffect(() => {
    if (!pendingFile) {
      setPreviewUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(pendingFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingFile]);

  // Escape closes the modal, except while a save is running.
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, saving, onClose]);

  if (!open) return null;

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      notify("Error", "Only PNG, JPEG, or WebP images are allowed.", "error");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      notify("Error", "Image must be 2 MB or smaller.", "error");
      return;
    }
    setPendingFile(file);
  };

  const handleRemovePicture = async () => {
    setSaving(true);
    try {
      const updated = await removeAvatar();
      onProfileChange(updated);
      notify("Success", "Profile picture removed.", "success");
    } catch (err) {
      notify("Error", err.message || "Could not remove picture.", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!hasChanges || saving) return;

    setSaving(true);
    try {
      // Update the parent after each step so a partial success is not lost.
      if (nameChanged) {
        const updated = await updateDisplayName(trimmedName);
        onProfileChange(updated);
      }
      if (pendingFile) {
        const updated = await uploadAvatar(pendingFile);
        onProfileChange(updated);
      }
      notify("Success", "Profile updated.", "success");
      onClose();
    } catch (err) {
      notify("Error", err.message || "Could not save profile.", "error");
    } finally {
      setSaving(false);
    }
  };

  const shownSrc = previewUrl || avatarUrl(profile);
  const displayedName = trimmedName || savedName || username || "";

  return (
    <div className="profile-modal-overlay" onClick={() => !saving && onClose()}>
      <div
        className="profile-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="profile-modal-header">
          <h2 id="profile-modal-title">Edit profile</h2>
          <button
            type="button"
            className="profile-modal-close"
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form className="profile-modal-form" onSubmit={handleSave}>
          <div className="profile-modal-body">
            <div className="profile-modal-identity">
              <UserAvatar
                src={shownSrc}
                name={displayedName}
                size={112}
                alt="Profile picture"
              />
              <p className="profile-modal-name">{displayedName || "—"}</p>
              <p className="profile-modal-username">@{username || "—"}</p>
            </div>

            <div className="profile-modal-actions">
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_TYPES.join(",")}
                hidden
                onChange={handleFileChange}
              />
              <button
                type="button"
                className="profile-btn profile-btn--primary"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading || saving}
              >
                {profile?.has_avatar || pendingFile ? "Change picture" : "Upload picture"}
              </button>

              {pendingFile ? (
                <button
                  type="button"
                  className="profile-btn"
                  onClick={() => setPendingFile(null)}
                  disabled={saving}
                >
                  Cancel new picture
                </button>
              ) : (
                profile?.has_avatar && (
                  <button
                    type="button"
                    className="profile-btn"
                    onClick={handleRemovePicture}
                    disabled={loading || saving}
                  >
                    Remove picture
                  </button>
                )
              )}

              <p className="profile-modal-hint">
                PNG, JPEG, or WebP, up to 2 MB. Saved when you click Save.
              </p>
            </div>

            <div className="profile-modal-field">
              <label className="profile-modal-label" htmlFor="profile-display-name">
                Display name
              </label>
              <input
                id="profile-display-name"
                type="text"
                className="profile-modal-input"
                maxLength={NAME_MAX_LENGTH}
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                disabled={loading || saving}
                autoFocus
              />
            </div>
          </div>

          <div className="profile-modal-footer">
            <button
              type="button"
              className="profile-btn"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="profile-btn profile-btn--primary"
              disabled={!hasChanges || loading || saving}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProfileModal;