import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./Dashboard.css";

/* ══ CONSTANTS ═══════════════════════════════════════════════════════════════ */
// Relative path — resolves against whatever origin loaded the page
// (localhost, your LAN IP, or the HTTPS devtunnel), and goes through
// Vite's dev-server proxy to Flask on localhost:5000. Never build an
// absolute http://host:5000 URL here — it breaks on LAN and is blocked
// as mixed content behind an HTTPS tunnel.
const API = `${import.meta.env.VITE_API_BASE_URL || ""}/api/analytics`;

const COLORS = {
  birth:          "#378ADD",
  marriage:       "#1D9E75",
  death:          "#7F77DD",
  verification:   "#BA7517",
  birth_light:    "#B5D4F4",
  marriage_light: "#9FE1CB",
  death_light:    "#CECBF6",
};

const MONTH_SHORT = ["","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/* ══ HELPERS ═════════════════════════════════════════════════════════════════ */
const fmtNum  = (v) => Number(v || 0).toLocaleString("en-PH");
const fmtPct  = (v) => (v == null ? "—" : `${v > 0 ? "+" : ""}${Number(v).toFixed(1)}%`);
const fmtPHP  = (v) => `₱${Number(v || 0).toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const safeArr = (v) => (Array.isArray(v) ? v : []);

/* ══ DATA HOOK ═══════════════════════════════════════════════════════════════
   Each failed endpoint is tagged with `{ __failed: true, __error }`
   (message pulled from the backend's JSON `error` field when present, else
   the HTTP status or network error text). `safeArr()` still treats these as
   empty for chart rendering, but `fetchAll` also collects every failure
   into a single readable message and puts it in `error`, which the
   error-banner at the top of the dashboard displays — so a
   Supabase/RLS/network problem shows up as a visible error instead of a
   misleading "0" everywhere. If NO error banner shows but everything still
   reads 0, that means every request succeeded and the underlying tables are
   genuinely empty — hit /api/analytics/debug-counts to confirm.
   ══════════════════════════════════════════════════════════════════════════ */
function useAnalyticsData() {
  const [data, setData]       = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    const endpoints = {
      summary:           `${API}/summary`,
      byYear:            `${API}/records-by-year`,
      byMonth:           `${API}/records-by-month`,
      reqByYear:         `${API}/requests-by-year`,
      reqByMonth:        `${API}/requests-by-month`,
      topMunicipalities: `${API}/top-municipalities`,
      growthRate:        `${API}/growth-rate`,
      today:             `${API}/dashboard-today`,
    };
    try {
      const fetchPromises = Object.entries(endpoints).map(async ([key, url]) => {
        try {
          const r = await fetch(url, { credentials: "include" });
          if (!r.ok) {
            let msg = `HTTP ${r.status} ${r.statusText || ""}`.trim();
            try {
              const j = await r.json();
              if (j && j.error) msg = j.error;
            } catch {
              // Response body wasn't JSON — keep the HTTP status message.
            }
            return [key, { __failed: true, __error: msg }];
          }
          const json = await r.json();
          return [key, json];
        } catch (e) {
          return [key, { __failed: true, __error: e.message || "Network error" }];
        }
      });

      const results = await Promise.all(fetchPromises);
      const merged = Object.fromEntries(results);
      setData(merged);

      const failures = results.filter(([, v]) => v && v.__failed);
      if (failures.length) {
        const detail = failures.map(([key, v]) => `${key} (${v.__error})`).join(", ");
        setError(
          `${failures.length} of ${results.length} analytics endpoint(s) failed to load: ${detail}`
        );
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return { data, loading, error, refetch: fetchAll };
}

/* ══ SVG LINE CHART ══════════════════════════════════════════════════════════ */
const LineChart = ({ series = [], labels = [], height = 180, showLegend = true }) => {
  const [hoverIdx, setHoverIdx] = useState(null);
  const svgRef = useRef(null);
  const W = 560, H = height;
  const PAD = { top: 16, right: 16, bottom: 32, left: 44 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  // Normalize single-point data into a real 2-point ascending line
  // (0 → value) so it always reads as a line graph, never a lone dot.
  const isSinglePoint = labels.length === 1;
  const chartLabels = isSinglePoint ? ["", labels[0]] : labels;
  const chartSeries = useMemo(
    () =>
      isSinglePoint
        ? series.map((s) => ({ ...s, data: [0, ...safeArr(s.data)] }))
        : series,
    [series, isSinglePoint]
  );

  const allValues = chartSeries.flatMap((s) => safeArr(s.data));
  const maxVal = Math.max(...allValues, 1);
  const minVal = Math.min(...allValues, 0);
  const range  = maxVal - minVal || 1;

  const xScale = (i) =>
    chartLabels.length <= 1
      ? PAD.left + innerW / 2
      : PAD.left + (i / (chartLabels.length - 1)) * innerW;

  const yScale = (v) => PAD.top + innerH - ((v - minVal) / range) * innerH;

  const ticks = 4;
  const tickVals = Array.from({ length: ticks + 1 }, (_, i) =>
    Math.round(minVal + (range / ticks) * i)
  );

  const pathD = (points) => {
    if (points.length < 2) return "";
    const result = [`M ${xScale(0)} ${yScale(points[0])}`];
    for (let i = 1; i < points.length; i++) {
      const x0 = xScale(i - 1), y0 = yScale(points[i - 1]);
      const x1 = xScale(i),     y1 = yScale(points[i]);
      const cpx = (x0 + x1) / 2;
      result.push(`C ${cpx} ${y0} ${cpx} ${y1} ${x1} ${y1}`);
    }
    return result.join(" ");
  };

  const areaD = (points) => {
    if (points.length < 2) return "";
    const base = yScale(minVal);
    const line = pathD(points);
    return `${line} L ${xScale(points.length - 1)} ${base} L ${xScale(0)} ${base} Z`;
  };

  const handleMouseMove = useCallback((e) => {
    if (isSinglePoint) {
      // Only one real value exists — always highlight it, regardless of
      // where the cursor is, rather than letting hover land on the
      // synthetic leading zero point.
      setHoverIdx(1);
      return;
    }
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (W / rect.width);
    const relX = x - PAD.left;
    const idx = Math.round((relX / innerW) * (chartLabels.length - 1));
    setHoverIdx(Math.max(0, Math.min(chartLabels.length - 1, idx)));
  }, [chartLabels.length, isSinglePoint]);

  // Thin labels based on actual available pixel space, not a fixed
  // "every Nth index" rule, so long labels like "Aug 2026"/"Sep 2026"
  // never overlap.
  const estCharWidth = 5.6; // approx glyph width in px at fontSize 9
  const longestLabelLen = Math.max(1, ...chartLabels.map((l) => (l || "").length));
  const estLabelWidth = longestLabelLen * estCharWidth + 10; // + breathing room
  const spacingPerIndex = chartLabels.length > 1 ? innerW / (chartLabels.length - 1) : innerW;
  const maxLabelsThatFit = Math.max(1, Math.floor(innerW / estLabelWidth) + 1);
  const step = Math.max(1, Math.ceil(chartLabels.length / maxLabelsThatFit));
  const lastRegularIdx = Math.floor((chartLabels.length - 1) / step) * step;

  const shouldShowLabel = (i) => {
    if (!chartLabels[i]) return false; // skip the synthetic blank leading label
    if (i % step === 0) return true;
    if (i === chartLabels.length - 1) {
      const pixelGap = (i - lastRegularIdx) * spacingPerIndex;
      return pixelGap >= estLabelWidth;
    }
    return false;
  };

  return (
    <div style={{ position: "relative" }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: "auto", display: "block" }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          {chartSeries.map((s, si) => (
            <linearGradient key={si} id={`grad-${si}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={s.color} stopOpacity="0.16" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0.01" />
            </linearGradient>
          ))}
        </defs>

        {tickVals.map((tv, i) => (
          <g key={i}>
            <line
              x1={PAD.left} y1={yScale(tv)}
              x2={W - PAD.right} y2={yScale(tv)}
              stroke="var(--an-border, rgba(0,0,0,0.08))"
              strokeWidth="0.5"
            />
            <text
              x={PAD.left - 6} y={yScale(tv) + 4}
              textAnchor="end" fontSize="9"
              fill="var(--an-text-muted, #94a3b8)"
            >
              {fmtNum(tv)}
            </text>
          </g>
        ))}

        {chartLabels.map((lbl, i) =>
          shouldShowLabel(i) ? (
            <text
              key={i} x={xScale(i)} y={H - 4}
              textAnchor="middle" fontSize="9"
              fill="var(--an-text-muted, #94a3b8)"
            >
              {lbl}
            </text>
          ) : null
        )}

        {chartSeries.map((s, si) => (
          <path key={`area-${si}`} d={areaD(safeArr(s.data))} fill={`url(#grad-${si})`} />
        ))}

        {chartSeries.map((s, si) => (
          <path
            key={`line-${si}`}
            d={pathD(safeArr(s.data))}
            fill="none"
            stroke={s.color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {hoverIdx != null && (
          <line
            x1={xScale(hoverIdx)} y1={PAD.top}
            x2={xScale(hoverIdx)} y2={H - PAD.bottom}
            stroke="var(--an-border-strong, rgba(0,0,0,0.14))"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        )}

        {hoverIdx != null && chartSeries.map((s, si) => {
          const v = safeArr(s.data)[hoverIdx];
          if (v == null) return null;
          return (
            <circle
              key={`dot-${si}`}
              cx={xScale(hoverIdx)} cy={yScale(v)}
              r="4" fill={s.color}
              stroke="var(--an-surface, #ffffff)" strokeWidth="2"
            />
          );
        })}
      </svg>

      {hoverIdx != null && (
        <div className="an-tooltip">
          <div className="an-tooltip-label">{chartLabels[hoverIdx]}</div>
          {chartSeries.map((s, si) => {
            const v = safeArr(s.data)[hoverIdx];
            return (
              <div key={si} className="an-tooltip-row">
                <span className="an-tooltip-dot" style={{ background: s.color }} />
                <span>{s.name}</span>
                <strong>{fmtNum(v)}</strong>
              </div>
            );
          })}
        </div>
      )}

      {showLegend && chartSeries.length > 1 && (
        <div className="an-legend">
          {chartSeries.map((s, si) => (
            <div key={si} className="an-legend-item">
              <span className="an-legend-dot" style={{ background: s.color }} />
              <span>{s.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/* ══ BAR CHART ═══════════════════════════════════════════════════════════════ */
const BarChart = ({
  rows = [],
  colorKey  = "color",
  valueKey  = "count",
  labelKey  = "label",
  showValue = true,
}) => {
  const maxVal = Math.max(...rows.map((r) => Number(r[valueKey] || 0)), 1);
  return (
    <div className="an-bar-chart">
      {rows.map((row, i) => {
        const val   = Number(row[valueKey] || 0);
        const pct   = Math.round((val / maxVal) * 100);
        const color = row[colorKey] || COLORS.birth;
        return (
          <div key={i} className="an-bar-row">
            <div className="an-bar-label" title={row[labelKey]}>{row[labelKey]}</div>
            <div className="an-bar-track">
              <div className="an-bar-fill" style={{ width: `${pct}%`, background: color }} />
            </div>
            {showValue && <div className="an-bar-val">{fmtNum(val)}</div>}
          </div>
        );
      })}
    </div>
  );
};

/* ══ STACKED BAR CHART ═══════════════════════════════════════════════════════ */
const StackedBar = ({ rows = [] }) => {
  const maxVal = Math.max(
    ...rows.map((r) => (r.Birth || 0) + (r.Marriage || 0) + (r.Death || 0)),
    1
  );
  return (
    <div className="an-stacked-chart">
      {rows.map((row, i) => {
        const total = (row.Birth || 0) + (row.Marriage || 0) + (row.Death || 0);
        const bPct  = Math.round(((row.Birth    || 0) / maxVal) * 100);
        const mPct  = Math.round(((row.Marriage || 0) / maxVal) * 100);
        const dPct  = Math.round(((row.Death    || 0) / maxVal) * 100);
        return (
          <div key={i} className="an-stacked-row">
            <div className="an-stacked-label" title={row.name}>{row.name}</div>
            <div className="an-stacked-track">
              <div className="an-stacked-seg" style={{ width: `${bPct}%`, background: COLORS.birth    }} title={`Birth: ${row.Birth}`} />
              <div className="an-stacked-seg" style={{ width: `${mPct}%`, background: COLORS.marriage }} title={`Marriage: ${row.Marriage}`} />
              <div className="an-stacked-seg" style={{ width: `${dPct}%`, background: COLORS.death    }} title={`Death: ${row.Death}`} />
            </div>
            <div className="an-stacked-val">{fmtNum(total)}</div>
          </div>
        );
      })}
    </div>
  );
};

/* ══ DONUT CHART ═════════════════════════════════════════════════════════════ */
const DonutChart = ({ slices = [], size = 130 }) => {
  const [hovered, setHovered] = useState(null);
  const total = slices.reduce((s, sl) => s + Number(sl.count || 0), 0);
  if (!total) return <div className="an-empty-small">No data</div>;

  const r = 46, ir = 30, cx = size / 2, cy = size / 2;
  let angle = -Math.PI / 2;

  const arcs = slices
    .filter((sl) => Number(sl.count || 0) > 0)
    .map((sl, i) => {
      const val   = Number(sl.count || 0);
      const sweep = (val / total) * Math.PI * 2;
      const end   = angle + sweep;
      const la    = sweep > Math.PI ? 1 : 0;
      const x1  = cx + r  * Math.cos(angle), y1  = cy + r  * Math.sin(angle);
      const x2  = cx + r  * Math.cos(end),   y2  = cy + r  * Math.sin(end);
      const ix1 = cx + ir * Math.cos(end),   iy1 = cy + ir * Math.sin(end);
      const ix2 = cx + ir * Math.cos(angle), iy2 = cy + ir * Math.sin(angle);
      const path = `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${la} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} L ${ix1.toFixed(2)} ${iy1.toFixed(2)} A ${ir} ${ir} 0 ${la} 0 ${ix2.toFixed(2)} ${iy2.toFixed(2)} Z`;
      const arc  = {
        key:   `${sl.label}-${i}`,
        path,
        color: sl.color,
        label: sl.label,
        count: val,
        pct:   Math.round((val / total) * 100),
      };
      angle = end;
      return arc;
    });

  const active = hovered != null ? arcs[hovered] : null;

  return (
    <div className="an-donut-wrap">
      <svg
        width={size} height={size}
        viewBox={`0 0 ${size} ${size}`}
        onMouseLeave={() => setHovered(null)}
      >
        {arcs.map((a, i) => (
          <path
            key={a.key}
            d={a.path}
            fill={a.color}
            opacity={hovered == null || hovered === i ? 1 : 0.40}
            style={{ cursor: "pointer", transition: "opacity .15s" }}
            onMouseEnter={() => setHovered(i)}
          />
        ))}
        <circle cx={cx} cy={cy} r={ir - 1} fill="var(--an-surface, #ffffff)" />
        <text
          x={cx} y={cy - 5}
          textAnchor="middle" fontSize="11" fontWeight="700"
          fill="var(--an-text, #0f172a)"
        >
          {active ? fmtNum(active.count) : fmtNum(total)}
        </text>
        <text
          x={cx} y={cy + 10}
          textAnchor="middle" fontSize="8"
          fill="var(--an-text-muted, #94a3b8)"
        >
          {active ? active.label : "total"}
        </text>
      </svg>

      <div className="an-donut-legend">
        {slices.map((sl, i) => (
          <div
            key={sl.label}
            className="an-donut-item"
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          >
            <span className="an-donut-dot" style={{ background: sl.color }} />
            <span className="an-donut-name">{sl.label}</span>
            <strong className="an-donut-count">{fmtNum(sl.count)}</strong>
            <span className="an-donut-pct">{Math.round((sl.count / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ══ SPARKLINE ═══════════════════════════════════════════════════════════════
   Minimal single-color trend line — no axes, gridlines, or legend. Used in
   place of a static badge wherever a real historical series backs the
   metric, so the number is supported by its own recent shape rather than
   a generic up/down chip. */
const Sparkline = ({ data = [], color = COLORS.birth, height = 32 }) => {
  const values = safeArr(data).map((v) => Number(v) || 0);
  if (values.length < 2) return null;

  const W = 160, H = height, PAD = 3;
  const max = Math.max(...values);
  const min = Math.min(...values, 0);
  const range = max - min || 1;

  const points = values.map((v, i) => [
    PAD + (i / (values.length - 1)) * (W - PAD * 2),
    PAD + (H - PAD * 2) - ((v - min) / range) * (H - PAD * 2),
  ]);

  const path = points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(" ");

  const [lastX, lastY] = points[points.length - 1];

  return (
    <svg
      className="an-sparkline"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d={path} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r="2.5" fill={color} />
    </svg>
  );
};

/* ══ GROWTH RATE BADGE ═══════════════════════════════════════════════════════ */
const GrowthBadge = ({ value }) => {
  if (value == null) return <span className="an-growth-neutral">—</span>;
  const cls   = value > 0 ? "an-growth-up" : value < 0 ? "an-growth-down" : "an-growth-neutral";
  const arrow = value > 0 ? "↑" : value < 0 ? "↓" : "→";
  return (
    <span className={`an-growth-badge ${cls}`}>
      {arrow} {Math.abs(value).toFixed(1)}%
    </span>
  );
};

/* ══ METRIC CARD ═════════════════════════════════════════════════════════════ */
const MetricCard = ({ label, value, sub, accent, growth, hero = false, period, trend }) => (
  <div className={`an-metric-card${hero ? " an-metric-card--hero" : ""}`}>
    <div className="an-metric-label">
      {accent && <span className="an-metric-dot" style={{ background: accent }} />}
      {label}
    </div>
    <div className="an-metric-value">{value}</div>
    <div className="an-metric-footer">
      <span className="an-metric-sub">{sub}</span>
      {growth != null && <GrowthBadge value={growth} />}
    </div>
    {period && <div className="an-metric-period">{period}</div>}
    {trend && trend.length > 1 && (
      <Sparkline data={trend} color={accent || COLORS.birth} height={hero ? 48 : 32} />
    )}
  </div>
);

/* ══ PANEL WRAPPER ═══════════════════════════════════════════════════════════ */
const Panel = ({ title, sub, children, full = false }) => (
  <section className={`an-panel${full ? " an-panel-full" : ""}`}>
    <div className="an-panel-head">
      <h3>{title}</h3>
      {sub && <p>{sub}</p>}
    </div>
    {children}
  </section>
);

/* ══ SKELETON ════════════════════════════════════════════════════════════════ */
const Skeleton = ({ h = 200 }) => (
  <div className="an-skeleton" style={{ height: h, background: '#e2e8f0', borderRadius: '8px' }} />
);

/* ══ EMPTY ═══════════════════════════════════════════════════════════════════ */
const Empty = ({ msg = "No data available" }) => (
  <div className="an-empty">
    <span>📭</span>
    <span>{msg}</span>
  </div>
);

/* ══ TOP MUNICIPALITIES TABLE ════════════════════════════════════════════════ */
const MunicipalityTable = ({ rows = [] }) => {
  const [sortBy, setSortBy] = useState("cnt");
  const sorted = [...rows].sort((a, b) => Number(b[sortBy] || 0) - Number(a[sortBy] || 0));
  const max    = sorted[0]?.[sortBy] || 1;

  const cols = [
    { key: "cnt",      label: "Total",    color: "#64748b"         },
    { key: "Birth",    label: "Birth",    color: COLORS.birth      },
    { key: "Marriage", label: "Marriage", color: COLORS.marriage   },
    { key: "Death",    label: "Death",    color: COLORS.death      },
  ];

  return (
    <div className="an-muni-wrap">
      <div className="an-muni-sort">
        {cols.map((c) => (
          <button
            key={c.key}
            className={`an-muni-sort-btn${sortBy === c.key ? " active" : ""}`}
            style={
              sortBy === c.key
                ? { borderColor: c.color, color: c.color, background: `${c.color}18` }
                : {}
            }
            onClick={() => setSortBy(c.key)}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="an-muni-list">
        {sorted.map((row, i) => {
          const val = Number(row[sortBy] || 0);
          const pct = Math.round((val / max) * 100);
          const col = cols.find((c) => c.key === sortBy)?.color || "#64748b";
          return (
            <div key={row.name} className="an-muni-row">
              <div className="an-muni-rank">{i + 1}</div>
              <div className="an-muni-info">
                <div className="an-muni-name">{row.name}</div>
                <div className="an-muni-bars">
                  <div className="an-muni-bar-wrap">
                    <div className="an-muni-bar-fill" style={{ width: `${pct}%`, background: col }} />
                  </div>
                  <div className="an-muni-type-pills">
                    {row.Birth    > 0 && <span className="an-type-pill" style={{ background: `${COLORS.birth}22`,    color: COLORS.birth    }}>B {fmtNum(row.Birth)}</span>}
                    {row.Marriage > 0 && <span className="an-type-pill" style={{ background: `${COLORS.marriage}22`, color: COLORS.marriage }}>M {fmtNum(row.Marriage)}</span>}
                    {row.Death    > 0 && <span className="an-type-pill" style={{ background: `${COLORS.death}22`,    color: COLORS.death    }}>D {fmtNum(row.Death)}</span>}
                  </div>
                </div>
              </div>
              <div className="an-muni-total" style={{ color: col }}>{fmtNum(val)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ══ GROWTH RATE TABLE ═══════════════════════════════════════════════════════ */
const GrowthTable = ({ rows = [] }) => {
  const last12 = rows.slice(-12);
  return (
    <div className="an-growth-table-wrap">
      <table className="an-growth-table">
        <thead>
          <tr>
            <th>Period</th>
            <th>Total</th>
            <th>Birth</th>
            <th>Marriage</th>
            <th>Death</th>
            <th>MoM Growth</th>
          </tr>
        </thead>
        <tbody>
          {last12.slice().reverse().map((row, i) => (
            <tr key={row.label || i}>
              <td className="an-gt-period">{row.label}</td>
              <td className="an-gt-total">{fmtNum(row.count)}</td>
              <td style={{ color: COLORS.birth,    fontWeight: 700 }}>{fmtNum(row.Birth)}</td>
              <td style={{ color: COLORS.marriage, fontWeight: 700 }}>{fmtNum(row.Marriage)}</td>
              <td style={{ color: COLORS.death,    fontWeight: 700 }}>{fmtNum(row.Death)}</td>
              <td><GrowthBadge value={row.mom_growth} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/* ══ MONTH HEATMAP ═══════════════════════════════════════════════════════════ */
const MonthHeatmap = ({ byMonth = [], reqByMonth = [] }) => {
  const months = MONTH_SHORT.slice(1);

  const recMap = Object.fromEntries(
    safeArr(byMonth).map((r)  => [Number(r.month_num), Number(r.count || 0)])
  );
  const reqMap = Object.fromEntries(
    safeArr(reqByMonth).map((r) => [Number(r.month_num), Number(r.count || 0)])
  );

  const maxRec = Math.max(...Object.values(recMap), 1);
  const maxReq = Math.max(...Object.values(reqMap), 1);

  const hasRecData = Object.values(recMap).some((v) => v > 0);
  const hasReqData = Object.values(reqMap).some((v) => v > 0);

  if (!hasRecData && !hasReqData) {
    return (
      <Empty msg="No monthly data — the date columns in your record tables may not be populated yet" />
    );
  }

  const renderRow = (label, map, maxVal, baseColor) => (
    <div className="an-heatmap-row">
      <div className="an-heatmap-track-label">{label}</div>
      {months.map((m, i) => {
        const monthNum = i + 1;
        const val = map[monthNum] || 0;
        if (maxVal === 0 || !Object.values(map).some((v) => v > 0)) {
          return (
            <div key={m} className="an-heatmap-cell" title={`${m}: no data`}>
              <span style={{ color: "var(--an-text-dim, #b0bec5)", fontSize: "9px" }}>—</span>
            </div>
          );
        }
        const alpha    = Math.round(15 + (val / maxVal) * 80);
        const alphaHex = alpha.toString(16).padStart(2, "0");
        return (
          <div
            key={m}
            className="an-heatmap-cell"
            title={`${m}: ${val > 0 ? fmtNum(val) : "no"} ${label.toLowerCase()}`}
            style={{ background: val > 0 ? `${baseColor}${alphaHex}` : "transparent" }}
          >
            <span style={{ opacity: val > 0 ? 1 : 0 }}>{fmtNum(val)}</span>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="an-heatmap">
      <div className="an-heatmap-row an-heatmap-header">
        <div className="an-heatmap-track-label" />
        {months.map((m) => (
          <div key={m} className="an-heatmap-month-label">{m}</div>
        ))}
      </div>
      {renderRow("Records",  recMap, maxRec, "#378ADD")}
      {renderRow("Requests", reqMap, maxReq, "#1D9E75")}
    </div>
  );
};

/* ══ TODAY PANEL ═════════════════════════════════════════════════════════════ */
const TodayPanel = ({ today = {} }) => {
  const breakdown = safeArr(today.requests_breakdown);
  const payments  = safeArr(today.payments_breakdown);
  const colorMap  = {
    Birth:        COLORS.birth,
    Marriage:     COLORS.marriage,
    Death:        COLORS.death,
    Verification: COLORS.verification,
  };

  return (
    <div className="an-today-grid">
      <div className="an-today-block">
        <div className="an-today-block-title">Requests today</div>
        <div className="an-today-big">{fmtNum(today.requests_today || 0)}</div>
        <div className="an-today-pills">
          {breakdown.map((r) => (
            <span
              key={r.label}
              className="an-today-pill"
              style={{
                background:  `${colorMap[r.label] || "#64748b"}22`,
                color:        colorMap[r.label] || "#64748b",
                borderColor: `${colorMap[r.label] || "#64748b"}44`,
              }}
            >
              {r.label} {fmtNum(r.count)}
            </span>
          ))}
        </div>
      </div>

      <div className="an-today-block">
        <div className="an-today-block-title">Revenue today</div>
        <div className="an-today-big">{fmtPHP(today.payments_amount_today || 0)}</div>
        <div className="an-today-pills">
          {payments.map((r) => (
            <span
              key={r.label}
              className="an-today-pill"
              style={{
                background:  `${colorMap[r.label] || "#64748b"}22`,
                color:        colorMap[r.label] || "#64748b",
                borderColor: `${colorMap[r.label] || "#64748b"}44`,
              }}
            >
              {r.label} {fmtPHP(r.amount)}
            </span>
          ))}
        </div>
      </div>

      <div className="an-today-block">
        <div className="an-today-block-title">Business window</div>
        <div className="an-today-window">
          <div className="an-today-window-label">Start</div>
          <div className="an-today-window-val">
            {today.business_day_start
              ? new Date(today.business_day_start).toLocaleTimeString("en-PH", {
                  hour: "2-digit", minute: "2-digit",
                })
              : "6:00 AM"}
          </div>
          <div className="an-today-window-label">Payments</div>
          <div className="an-today-window-val">
            {fmtNum(today.payments_today || 0)} transactions
          </div>
        </div>
      </div>
    </div>
  );
};

/* ══ GROWTH KPI HELPERS ══════════════════════════════════════════════════════ */
function buildGrowthKpis(growth) {
  const n          = growth.length;
  const latestRow  = n >= 1 ? growth[n - 1] : null;
  const prevRow    = n >= 2 ? growth[n - 2] : null;

  let momValue  = null;
  let momLabel  = "Month-over-month request growth";
  let momAccent = "#64748b";

  if (latestRow) {
    if (latestRow.mom_growth != null) {
      momValue = latestRow.mom_growth;
      momLabel = `${latestRow.label} vs previous month`;
    } else if (prevRow && prevRow.count > 0) {
      momValue = parseFloat(
        (((latestRow.count - prevRow.count) / prevRow.count) * 100).toFixed(1)
      );
      momLabel = `${latestRow.label} vs ${prevRow.label}`;
    } else {
      momValue = null;
      momLabel = n === 1
        ? `Only 1 period tracked (${latestRow.label}) — need 2+ for MoM`
        : "Not enough data for comparison";
    }
    if (momValue != null) {
      momAccent = momValue > 0 ? "#16a34a" : momValue < 0 ? "#dc2626" : "#64748b";
    }
  }

  let prevMomValue = null;
  let prevMomLabel = "Previous period growth rate";

  if (prevRow) {
    if (prevRow.mom_growth != null) {
      prevMomValue = prevRow.mom_growth;
      prevMomLabel = `${prevRow.label} vs its previous month`;
    } else {
      prevMomValue = null;
      prevMomLabel = `${prevRow.label} was the first tracked period`;
    }
  } else if (n === 1) {
    prevMomLabel = "Need 2+ months of requests";
  }

  const momDisplay         = momValue     != null ? fmtPct(momValue)     : (latestRow ? `${fmtNum(latestRow.count)} reqs` : "—");
  const prevMomDisplay = prevMomValue != null ? fmtPct(prevMomValue) : "—";
  const momDisplayAccent = momValue != null ? momAccent : (latestRow ? COLORS.birth : "#64748b");

  return { momDisplay, momLabel, momAccent: momDisplayAccent, prevMomDisplay, prevMomLabel };
}

/* ══ MAIN ANALYTICS DASHBOARD ════════════════════════════════════════════════ */
const AnalyticsDashboard = () => {
  const { data, loading, error, refetch } = useAnalyticsData();
  const [tab, setTab] = useState("overview");

  const summary  = data.summary  || {};
  const byYear   = safeArr(data.byYear);
  const byMonth  = safeArr(data.byMonth);
  const reqYear  = safeArr(data.reqByYear);
  const reqMonth = safeArr(data.reqByMonth);
  const munis    = safeArr(data.topMunicipalities);
  const growth   = safeArr(data.growthRate);
  const today    = data.today || {};

  const byYearSeries = useMemo(() => {
    if (!byYear.length) return [];
    return [{ name: "Records uploaded", data: byYear.map((r) => r.count), color: COLORS.birth }];
  }, [byYear]);

  const growthSeries = useMemo(() => {
    if (!growth.length) return [];
    return [
      { name: "Birth",    data: growth.map((r) => r.Birth    || 0), color: COLORS.birth    },
      { name: "Marriage", data: growth.map((r) => r.Marriage || 0), color: COLORS.marriage },
      { name: "Death",    data: growth.map((r) => r.Death    || 0), color: COLORS.death    },
    ];
  }, [growth]);

  const yearLabels   = byYear.map((r) => String(r.year));
  const growthLabels = growth.map((r) => r.label);

  const reqYearSeries = useMemo(() => {
    if (!reqYear.length) return [];
    return [{ name: "Requests", data: reqYear.map((r) => r.count), color: COLORS.marriage }];
  }, [reqYear]);

  const { momDisplay, momLabel, momAccent, prevMomDisplay, prevMomLabel } = useMemo(
    () => buildGrowthKpis(growth),
    [growth]
  );

  // Precise period text derived from the real data, in place of generic
  // hardcoded ranges like "last 24 months".
  const heroPeriod = byYear.length
    ? byYear.length > 1
      ? `${byYear[0].year}–${byYear[byYear.length - 1].year}`
      : `${byYear[0].year}`
    : null;

  const growthPeriod = growthLabels.length
    ? growthLabels.length > 1
      ? `${growthLabels[0]} – ${growthLabels[growthLabels.length - 1]}`
      : growthLabels[0]
    : null;

  const last12Growth = growth.slice(-12);
  const last12Period = last12Growth.length
    ? last12Growth.length > 1
      ? `${last12Growth[0].label} – ${last12Growth[last12Growth.length - 1].label}`
      : last12Growth[0].label
    : null;

  const donutSlices = [
    { label: "Birth",    count: summary.total_birth_records    || 0, color: COLORS.birth    },
    { label: "Marriage", count: summary.total_marriage_records || 0, color: COLORS.marriage },
    { label: "Death",    count: summary.total_death_records    || 0, color: COLORS.death    },
  ];

  const tabs = [
    { id: "overview",   label: "Overview"    },
    { id: "trends",     label: "Trends"      },
    { id: "geographic", label: "Geographic"  },
    { id: "growth",     label: "Growth Rate" },
    { id: "today",      label: "Today"       },
  ];

  if (loading) {
    return (
      <div className="an-wrapper">
        <Skeleton h={140} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem", marginTop: "0.75rem" }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} h={92} />
          ))}
        </div>
        <div style={{ marginTop: "1rem" }}>
          <Skeleton h={320} />
        </div>
      </div>
    );
  }

  return (
    <div className="an-wrapper">
      {error && (
        <div className="an-error-banner">
          ⚠ {error}
          <button className="an-error-retry" onClick={refetch} style={{ marginLeft: 12 }}>
            Retry
          </button>
        </div>
      )}

      <div className="an-kpi-hero-row">
        <MetricCard
          hero
          label="Total Records"
          value={fmtNum(summary.total_records)}
          sub="All civil registry entries"
          accent={COLORS.birth}
          period={heroPeriod}
          trend={byYear.map((r) => r.count)}
        />
      </div>

      <div className="an-kpi-secondary-row">
        <MetricCard
          label="Birth Records"
          value={fmtNum(summary.total_birth_records)}
          sub={`${summary.uploaded_today_breakdown?.birth || 0} uploaded today`}
          accent={COLORS.birth}
        />
        <MetricCard
          label="Marriage Records"
          value={fmtNum(summary.total_marriage_records)}
          sub={`${summary.uploaded_today_breakdown?.marriage || 0} uploaded today`}
          accent={COLORS.marriage}
        />
        <MetricCard
          label="Death Records"
          value={fmtNum(summary.total_death_records)}
          sub={`${summary.uploaded_today_breakdown?.death || 0} uploaded today`}
          accent={COLORS.death}
        />
      </div>

      <div className="an-tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`an-tab${tab === t.id ? " active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="an-tab-content">
          <div className="an-two-col">
            <Panel title="Record type distribution" sub="Total active civil registry records">
              <DonutChart slices={donutSlices} size={130} />
            </Panel>
            <Panel title="Seasonal patterns" sub="Record & request volume by month of year">
              <MonthHeatmap byMonth={byMonth} reqByMonth={reqMonth} />
            </Panel>
          </div>

          <Panel
            full
            title="Records uploaded per year"
            sub={heroPeriod ? `Historical civil registry growth, ${heroPeriod}` : "Historical civil registry growth"}
          >
            {byYear.length ? (
              <LineChart series={byYearSeries} labels={yearLabels} height={200} showLegend={false} />
            ) : (
              <Empty msg="No year data" />
            )}
          </Panel>
        </div>
      )}

      {tab === "trends" && (
        <div className="an-tab-content">
          <Panel
            full
            title="Monthly request volume by document type"
            sub={
              growthPeriod
                ? `Birth, marriage, and death certificate requests, ${growthPeriod}`
                : "Birth, marriage, and death certificate requests over time"
            }
          >
            {growthSeries.length ? (
              <LineChart series={growthSeries} labels={growthLabels} height={220} showLegend />
            ) : (
              <Empty msg="No trend data" />
            )}
          </Panel>

          <div className="an-two-col">
            <Panel title="Records registered per year" sub="Total civil records entered into the system">
              {byYear.length ? (
                <BarChart
                  rows={byYear.map((r) => ({ ...r, label: String(r.year), color: COLORS.birth }))}
                  colorKey="color" valueKey="count" labelKey="label"
                />
              ) : <Empty />}
            </Panel>
            <Panel title="Certificate requests per year" sub="Requests across all document types">
              {reqYear.length ? (
                <BarChart
                  rows={reqYear.map((r) => ({ ...r, label: String(r.year), color: COLORS.marriage }))}
                  colorKey="color" valueKey="count" labelKey="label"
                />
              ) : <Empty />}
            </Panel>
          </div>

          <Panel full title="Monthly seasonality — records" sub="Which months see the highest registration activity">
            {byMonth.length ? (
              <BarChart
                rows={byMonth.map((r) => ({ ...r, label: r.month_name, color: COLORS.birth }))}
                colorKey="color" valueKey="count" labelKey="label"
              />
            ) : <Empty />}
          </Panel>

          <Panel full title="Monthly seasonality — requests" sub="Certificate request demand by month">
            {reqMonth.length ? (
              <BarChart
                rows={reqMonth.map((r) => ({ ...r, label: r.month_name, color: COLORS.marriage }))}
                colorKey="color" valueKey="count" labelKey="label"
              />
            ) : <Empty />}
          </Panel>
        </div>
      )}

      {tab === "geographic" && (
        <div className="an-tab-content">
          <Panel
            full
            title="Top municipalities & barangays"
            sub="Ranked by record volume — click a sort key to reorder"
          >
            {munis.length ? (
              <>
                <StackedBar rows={munis.slice(0, 15)} />
                <div style={{ marginTop: "1.25rem" }}>
                  <MunicipalityTable rows={munis} />
                </div>
              </>
            ) : (
              <Empty msg="No municipality data — check that city/municipality fields are populated in your database" />
            )}
          </Panel>

          {munis.length > 0 && (
            /* FIX: this row was previously forced to a hardcoded 3-column
               inline style, which always overrides CSS and therefore
               ignored every responsive breakpoint. That squeezed each
               hotspot panel's BarChart rows (label / track / value) down
               to almost nothing on narrower screens, so only the
               truncated municipality label was visible. Using the
               ".an-three-col" class alone lets dashboard.css's responsive
               rules (2 columns at <=1024px, 1 column at <=768px) apply. */
            <div className="an-three-col">
              <Panel title="Hotspot analysis — Birth records" sub="Municipalities with concentrated birth registrations">
                <BarChart
                  rows={[...munis]
                    .sort((a, b) => b.Birth - a.Birth)
                    .slice(0, 10)
                    .map((r) => ({ label: r.name, count: r.Birth, color: COLORS.birth }))}
                  colorKey="color" valueKey="count" labelKey="label"
                />
              </Panel>
              <Panel title="Hotspot analysis — Marriage records" sub="Municipalities with the most marriage registrations">
                <BarChart
                  rows={[...munis]
                    .sort((a, b) => b.Marriage - a.Marriage)
                    .slice(0, 10)
                    .map((r) => ({ label: r.name, count: r.Marriage, color: COLORS.marriage }))}
                  colorKey="color" valueKey="count" labelKey="label"
                />
              </Panel>
              <Panel title="Hotspot analysis — Death records" sub="Municipalities with the highest death registrations">
                <BarChart
                  rows={[...munis]
                    .sort((a, b) => b.Death - a.Death)
                    .slice(0, 10)
                    .map((r) => ({ label: r.name, count: r.Death, color: COLORS.death }))}
                  colorKey="color" valueKey="count" labelKey="label"
                />
              </Panel>
            </div>
          )}
        </div>
      )}

      {tab === "growth" && (
        <div className="an-tab-content">
          <div className="an-kpi-grid">
            <MetricCard
              label="This month vs last"
              value={momDisplay}
              sub={momLabel}
              accent={momAccent}
              trend={last12Growth.map((r) => r.count)}
            />
            <MetricCard
              label="Last month MoM"
              value={prevMomDisplay}
              sub={prevMomLabel}
              accent="#64748b"
            />
            <MetricCard
              label="Months tracked"
              value={fmtNum(growth.length)}
              sub="Historical request periods"
              accent={COLORS.birth}
            />
            <MetricCard
              label="Highest month"
              value={growth.length ? fmtNum(Math.max(...growth.map((r) => r.count))) : "—"}
              sub="Peak request volume period"
              accent={COLORS.marriage}
            />
          </div>

          <Panel
            full
            title="Monthly request volume trend"
            sub={
              growthPeriod
                ? `All civil registry request types combined with per-type breakdown · ${growthPeriod}`
                : "All civil registry request types combined with per-type breakdown"
            }
          >
            {growthSeries.length ? (
              <LineChart series={growthSeries} labels={growthLabels} height={240} showLegend />
            ) : <Empty />}
          </Panel>

          <Panel
            full
            title={last12Period ? `Month-over-month growth rate — ${last12Period}` : "Month-over-month growth rate"}
            sub="Positive = more requests than previous month · negative = fewer requests"
          >
            {growth.length ? <GrowthTable rows={growth} /> : <Empty />}
          </Panel>
        </div>
      )}

      {tab === "today" && (
        <div className="an-tab-content">
          <Panel full title="Today's activity" sub="Current business day window (6 AM rollover)">
            <TodayPanel today={today} />
          </Panel>

          {today.requests_breakdown?.length > 0 && (
            <div className="an-two-col">
              <Panel title="Requests breakdown" sub="Certificate types requested today">
                <BarChart
                  rows={(today.requests_breakdown || []).map((r) => ({
                    label: r.label,
                    count: r.count,
                    color: {
                      Birth:        COLORS.birth,
                      Marriage:     COLORS.marriage,
                      Death:        COLORS.death,
                      Verification: COLORS.verification,
                    }[r.label] || "#64748b",
                  }))}
                  colorKey="color" valueKey="count" labelKey="label"
                />
              </Panel>
              <Panel title="Revenue by type" sub="Payment amounts collected today per document type">
                <BarChart
                  rows={(today.payments_breakdown || []).map((r) => ({
                    label: r.label,
                    count: r.amount,
                    color: {
                      Birth:    COLORS.birth,
                      Marriage: COLORS.marriage,
                      Death:    COLORS.death,
                    }[r.label] || "#64748b",
                  }))}
                  colorKey="color" valueKey="count" labelKey="label"
                />
              </Panel>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AnalyticsDashboard;