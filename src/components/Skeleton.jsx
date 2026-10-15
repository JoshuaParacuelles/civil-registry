import React from "react";
import "./Skeleton.css";

/**
 * Animated placeholder block.
 * variant "block" (default) gets h=200 when h is not given.
 * variant "text" / "pill" use the height from Skeleton.css unless h is given.
 */
export const Skeleton = ({
  h,
  w,
  radius,
  variant = "block",
  className = "",
  style,
  ...rest
}) => {
  const variantClass =
    variant === "text" ? "ui-skeleton--text"
    : variant === "pill" ? "ui-skeleton--pill"
    : "";

  const height = h ?? (variant === "block" ? 200 : undefined);

  return (
    <div
      className={`ui-skeleton ${variantClass} ${className}`.trim()}
      style={{ height, width: w, borderRadius: radius, ...style }}
      aria-hidden="true"
      {...rest}
    />
  );
};

export const SkeletonGrid = ({
  count = 3,
  h = 92,
  columns = 3,
  gap = "1rem",
  className = "",
  style,
}) => (
  <div
    className={`ui-skeleton-grid ${className}`.trim()}
    style={{ "--skeleton-cols": columns, gap, ...style }}
    aria-hidden="true"
  >
    {Array.from({ length: count }, (_, i) => (
      <Skeleton key={i} h={h} />
    ))}
  </div>
);

export const SkeletonText = ({ lines = 3, gap = "8px", className = "", style }) => {
  const widths = ["100%", "88%", "72%", "95%", "60%"];
  return (
    <div
      className={`ui-skeleton-text-group ${className}`.trim()}
      style={{ gap, ...style }}
      aria-hidden="true"
    >
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} variant="text" w={widths[i % widths.length]} />
      ))}
    </div>
  );
};

/**
 * Table-shaped placeholder: header-less rows of text cells.
 * Use inside a table card while records are loading.
 */
export const SkeletonTable = ({ rows = 5, cols = 4, className = "", style }) => (
  <div
    className={`ui-skeleton-table ${className}`.trim()}
    style={{
      padding: "14px 16px",
      display: "flex",
      flexDirection: "column",
      gap: 14,
      ...style,
    }}
    aria-hidden="true"
  >
    {Array.from({ length: rows }, (_, r) => (
      <div
        key={r}
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gap: 12,
          alignItems: "center",
        }}
      >
        {Array.from({ length: cols }, (_, c) => (
          <Skeleton
            key={c}
            variant="text"
            w={c === 0 ? "70%" : c === cols - 1 ? "45%" : "85%"}
          />
        ))}
      </div>
    ))}
  </div>
);

export default Skeleton;