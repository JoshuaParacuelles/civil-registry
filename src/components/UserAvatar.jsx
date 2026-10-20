import { useState } from "react";
import "./UserAvatar.css";

const getInitials = (name = "") =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("") || "?";

const UserAvatar = ({ src, name = "", size = 56, alt = "", className = "" }) => {
  const [failed, setFailed] = useState(false);

  const style = { width: size, height: size, fontSize: Math.round(size * 0.38) };
  const classes = ["user-avatar", className].filter(Boolean).join(" ");

  if (src && !failed) {
    return (
      <img
        key={src}
        src={src}
        alt={alt}
        className={classes}
        style={style}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span className={`${classes} user-avatar--fallback`} style={style} aria-hidden="true">
      {getInitials(name)}
    </span>
  );
};

export default UserAvatar;