import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  forwardRef,
} from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { pushToast } from "../../services/toastService";
import { fetchResidents } from "../../services/demographicsService";
import {
  AGE_GROUPS,
  DEMOGRAPHIC_TYPES,
  DEMO_STATS,
  EMPLOYMENT_FILTERS,
  VOTING_FILTERS,
  aggregateByBarangay,
  filterRecords,
  formatPercent,
  prepareResidents,
  sumStats,
} from "../../utils/demographics";
import "./Heatmaps.css";
import "./HeatmapsDemographics.css";

const RAW_BARANGAY_DATA = [
  { name: "Barangay I (Poblacion)", birth: 240, marriage: 95, death: 55 },
  { name: "Barangay II (Poblacion)", birth: 225, marriage: 88, death: 50 },
  { name: "Prosperidad", birth: 265, marriage: 88, death: 40 },
  { name: "Barangay III (Poblacion)", birth: 198, marriage: 70, death: 45 },
  { name: "Barangay IV (Poblacion)", birth: 180, marriage: 65, death: 40 },
  { name: "Quezon", birth: 205, marriage: 60, death: 30 },
  { name: "Barangay V (Poblacion)", birth: 165, marriage: 58, death: 35 },
  { name: "San Juan (Sipaway)", birth: 210, marriage: 45, death: 32 },
  { name: "Barangay VI (Poblacion)", birth: 150, marriage: 50, death: 30 },
  { name: "Rizal", birth: 190, marriage: 52, death: 28 },
  { name: "Guadalupe", birth: 155, marriage: 38, death: 24 },
  { name: "Punao", birth: 175, marriage: 40, death: 25 },
  { name: "Codcod", birth: 140, marriage: 35, death: 22 },
  { name: "Ermita (Sipaway)", birth: 130, marriage: 30, death: 20 },
  { name: "Bagonbon", birth: 120, marriage: 28, death: 18 },
  { name: "Buluangan", birth: 110, marriage: 25, death: 16 },
  { name: "Nataban", birth: 95, marriage: 20, death: 14 },
  { name: "Palampas", birth: 0, marriage: 0, death: 0 },
];

const BARANGAY_NAMES = RAW_BARANGAY_DATA.map((b) => b.name);

const BARANGAY_COORDS = {
  "Bagonbon": { lat: 10.5820, lng: 123.3989 },
  "Barangay I (Poblacion)": { lat: 10.4939, lng: 123.4273 },
  "Barangay II (Poblacion)": { lat: 10.4842, lng: 123.4111 },
  "Barangay III (Poblacion)": { lat: 10.4844, lng: 123.4236 },
  "Barangay IV (Poblacion)": { lat: 10.4826, lng: 123.4172 },
  "Barangay V (Poblacion)": { lat: 10.4792, lng: 123.4127 },
  "Barangay VI (Poblacion)": { lat: 10.4800, lng: 123.4222 },
  "Buluangan": { lat: 10.3874, lng: 123.3376 },
  "Codcod": { lat: 10.4574, lng: 123.2173 },
  "Ermita (Sipaway)": { lat: 10.4435, lng: 123.4186 },
  "Guadalupe": { lat: 10.4541, lng: 123.3696 },
  "Nataban": { lat: 10.4973, lng: 123.3049 },
  "Palampas": { lat: 10.5135, lng: 123.4106 },
  "Prosperidad": { lat: 10.5122, lng: 123.2785 },
  "Punao": { lat: 10.5305, lng: 123.4329 },
  "Quezon": { lat: 10.4360, lng: 123.2604 },
  "Rizal": { lat: 10.4970, lng: 123.3599 },
  "San Juan (Sipaway)": { lat: 10.4627, lng: 123.4398 },
};

const POBLACION_ORDER = [
  "Barangay I (Poblacion)",
  "Barangay II (Poblacion)",
  "Barangay III (Poblacion)",
  "Barangay IV (Poblacion)",
  "Barangay V (Poblacion)",
  "Barangay VI (Poblacion)",
];
const POBLACION_SHORT = { 0: "I", 1: "II", 2: "III", 3: "IV", 4: "V", 5: "VI" };

const REFERENCE_POINTS = [
  { label: "Calatrava", lat: 10.60, lng: 123.48, kind: "town" },
  { label: "Don Salvador Benedicto", lat: 10.55056, lng: 123.23639, kind: "town" },
  { label: "Tañon Strait", lat: 10.49, lng: 123.52, kind: "water" },
];

const CITY_BOUNDS = (() => {
  const lats = Object.values(BARANGAY_COORDS).map((c) => c.lat);
  const lngs = Object.values(BARANGAY_COORDS).map((c) => c.lng);
  const latPad = (Math.max(...lats) - Math.min(...lats)) * 0.35;
  const lngPad = (Math.max(...lngs) - Math.min(...lngs)) * 0.35;
  return L.latLngBounds(
    [Math.min(...lats) - latPad, Math.min(...lngs) - lngPad],
    [Math.max(...lats) + latPad, Math.max(...lngs) + lngPad]
  );
})();
const CITY_CENTER = CITY_BOUNDS.getCenter();

const YEAR_MULTIPLIERS = { "2024": 0.82, "2025": 0.91, "2026": 1 };

const TREND_MONTHS_BASE = [
  { label: "Jan", birth: 480, death: 90 },
  { label: "Feb", birth: 510, death: 82 },
  { label: "Mar", birth: 470, death: 95 },
  { label: "Apr", birth: 560, death: 88 },
  { label: "May", birth: 620, death: 101 },
];

const HEAT_SCALE = [
  { max: 150, label: "0 - 150 (Very Low)", color: "#bcd0fb", text: "#1c2233" },
  { max: 250, label: "151 - 250 (Low)", color: "#8fb0f7", text: "#1c2233" },
  { max: 350, label: "251 - 350 (Moderate)", color: "#5f8bf0", text: "#1c2233" },
  { max: 450, label: "351 - 450 (High)", color: "#2e5fe8", text: "#ffffff" },
  { max: Infinity, label: "450 and above (Very High)", color: "#1a3a9c", text: "#ffffff" },
];

const NO_DATA_COLOR = "#9aa2b5";
const ALL_BARANGAYS = "All Barangays";
const VIEW_CIVIL = "civil";
const VIEW_DEMOGRAPHICS = "demographics";

const CERT_TYPES = ["All Certificates", "Live Birth", "Marriage", "Death"];
const YEARS = ["2024", "2025", "2026"];

const CBMS_RECORDS = [
  { id: "CR-0001", name: "Juan Dela Cruz", barangay: "Barangay I (Poblacion)", recordType: "Live Birth", age: 34, philSysId: true, philSysNo: "6304-XXXX-XXXX", seniorCitizen: false, pwd: false, fourPs: true },
  { id: "CR-0002", name: "Maria Santos", barangay: "Prosperidad", recordType: "Marriage", age: 29, philSysId: true, philSysNo: "6217-XXXX-XXXX", seniorCitizen: false, pwd: false, fourPs: false },
  { id: "CR-0003", name: "Pedro Reyes", barangay: "San Juan (Sipaway)", recordType: "Death", age: 78, philSysId: false, philSysNo: null, seniorCitizen: true, pwd: false, fourPs: false },
  { id: "CR-0004", name: "Ana Bautista", barangay: "Barangay II (Poblacion)", recordType: "Live Birth", age: 26, philSysId: true, philSysNo: "6112-XXXX-XXXX", seniorCitizen: false, pwd: false, fourPs: true },
  { id: "CR-0005", name: "Jose Ramirez", barangay: "Quezon", recordType: "Marriage", age: 41, philSysId: false, philSysNo: null, seniorCitizen: false, pwd: false, fourPs: false },
  { id: "CR-0006", name: "Rosario Villanueva", barangay: "Rizal", recordType: "Death", age: 82, philSysId: true, philSysNo: "6098-XXXX-XXXX", seniorCitizen: true, pwd: true, fourPs: false },
  { id: "CR-0007", name: "Antonio Garcia", barangay: "Barangay III (Poblacion)", recordType: "Live Birth", age: 31, philSysId: true, philSysNo: "6255-XXXX-XXXX", seniorCitizen: false, pwd: false, fourPs: false },
  { id: "CR-0008", name: "Luz Fernandez", barangay: "Guadalupe", recordType: "Marriage", age: 38, philSysId: false, philSysNo: null, seniorCitizen: false, pwd: false, fourPs: true },
  { id: "CR-0009", name: "Ricardo Mendoza", barangay: "Punao", recordType: "Death", age: 69, philSysId: true, philSysNo: "6301-XXXX-XXXX", seniorCitizen: true, pwd: false, fourPs: false },
  { id: "CR-0010", name: "Corazon Aquino-Diaz", barangay: "Codcod", recordType: "Live Birth", age: 24, philSysId: true, philSysNo: "6144-XXXX-XXXX", seniorCitizen: false, pwd: false, fourPs: false },
  { id: "CR-0011", name: "Eduardo Torres", barangay: "Ermita (Sipaway)", recordType: "Marriage", age: 45, philSysId: false, philSysNo: null, seniorCitizen: false, pwd: true, fourPs: false },
  { id: "CR-0012", name: "Teresita Flores", barangay: "Bagonbon", recordType: "Death", age: 74, philSysId: true, philSysNo: "6087-XXXX-XXXX", seniorCitizen: true, pwd: false, fourPs: false },
  { id: "CR-0013", name: "Manuel Cruz", barangay: "Buluangan", recordType: "Live Birth", age: 28, philSysId: false, philSysNo: null, seniorCitizen: false, pwd: false, fourPs: true },
  { id: "CR-0014", name: "Estrella Navarro", barangay: "Barangay IV (Poblacion)", recordType: "Marriage", age: 33, philSysId: true, philSysNo: "6209-XXXX-XXXX", seniorCitizen: false, pwd: false, fourPs: false },
  { id: "CR-0015", name: "Fernando Castillo", barangay: "Barangay V (Poblacion)", recordType: "Death", age: 71, philSysId: true, philSysNo: "6033-XXXX-XXXX", seniorCitizen: true, pwd: false, fourPs: false },
  { id: "CR-0016", name: "Gloria Pascual", barangay: "Barangay VI (Poblacion)", recordType: "Live Birth", age: 22, philSysId: false, philSysNo: null, seniorCitizen: false, pwd: false, fourPs: true },
];

const ID_FILTERS = [
  { value: "all", label: "All PhilSys Status" },
  { value: "with", label: "Has PhilSys ID" },
  { value: "without", label: "No PhilSys ID" },
];

function heatColor(value) {
  return HEAT_SCALE.find((b) => value <= b.max).color;
}

function heatTextColor(value) {
  return HEAT_SCALE.find((b) => value <= b.max).text;
}

function buildDemoScale(maxValue) {
  const step = Math.max(Math.floor(maxValue / 5), 1);
  const lastIndex = HEAT_SCALE.length - 1;

  return HEAT_SCALE.map((s, i) => {
    const isLast = i === lastIndex;
    const lower = i === 0 ? 0 : step * i + 1;
    const upper = isLast ? Infinity : step * (i + 1);
    let label;
    if (isLast) {
      label = `${lower} and above`;
    } else if (lower === upper) {
      label = `${lower}`;
    } else {
      label = `${lower} - ${upper}`;
    }
    return { ...s, max: upper, label };
  });
}

function colorForScale(scale, value) {
  return scale.find((b) => value <= b.max).color;
}

function metricValue(b, certType) {
  if (certType === "Live Birth") return b.birth;
  if (certType === "Marriage") return b.marriage;
  if (certType === "Death") return b.death;
  return b.total;
}

function metricLabel(certType) {
  if (certType === "Live Birth") return "Live Birth Records";
  if (certType === "Marriage") return "Marriage Records";
  if (certType === "Death") return "Death Records";
  return "Total Records";
}

function niceStep(raw) {
  const safe = Math.max(raw, 1);
  const pow = Math.pow(10, Math.floor(Math.log10(safe)));
  const n = safe / pow;
  const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return m * pow;
}

function buildPopup(title, rows) {
  const body = rows
    .map(
      (r) =>
        `<div class="hm-popup__row${r.total ? " hm-popup__row--total" : ""}"><span>${r.label}</span><b>${r.value.toLocaleString()}</b></div>`
    )
    .join("");
  return `<div class="hm-popup"><div class="hm-popup__title">${title}</div>${body}</div>`;
}

function StatCard({ icon, label, value, sub, tone, active, dim }) {
  return (
    <div
      className={
        "stat-card stat-card--" +
        tone +
        (active ? " stat-card--active" : "") +
        (dim ? " stat-card--dim" : "")
      }
    >
      <div className="stat-card__icon">{icon}</div>
      <div className="stat-card__body">
        <span className="stat-card__value">{value.toLocaleString()}</span>
        <span className="stat-card__label">{label}</span>
        {sub && <span className="stat-card__sub">{sub}</span>}
      </div>
    </div>
  );
}

function DonutChart({ slices, size = 148, stroke = 26 }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  let offsetAcc = 0;

  return (
    <svg className="donut" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {slices.map((s) => {
        const fraction = s.value / total;
        const dash = fraction * circumference;
        const gap = circumference - dash;
        const rotation = (offsetAcc / total) * 360 - 90;
        offsetAcc += s.value;
        return (
          <circle
            key={s.label}
            r={radius}
            cx={size / 2}
            cy={size / 2}
            fill="transparent"
            stroke={s.color}
            strokeWidth={stroke}
            strokeDasharray={`${dash} ${gap}`}
            strokeLinecap="butt"
            opacity={s.dimmed ? 0.28 : 1}
            transform={`rotate(${rotation} ${size / 2} ${size / 2})`}
            style={{ transition: "opacity 0.15s ease" }}
          />
        );
      })}
      <text x="50%" y="47%" textAnchor="middle" className="donut__total">
        {total.toLocaleString()}
      </text>
      <text x="50%" y="62%" textAnchor="middle" className="donut__caption">
        Total Records
      </text>
    </svg>
  );
}

function CoverageRing({ pct, size = 46, stroke = 6 }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (Math.min(Math.max(pct, 0), 100) / 100) * circumference;
  const c = size / 2;

  return (
    <svg
      className="coverage__ring"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`${pct}% of barangays reporting`}
    >
      <circle className="coverage__ring-track" cx={c} cy={c} r={radius} strokeWidth={stroke} />
      <circle
        className="coverage__ring-fill"
        cx={c}
        cy={c}
        r={radius}
        strokeWidth={stroke}
        strokeDasharray={`${dash} ${circumference - dash}`}
        strokeLinecap="butt"
        transform={`rotate(-90 ${c} ${c})`}
      />
      <text x={c} y={c} textAnchor="middle" dominantBaseline="central" className="coverage__ring-text">
        {pct}%
      </text>
    </svg>
  );
}

function TrendChart({ data, height = 190 }) {
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(420);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const update = () => {
      const w = Math.round(el.getBoundingClientRect().width);
      if (w > 0) setWidth(w);
    };
    update();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const padL = 34;
  const padR = 12;
  const padT = 12;
  const padB = 26;
  const plotW = Math.max(width - padL - padR, 1);
  const plotH = height - padT - padB;

  const rawMax = Math.max(...data.flatMap((d) => [d.birth, d.death]));
  const step = niceStep(rawMax / 4);
  const maxVal = step * 4;
  const ticks = [0, 1, 2, 3, 4].map((i) => i * step);

  const stepX = data.length > 1 ? plotW / (data.length - 1) : 0;
  const xFor = (i) => padL + i * stepX;
  const yFor = (v) => padT + plotH - (v / maxVal) * plotH;

  const pointsFor = (key) => data.map((d, i) => `${xFor(i)},${yFor(d[key])}`).join(" ");

  return (
    <div ref={wrapRef} className="trend-chart-wrap">
      <svg
        className="trend-chart"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Monthly live birth and death records"
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={padL}
              x2={width - padR}
              y1={yFor(t)}
              y2={yFor(t)}
              className={t === 0 ? "trend-chart__baseline" : "trend-chart__grid"}
            />
            <text x={padL - 8} y={yFor(t)} textAnchor="end" dominantBaseline="central" className="trend-chart__tick">
              {t}
            </text>
          </g>
        ))}

        <polyline points={pointsFor("birth")} className="trend-chart__line trend-chart__line--birth" />
        <polyline points={pointsFor("death")} className="trend-chart__line trend-chart__line--death" />

        {data.map((d, i) => (
          <g key={d.label}>
            <circle cx={xFor(i)} cy={yFor(d.birth)} r="4" className="trend-chart__dot trend-chart__dot--birth" />
            <circle cx={xFor(i)} cy={yFor(d.death)} r="4" className="trend-chart__dot trend-chart__dot--death" />
            <text x={xFor(i)} y={height - 8} textAnchor="middle" className="trend-chart__axis">
              {d.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function DemographicDetail({ name, stats, onClose }) {
  return (
    <div className="demo-detail">
      <div className="demo-detail__header">
        <div>
          <span className="coverage__title">{name}</span>
          <span className="coverage__sub">
            All residents · {stats.total.toLocaleString()} total population
          </span>
        </div>
        <button className="link-btn" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="demo-detail__rows">
        {DEMO_STATS.filter((s) => s.key !== "total").map((s) => {
          const width = stats.total > 0 ? (stats[s.key] / stats.total) * 100 : 0;
          return (
            <div className="demo-detail__row" key={s.key}>
              <div className="demo-detail__meta">
                <span>{s.label}</span>
                <b>
                  {stats[s.key].toLocaleString()} <i>({formatPercent(stats[s.key], stats.total)}%)</i>
                </b>
              </div>
              <div className="top5__bar-track">
                <div className="top5__bar-fill" style={{ width: `${width}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const BarangayMap = forwardRef(function BarangayMap({ items, activeBarangay, onSelect }, ref) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersLayerRef = useRef(null);

  useImperativeHandle(ref, () => ({
    zoomIn: () => mapRef.current && mapRef.current.zoomIn(),
    zoomOut: () => mapRef.current && mapRef.current.zoomOut(),
    reset: () => mapRef.current && mapRef.current.fitBounds(CITY_BOUNDS, { animate: true }),
  }));

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return undefined;

    const map = L.map(containerRef.current, {
      center: CITY_CENTER,
      zoom: 12,
      minZoom: 11,
      maxZoom: 17,
      maxBounds: CITY_BOUNDS.pad(0.15),
      maxBoundsViscosity: 1.0,
      zoomControl: false,
      scrollWheelZoom: true,
      attributionControl: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      subdomains: ["a", "b", "c"],
    }).addTo(map);

    map.fitBounds(CITY_BOUNDS, { animate: false });

    L.rectangle(CITY_BOUNDS, {
      color: "#2e5fe8",
      weight: 1.5,
      dashArray: "6 5",
      fill: false,
      interactive: false,
    }).addTo(map);

    L.control.scale({ position: "bottomleft", imperial: false }).addTo(map);

    REFERENCE_POINTS.forEach((p) => {
      const icon = L.divIcon({
        className: "ref-point-icon",
        html: `<span class="ref-point-icon__label ref-point-icon__label--${p.kind}">${p.label}</span>`,
        iconSize: [0, 0],
      });
      L.marker([p.lat, p.lng], { icon, interactive: false }).addTo(map);
    });

    markersLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = markersLayerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();

    const maxVal = Math.max(...items.map((item) => item.value), 1);

    items.forEach((item) => {
      const coords = BARANGAY_COORDS[item.name];
      if (!coords) return;

      const poblacionIndex = POBLACION_ORDER.indexOf(item.name);
      const tooltipTitle = poblacionIndex >= 0 ? POBLACION_SHORT[poblacionIndex] : item.name;
      const isActive = activeBarangay === item.name;
      const baseRadius = item.hasData ? 9 + (item.value / maxVal) * 11 : 7;

      if (isActive) {
        L.circleMarker([coords.lat, coords.lng], {
          radius: baseRadius + 7,
          color: "#2e5fe8",
          weight: 2,
          fill: false,
          interactive: false,
        }).addTo(layer);
      }

      const marker = L.circleMarker([coords.lat, coords.lng], {
        radius: baseRadius,
        color: "#ffffff",
        weight: 2,
        fillColor: item.color,
        fillOpacity: 0.92,
      }).addTo(layer);

      marker.bindTooltip(`<b>${tooltipTitle}</b><br/>${item.tooltip}`, {
        direction: "top",
        offset: [0, -baseRadius],
        opacity: 0.95,
        className: "hm-tooltip",
      });

      marker.bindPopup(item.popup);
      marker.on("click", () => onSelect(item.name));
      layer.addLayer(marker);
    });
  }, [items, activeBarangay, onSelect]);

  return <div ref={containerRef} className="leaflet-map-surface" role="img" aria-label="Map of San Carlos City barangays" />;
});

export default function Heatmaps() {
  const [viewMode, setViewMode] = useState(VIEW_CIVIL);
  const [certType, setCertType] = useState("All Certificates");
  const [year, setYear] = useState("2026");
  const [activeBarangay, setActiveBarangay] = useState(null);
  const [showLateReg, setShowLateReg] = useState(false);
  const mapControlRef = useRef(null);

  const [demoType, setDemoType] = useState("total");
  const [ageGroup, setAgeGroup] = useState("all");
  const [employment, setEmployment] = useState("all");
  const [voting, setVoting] = useState("all");
  const [residentRows, setResidentRows] = useState([]);
  const [residentStatus, setResidentStatus] = useState("idle");

  const [cbmsBarangayFilter, setCbmsBarangayFilter] = useState("Follow Map Selection");
  const [cbmsIdFilter, setCbmsIdFilter] = useState("all");
  const [cbmsSeniorOnly, setCbmsSeniorOnly] = useState(false);
  const [cbmsPwdOnly, setCbmsPwdOnly] = useState(false);
  const [cbmsFourPsOnly, setCbmsFourPsOnly] = useState(false);

  const isDemo = viewMode === VIEW_DEMOGRAPHICS;

  const loadResidents = useCallback(async () => {
    setResidentStatus("loading");
    try {
      const rows = await fetchResidents();
      setResidentRows(rows);
      setResidentStatus("ready");
    } catch (err) {
      console.error("Resident load failed:", err);
      setResidentStatus("error");
      pushToast({
        title: "Could not load residents",
        message: "Resident profiling records could not be retrieved. Please try again.",
        success: false,
      });
    }
  }, []);

  useEffect(() => {
    if (isDemo && residentStatus === "idle") {
      loadResidents();
    }
  }, [isDemo, residentStatus, loadResidents]);

  const barangayData = useMemo(() => {
    const mult = YEAR_MULTIPLIERS[year] ?? 1;
    return RAW_BARANGAY_DATA.map((b) => {
      const birth = Math.round(b.birth * mult);
      const marriage = Math.round(b.marriage * mult);
      const death = Math.round(b.death * mult);
      const total = birth + marriage + death;
      return { ...b, birth, marriage, death, total, hasRecords: total > 0 };
    });
  }, [year]);

  const sorted = useMemo(
    () => [...barangayData].sort((a, b) => metricValue(b, certType) - metricValue(a, certType)),
    [barangayData, certType]
  );

  const totals = useMemo(() => {
    const birth = barangayData.reduce((s, b) => s + b.birth, 0);
    const marriage = barangayData.reduce((s, b) => s + b.marriage, 0);
    const death = barangayData.reduce((s, b) => s + b.death, 0);
    return { birth, marriage, death, all: birth + marriage + death };
  }, [barangayData]);

  const lateReg = useMemo(
    () => ({
      birth: Math.round(totals.birth * 0.07),
      marriage: Math.round(totals.marriage * 0.03),
      death: Math.round(totals.death * 0.055),
    }),
    [totals]
  );

  const trendMonths = useMemo(() => {
    const mult = YEAR_MULTIPLIERS[year] ?? 1;
    return TREND_MONTHS_BASE.map((m) => ({
      label: m.label,
      birth: Math.round(m.birth * mult),
      death: Math.round(m.death * mult),
    }));
  }, [year]);

  const classified = useMemo(() => prepareResidents(residentRows, BARANGAY_NAMES), [residentRows]);

  const allStatsByBarangay = useMemo(
    () => aggregateByBarangay(classified.records, BARANGAY_NAMES),
    [classified]
  );

  const filteredStatsByBarangay = useMemo(
    () =>
      aggregateByBarangay(
        filterRecords(classified.records, { ageGroup, employment, voting }),
        BARANGAY_NAMES
      ),
    [classified, ageGroup, employment, voting]
  );

  const demoTypeLabel = DEMOGRAPHIC_TYPES.find((t) => t.value === demoType).label;

  const demoRows = useMemo(
    () =>
      BARANGAY_NAMES.map((name) => {
        const stats = filteredStatsByBarangay[name];
        return {
          name,
          stats,
          value: stats[demoType],
          hasData: allStatsByBarangay[name].total > 0,
        };
      }).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name)),
    [filteredStatsByBarangay, allStatsByBarangay, demoType]
  );

  const demoTotals = useMemo(
    () => sumStats(Object.values(filteredStatsByBarangay)),
    [filteredStatsByBarangay]
  );

  const demoScale = useMemo(
    () => buildDemoScale(Math.max(...demoRows.map((r) => r.value), 0)),
    [demoRows]
  );

  const demoScope = activeBarangay ? filteredStatsByBarangay[activeBarangay] : demoTotals;
  const demoSelected = activeBarangay ? demoRows.find((r) => r.name === activeBarangay) : null;

  const mapItems = useMemo(() => {
    if (isDemo) {
      return demoRows.map((r) => ({
        name: r.name,
        value: r.value,
        hasData: r.hasData,
        color: r.hasData ? colorForScale(demoScale, r.value) : NO_DATA_COLOR,
        tooltip: r.hasData
          ? `${r.value.toLocaleString()} ${demoTypeLabel.toLowerCase()}`
          : "No resident records yet",
        popup: buildPopup(r.name, [
          ...DEMO_STATS.filter((s) => s.key !== "total").map((s) => ({
            label: s.label,
            value: r.stats[s.key],
          })),
          { label: "Total Population", value: r.stats.total, total: true },
        ]),
      }));
    }

    return sorted.map((b) => {
      const val = metricValue(b, certType);
      return {
        name: b.name,
        value: val,
        hasData: b.hasRecords,
        color: b.hasRecords ? heatColor(val) : NO_DATA_COLOR,
        tooltip: b.hasRecords ? `${val} ${metricLabel(certType).toLowerCase()}` : "No records yet",
        popup: buildPopup(b.name, [
          { label: "Live Birth", value: b.birth },
          { label: "Marriage", value: b.marriage },
          { label: "Death", value: b.death },
          { label: "Total", value: b.total, total: true },
        ]),
      };
    });
  }, [isDemo, demoRows, demoScale, demoTypeLabel, sorted, certType]);

  const rankedList = useMemo(
    () =>
      isDemo
        ? demoRows.map((r) => ({ name: r.name, value: r.value }))
        : sorted.map((b) => ({ name: b.name, value: metricValue(b, certType) })),
    [isDemo, demoRows, sorted, certType]
  );

  const top5 = rankedList.slice(0, 5);
  const maxTop5 = top5.length > 0 ? top5[0].value || 1 : 1;

  const selectedBarangay = activeBarangay ? sorted.find((b) => b.name === activeBarangay) : null;

  const reportingBarangays = useMemo(() => sorted.filter((b) => b.hasRecords), [sorted]);
  const pendingBarangays = useMemo(() => sorted.filter((b) => !b.hasRecords), [sorted]);
  const coveragePct = ((reportingBarangays.length / barangayData.length) * 100).toFixed(0);

  const cbmsStats = useMemo(() => {
    const total = CBMS_RECORDS.length;
    const withPhilSys = CBMS_RECORDS.filter((r) => r.philSysId).length;
    const seniors = CBMS_RECORDS.filter((r) => r.seniorCitizen).length;
    const pwd = CBMS_RECORDS.filter((r) => r.pwd).length;
    const fourPs = CBMS_RECORDS.filter((r) => r.fourPs).length;
    return {
      total,
      withPhilSys,
      philSysPct: total ? ((withPhilSys / total) * 100).toFixed(0) : "0",
      seniors,
      pwd,
      fourPs,
    };
  }, []);

  const effectiveCbmsBarangay =
    cbmsBarangayFilter === "Follow Map Selection"
      ? activeBarangay
      : cbmsBarangayFilter === ALL_BARANGAYS
      ? null
      : cbmsBarangayFilter;

  const filteredCbms = useMemo(() => {
    return CBMS_RECORDS.filter((r) => {
      if (effectiveCbmsBarangay && r.barangay !== effectiveCbmsBarangay) return false;
      if (cbmsIdFilter === "with" && !r.philSysId) return false;
      if (cbmsIdFilter === "without" && r.philSysId) return false;
      if (cbmsSeniorOnly && !r.seniorCitizen) return false;
      if (cbmsPwdOnly && !r.pwd) return false;
      if (cbmsFourPsOnly && !r.fourPs) return false;
      return true;
    });
  }, [effectiveCbmsBarangay, cbmsIdFilter, cbmsSeniorOnly, cbmsPwdOnly, cbmsFourPsOnly]);

  const handleSelectBarangay = useCallback(
    (name) => {
      if (isDemo) {
        if (residentStatus !== "ready") return;
        if (!allStatsByBarangay[name].total) {
          pushToast({
            title: "No resident records",
            message: `${name} has no resident profiling records.`,
            success: false,
            duration: 3500,
          });
          return;
        }
      } else {
        const b = barangayData.find((x) => x.name === name);
        if (!b || !b.hasRecords) {
          pushToast({
            title: "No records yet",
            message: `${name} has no submitted civil registry records for ${year}.`,
            success: false,
            duration: 3500,
          });
          return;
        }
      }
      setActiveBarangay((prev) => (prev === name ? null : name));
    },
    [isDemo, residentStatus, allStatsByBarangay, barangayData, year]
  );

  function downloadCsv(csv, filename) {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleExport() {
    try {
      const header = ["No", "Barangay", "Birth", "Marriage", "Death", "Total Records", "% of Total"];
      const rows = sorted.map((b, i) => [
        i + 1,
        `"${b.name}"`,
        b.birth,
        b.marriage,
        b.death,
        b.total,
        `${((b.total / totals.all) * 100).toFixed(2)}%`,
      ]);
      const meta = [`Certificate Type,${certType}`, `Year,${year}`, `Generated,${new Date().toLocaleString()}`, ""];
      const csv = [...meta, header.join(","), ...rows.map((r) => r.join(","))].join("\n");

      const filename = `heatmaps-report-${year}-${certType.replace(/\s+/g, "_")}.csv`;
      downloadCsv(csv, filename);

      pushToast({
        title: "Report downloaded!",
        message: `${filename} · ${certType}, ${year}`,
        success: true,
        duration: 3000,
      });
    } catch (err) {
      console.error("Export failed:", err);
      pushToast({
        title: "Export failed",
        message: "Something went wrong while generating the report. Please try again.",
        success: false,
      });
    }
  }

  function handleExportDemographics() {
    try {
      if (residentStatus !== "ready" || classified.records.length === 0) {
        pushToast({
          title: "Nothing to export",
          message: "No resident records are available to export.",
          success: false,
        });
        return;
      }

      const header = ["No", "Barangay", ...DEMO_STATS.map((s) => s.label)];
      const rows = demoRows.map((r, i) => [
        i + 1,
        `"${r.name}"`,
        ...DEMO_STATS.map((s) => r.stats[s.key]),
      ]);
      const meta = [
        `Demographic Type,${demoTypeLabel}`,
        `Age Group,${AGE_GROUPS.find((f) => f.value === ageGroup).label}`,
        `Employment,${EMPLOYMENT_FILTERS.find((f) => f.value === employment).label}`,
        `Voting,${VOTING_FILTERS.find((f) => f.value === voting).label}`,
        `Generated,"${new Date().toLocaleString()}"`,
        "",
      ];
      const csv = [...meta, header.join(","), ...rows.map((r) => r.join(","))].join("\n");
      const filename = `heatmaps-demographics-${demoType}.csv`;
      downloadCsv(csv, filename);

      pushToast({
        title: "Report downloaded!",
        message: `${filename} · ${demoTypeLabel}`,
        success: true,
        duration: 3000,
      });
    } catch (err) {
      console.error("Demographics export failed:", err);
      pushToast({
        title: "Export failed",
        message: "Something went wrong while generating the report. Please try again.",
        success: false,
      });
    }
  }

  function handleExportCbms() {
    try {
      if (filteredCbms.length === 0) {
        pushToast({
          title: "Nothing to export",
          message: "No CBMS × PSA records match the current filters.",
          success: false,
        });
        return;
      }
      const header = [
        "ID",
        "Name",
        "Barangay",
        "Record Type",
        "Age",
        "PhilSys ID",
        "PhilSys No.",
        "Senior Citizen",
        "PWD",
        "4Ps Beneficiary",
      ];
      const rows = filteredCbms.map((r) => [
        r.id,
        `"${r.name}"`,
        `"${r.barangay}"`,
        r.recordType,
        r.age,
        r.philSysId ? "Yes" : "No",
        r.philSysNo || "—",
        r.seniorCitizen ? "Yes" : "No",
        r.pwd ? "Yes" : "No",
        r.fourPs ? "Yes" : "No",
      ]);
      const meta = [
        `Barangay Filter,${effectiveCbmsBarangay || ALL_BARANGAYS}`,
        `PhilSys Filter,${ID_FILTERS.find((f) => f.value === cbmsIdFilter)?.label}`,
        `Generated,${new Date().toLocaleString()}`,
        "",
      ];
      const csv = [...meta, header.join(","), ...rows.map((r) => r.join(","))].join("\n");
      const filename = `cbms-psa-crossref-${(effectiveCbmsBarangay || "all-barangays").replace(/\s+/g, "_")}.csv`;
      downloadCsv(csv, filename);

      pushToast({
        title: "CBMS list downloaded!",
        message: `${filename} · ${filteredCbms.length} record(s)`,
        success: true,
        duration: 3000,
      });
    } catch (err) {
      console.error("CBMS export failed:", err);
      pushToast({
        title: "Export failed",
        message: "Something went wrong while generating the CBMS list. Please try again.",
        success: false,
      });
    }
  }

  function handleToggleLateReg() {
    setShowLateReg((v) => {
      const next = !v;
      if (next) {
        pushToast({
          title: "Late registration loaded",
          message: `Showing late-registered records for ${year}.`,
          success: true,
          duration: 2500,
        });
      }
      return next;
    });
  }

  function clearCbmsFilters() {
    setCbmsBarangayFilter(ALL_BARANGAYS);
    setCbmsIdFilter("all");
    setCbmsSeniorOnly(false);
    setCbmsPwdOnly(false);
    setCbmsFourPsOnly(false);
  }

  const mapTitle = isDemo ? demoTypeLabel : metricLabel(certType);
  const legendScale = isDemo ? demoScale : HEAT_SCALE;

  let legendHint;
  if (isDemo) {
    legendHint = demoSelected
      ? `${demoSelected.name}: ${demoSelected.value.toLocaleString()} ${demoTypeLabel.toLowerCase()} (${formatPercent(
          demoSelected.value,
          demoTotals[demoType]
        )}% of citywide). Click again to clear.`
      : "Click a barangay marker to highlight it in the table and see its full demographic breakdown below.";
  } else {
    legendHint = selectedBarangay
      ? `${selectedBarangay.name}: ${selectedBarangay.birth} birth, ${selectedBarangay.marriage} marriage, ${selectedBarangay.death} death, ${selectedBarangay.total} total (${((selectedBarangay.total / totals.all) * 100).toFixed(1)}% of citywide). Click again to clear.`
      : "Click a barangay marker to highlight it in the table and see its breakdown here.";
  }

  let demoNotice = null;
  if (isDemo) {
    if (residentStatus === "loading" || residentStatus === "idle") {
      demoNotice = { tone: "info", text: "Loading resident records…" };
    } else if (residentStatus === "error") {
      demoNotice = { tone: "error", text: "Resident records could not be loaded.", retry: true };
    } else if (classified.records.length === 0) {
      demoNotice = { tone: "info", text: "No resident records are available for the Heatmap yet." };
    }
  }

  return (
    <div className="heatmaps">
      <header className="heatmaps__header">
        <div>
          <h1>Heatmaps</h1>
          <p>
            {isDemo
              ? "Demographic distribution of residents per barangay"
              : "Geographic distribution of civil registry records per barangay"}
          </p>
        </div>

        <div className="heatmaps__filters">
          <div className="filter">
            <span>View</span>
            <div className="toggle-row">
              <button
                className={`toggle-chip${!isDemo ? " toggle-chip--active" : ""}`}
                onClick={() => setViewMode(VIEW_CIVIL)}
              >
                Civil Registry
              </button>
              <button
                className={`toggle-chip${isDemo ? " toggle-chip--active" : ""}`}
                onClick={() => setViewMode(VIEW_DEMOGRAPHICS)}
              >
                Demographics
              </button>
            </div>
          </div>

          {isDemo ? (
            <>
              <label className="filter">
                <span>Demographic Type</span>
                <select value={demoType} onChange={(e) => setDemoType(e.target.value)}>
                  {DEMOGRAPHIC_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="filter">
                <span>Barangay</span>
                <select
                  value={activeBarangay || ALL_BARANGAYS}
                  onChange={(e) => setActiveBarangay(e.target.value === ALL_BARANGAYS ? null : e.target.value)}
                >
                  <option value={ALL_BARANGAYS}>{ALL_BARANGAYS}</option>
                  {BARANGAY_NAMES.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="filter">
                <span>Age Group</span>
                <select value={ageGroup} onChange={(e) => setAgeGroup(e.target.value)}>
                  {AGE_GROUPS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="filter">
                <span>Employment Status</span>
                <select value={employment} onChange={(e) => setEmployment(e.target.value)}>
                  {EMPLOYMENT_FILTERS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="filter">
                <span>Voting Status</span>
                <select value={voting} onChange={(e) => setVoting(e.target.value)}>
                  {VOTING_FILTERS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : (
            <>
              <label className="filter">
                <span>Certificate Type</span>
                <select value={certType} onChange={(e) => setCertType(e.target.value)}>
                  {CERT_TYPES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>

              <label className="filter">
                <span>Year</span>
                <select value={year} onChange={(e) => setYear(e.target.value)}>
                  {YEARS.map((y) => (
                    <option key={y}>{y}</option>
                  ))}
                </select>
              </label>

              <div className="filter">
                <span>Date Range</span>
                <div className="filter__range">Jan 1, {year} – May 30, {year}</div>
              </div>
            </>
          )}

          <button className="btn-primary" onClick={isDemo ? handleExportDemographics : handleExport}>
            <ExportIcon /> Export Report
          </button>
        </div>
      </header>

      <section className="heatmaps__top">
        <div className="card heat-card">
          <div className="card__header">
            <div>
              <h2>{mapTitle} per Barangay</h2>
              <p className="card__subtitle">
                {isDemo
                  ? "San Carlos City, Negros Occidental (Resident Profiling)"
                  : `San Carlos City, Negros Occidental (${year})`}
              </p>
            </div>
            <div className="zoom-controls">
              <button onClick={() => mapControlRef.current?.zoomIn()} aria-label="Zoom in" title="Zoom in">
                +
              </button>
              <button onClick={() => mapControlRef.current?.zoomOut()} aria-label="Zoom out" title="Zoom out">
                −
              </button>
              <button
                className="zoom-controls__reset"
                onClick={() => mapControlRef.current?.reset()}
                aria-label="Reset map view"
              >
                Reset view
              </button>
            </div>
          </div>

          {demoNotice && (
            <div className={`demo-status${demoNotice.tone === "error" ? " demo-status--error" : ""}`}>
              <span>{demoNotice.text}</span>
              {demoNotice.retry && (
                <button className="link-btn" onClick={loadResidents}>
                  Retry
                </button>
              )}
            </div>
          )}

          <div className="heat-grid-wrap">
            <BarangayMap
              ref={mapControlRef}
              items={mapItems}
              activeBarangay={activeBarangay}
              onSelect={handleSelectBarangay}
            />
          </div>
          <p className="heat-map-note">
            Live OpenStreetMap basemap, panning/zoom restricted to San Carlos City, Negros Occidental. Click a
            barangay marker to select it, or click the map marker again for full details.
          </p>

          <div className="legend">
            <span className="legend__title">Legend ({mapTitle})</span>
            <div className="legend__items">
              {legendScale.map((s) => (
                <div className="legend__item" key={s.label}>
                  <i style={{ background: s.color }} />
                  {s.label}
                </div>
              ))}
              <div className="legend__item">
                <i style={{ background: NO_DATA_COLOR }} />
                {isDemo ? "No Resident Records" : "No Records Yet"}
              </div>
            </div>
            <p className="legend__hint">{legendHint}</p>
          </div>

          {isDemo ? (
            activeBarangay && (
              <DemographicDetail
                name={activeBarangay}
                stats={allStatsByBarangay[activeBarangay]}
                onClose={() => setActiveBarangay(null)}
              />
            )
          ) : (
            <div className="coverage">
              <div className="coverage__summary">
                <CoverageRing pct={Number(coveragePct)} />
                <div>
                  <span className="coverage__title">Barangay Reporting Coverage</span>
                  <span className="coverage__sub">
                    {reportingBarangays.length} of {barangayData.length} barangays have submitted civil registry
                    records{pendingBarangays.length > 0 ? `, ${pendingBarangays.length} pending` : ""}
                  </span>
                </div>
              </div>

              <div className="coverage__group">
                <span className="coverage__label">
                  <i className="coverage__dot coverage__dot--reporting" />
                  Areas with records ({reportingBarangays.length})
                </span>
                <div className="coverage__chips">
                  {reportingBarangays.map((b) => (
                    <button
                      key={b.name}
                      className={`chip chip--reporting${activeBarangay === b.name ? " chip--active" : ""}`}
                      onClick={() => handleSelectBarangay(b.name)}
                      title={`View ${b.name} in the table below`}
                    >
                      {b.name}
                    </button>
                  ))}
                </div>
              </div>

              {pendingBarangays.length > 0 && (
                <div className="coverage__group">
                  <span className="coverage__label">
                    <i className="coverage__dot coverage__dot--pending" />
                    Not yet reporting ({pendingBarangays.length})
                  </span>
                  <div className="coverage__chips">
                    {pendingBarangays.map((b) => (
                      <button
                        key={b.name}
                        className="chip chip--pending"
                        onClick={() => handleSelectBarangay(b.name)}
                        title={`${b.name} has no submitted records`}
                      >
                        {b.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="heat-card__side">
          {isDemo ? (
            <>
              <div className="stat-grid">
                {DEMO_STATS.map((s) => (
                  <StatCard
                    key={s.key}
                    tone="demo"
                    icon={s.key === "voting" || s.key === "nonVoting" ? <VoteIcon /> : <UsersIcon />}
                    label={s.label}
                    value={demoScope[s.key]}
                    sub={
                      s.key === "total"
                        ? activeBarangay || ALL_BARANGAYS
                        : `${formatPercent(demoScope[s.key], demoScope.total)}% of total`
                    }
                    active={demoType === s.key}
                    dim={demoType !== "total" && demoType !== s.key}
                  />
                ))}
              </div>

              <div className="card table-card">
                <div className="card__header">
                  <h2>Demographics Breakdown per Barangay</h2>
                </div>
                <div className="table-scroll">
                  <table className="demo-table">
                    <thead>
                      <tr>
                        <th>No</th>
                        <th>Barangay</th>
                        {DEMO_STATS.map((s) => (
                          <th key={s.key} className={`num${demoType === s.key ? " th--highlight" : ""}`}>
                            {s.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {demoRows.map((r, i) => (
                        <tr
                          key={r.name}
                          className={activeBarangay === r.name ? "row--active" : ""}
                          onClick={() => handleSelectBarangay(r.name)}
                        >
                          <td>{i + 1}</td>
                          <td>{r.name}</td>
                          {DEMO_STATS.map((s) => (
                            <td
                              key={s.key}
                              className={`num${demoType === s.key ? " cell--highlight" : s.key === "total" ? " cell--strong" : ""}`}
                            >
                              {r.stats[s.key].toLocaleString()}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="table-footnote">
                  Showing {demoRows.length} of {demoRows.length} barangays, sorted by {demoTypeLabel.toLowerCase()}
                  {classified.skipped > 0
                    ? ` · ${classified.skipped.toLocaleString()} resident record(s) skipped (missing barangay or age)`
                    : ""}
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="stat-grid">
                <StatCard
                  tone="total"
                  icon={<UsersIcon />}
                  label="Total Records"
                  value={totals.all}
                  sub="All Certificates"
                  active={certType === "All Certificates"}
                />
                <StatCard
                  tone="birth"
                  icon={<BirthIcon />}
                  label="Live Birth Records"
                  value={totals.birth}
                  sub={`${((totals.birth / totals.all) * 100).toFixed(2)}% of total`}
                  active={certType === "Live Birth"}
                  dim={certType !== "All Certificates" && certType !== "Live Birth"}
                />
                <StatCard
                  tone="marriage"
                  icon={<MarriageIcon />}
                  label="Marriage Records"
                  value={totals.marriage}
                  sub={`${((totals.marriage / totals.all) * 100).toFixed(2)}% of total`}
                  active={certType === "Marriage"}
                  dim={certType !== "All Certificates" && certType !== "Marriage"}
                />
                <StatCard
                  tone="death"
                  icon={<DeathIcon />}
                  label="Death Records"
                  value={totals.death}
                  sub={`${((totals.death / totals.all) * 100).toFixed(2)}% of total`}
                  active={certType === "Death"}
                  dim={certType !== "All Certificates" && certType !== "Death"}
                />
              </div>

              <div className="card table-card">
                <div className="card__header">
                  <h2>Records Breakdown per Barangay</h2>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>No</th>
                        <th>Barangay</th>
                        <th className={`num${certType === "Live Birth" ? " th--highlight" : ""}`}>Birth</th>
                        <th className={`num${certType === "Marriage" ? " th--highlight" : ""}`}>Marriage</th>
                        <th className={`num${certType === "Death" ? " th--highlight" : ""}`}>Death</th>
                        <th className="num">Total Records</th>
                        <th className="num">% of Total</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((b, i) => (
                        <tr
                          key={b.name}
                          className={activeBarangay === b.name ? "row--active" : ""}
                          onClick={() => handleSelectBarangay(b.name)}
                        >
                          <td>{i + 1}</td>
                          <td>{b.name}</td>
                          <td className={`num${certType === "Live Birth" ? " cell--highlight" : ""}`}>{b.birth}</td>
                          <td className={`num${certType === "Marriage" ? " cell--highlight" : ""}`}>{b.marriage}</td>
                          <td className={`num${certType === "Death" ? " cell--highlight" : ""}`}>{b.death}</td>
                          <td className="num cell--strong">{b.total}</td>
                          <td className="num">
                            <span
                              className="pct-pill"
                              style={{ background: heatColor(b.total), color: heatTextColor(b.total) }}
                            >
                              {((b.total / totals.all) * 100).toFixed(2)}%
                            </span>
                          </td>
                          <td>
                            {b.hasRecords ? (
                              <span className="status-pill status-pill--yes">Has Records</span>
                            ) : (
                              <span className="status-pill status-pill--no">No Records</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="table-footnote">
                  Showing {sorted.length} of {sorted.length} barangays, sorted by {metricLabel(certType).toLowerCase()}
                </p>
              </div>
            </>
          )}
        </div>
      </section>

      <section className="heatmaps__cbms">
        <div className="card cbms-card">
          <div className="card__header">
            <div>
              <h2>CBMS × PSA Cross-Reference</h2>
              <p className="card__subtitle">
                Community-Based Monitoring System profiles matched against PSA PhilSys civil registration data
              </p>
            </div>
            <button className="btn-secondary" onClick={handleExportCbms}>
              <ExportIcon /> Export List
            </button>
          </div>

          <div className="cbms-stats">
            <div className="cbms-stat">
              <span className="cbms-stat__value">{cbmsStats.total}</span>
              <span className="cbms-stat__label">Individuals Matched</span>
            </div>
            <div className="cbms-stat cbms-stat--accent">
              <span className="cbms-stat__value">{cbmsStats.philSysPct}%</span>
              <span className="cbms-stat__label">Have a PhilSys ID</span>
            </div>
            <div className="cbms-stat">
              <span className="cbms-stat__value">{cbmsStats.seniors}</span>
              <span className="cbms-stat__label">Senior Citizens</span>
            </div>
            <div className="cbms-stat">
              <span className="cbms-stat__value">{cbmsStats.pwd}</span>
              <span className="cbms-stat__label">PWD</span>
            </div>
            <div className="cbms-stat">
              <span className="cbms-stat__value">{cbmsStats.fourPs}</span>
              <span className="cbms-stat__label">4Ps Beneficiaries</span>
            </div>
          </div>

          <div className="cbms-filters">
            <label className="filter">
              <span>Barangay</span>
              <select value={cbmsBarangayFilter} onChange={(e) => setCbmsBarangayFilter(e.target.value)}>
                <option>Follow Map Selection</option>
                <option>{ALL_BARANGAYS}</option>
                {barangayData.map((b) => (
                  <option key={b.name}>{b.name}</option>
                ))}
              </select>
            </label>

            <label className="filter">
              <span>PhilSys ID</span>
              <select value={cbmsIdFilter} onChange={(e) => setCbmsIdFilter(e.target.value)}>
                {ID_FILTERS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="filter">
              <span>Quick Filters</span>
              <div className="toggle-row">
                <button
                  className={`toggle-chip${cbmsSeniorOnly ? " toggle-chip--active" : ""}`}
                  onClick={() => setCbmsSeniorOnly((v) => !v)}
                >
                  Senior Citizen
                </button>
                <button
                  className={`toggle-chip${cbmsPwdOnly ? " toggle-chip--active" : ""}`}
                  onClick={() => setCbmsPwdOnly((v) => !v)}
                >
                  PWD
                </button>
                <button
                  className={`toggle-chip${cbmsFourPsOnly ? " toggle-chip--active" : ""}`}
                  onClick={() => setCbmsFourPsOnly((v) => !v)}
                >
                  4Ps Beneficiary
                </button>
              </div>
            </div>

            <button className="link-btn cbms-clear" onClick={clearCbmsFilters}>
              Clear filters
            </button>
          </div>

          {effectiveCbmsBarangay && (
            <p className="cbms-scope">
              Showing individuals in <b>{effectiveCbmsBarangay}</b> only.{" "}
              <button className="link-btn" onClick={() => setCbmsBarangayFilter(ALL_BARANGAYS)}>
                View all barangays
              </button>
            </p>
          )}

          <div className="table-scroll cbms-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Barangay</th>
                  <th>Record Type</th>
                  <th className="num">Age</th>
                  <th>PhilSys ID</th>
                  <th>Tags</th>
                </tr>
              </thead>
              <tbody>
                {filteredCbms.map((r) => (
                  <tr key={r.id}>
                    <td className="cell--muted">{r.id}</td>
                    <td className="cell--strong">{r.name}</td>
                    <td>{r.barangay}</td>
                    <td>{r.recordType}</td>
                    <td className="num">{r.age}</td>
                    <td>
                      {r.philSysId ? (
                        <span className="id-badge id-badge--yes" title={r.philSysNo}>
                          ✓ {r.philSysNo}
                        </span>
                      ) : (
                        <span className="id-badge id-badge--no">No ID on file</span>
                      )}
                    </td>
                    <td>
                      <div className="tag-row">
                        {r.seniorCitizen && <span className="tag tag--senior">Senior</span>}
                        {r.pwd && <span className="tag tag--pwd">PWD</span>}
                        {r.fourPs && <span className="tag tag--fourps">4Ps</span>}
                        {!r.seniorCitizen && !r.pwd && !r.fourPs && <span className="tag tag--none">—</span>}
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredCbms.length === 0 && (
                  <tr>
                    <td colSpan={7} className="cbms-empty">
                      No individuals match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="table-footnote">
            Showing {filteredCbms.length} of {CBMS_RECORDS.length} matched individuals
          </p>
        </div>
      </section>

      <section className="heatmaps__bottom">
        <div className="card">
          <h2>Records Distribution by Type</h2>
          <div className="donut-wrap">
            <DonutChart
              slices={[
                {
                  label: "Live Birth",
                  value: totals.birth,
                  color: "#16a34a",
                  dimmed: certType !== "All Certificates" && certType !== "Live Birth",
                },
                {
                  label: "Marriage",
                  value: totals.marriage,
                  color: "#f59e0b",
                  dimmed: certType !== "All Certificates" && certType !== "Marriage",
                },
                {
                  label: "Death",
                  value: totals.death,
                  color: "#e11d48",
                  dimmed: certType !== "All Certificates" && certType !== "Death",
                },
              ]}
            />
            <ul className="donut-legend">
              <li className={certType === "Live Birth" ? "donut-legend__item--active" : ""}>
                <i style={{ background: "#16a34a" }} />
                Live Birth <b>{totals.birth.toLocaleString()}</b>
                <span>{((totals.birth / totals.all) * 100).toFixed(2)}%</span>
              </li>
              <li className={certType === "Marriage" ? "donut-legend__item--active" : ""}>
                <i style={{ background: "#f59e0b" }} />
                Marriage <b>{totals.marriage.toLocaleString()}</b>
                <span>{((totals.marriage / totals.all) * 100).toFixed(2)}%</span>
              </li>
              <li className={certType === "Death" ? "donut-legend__item--active" : ""}>
                <i style={{ background: "#e11d48" }} />
                Death <b>{totals.death.toLocaleString()}</b>
                <span>{((totals.death / totals.all) * 100).toFixed(2)}%</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="card">
          <h2>Top 5 Barangays by {mapTitle}</h2>
          <div className="top5">
            {top5.map((b, i) => (
              <div className="top5__row" key={b.name}>
                <span className="top5__rank">{i + 1}</span>
                <span className="top5__name">{b.name}</span>
                <div className="top5__bar-track">
                  <div className="top5__bar-fill" style={{ width: `${(b.value / maxTop5) * 100}%` }} />
                </div>
                <span className="top5__value">{b.value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card__header">
            <h2>Records Trend (Monthly)</h2>
            <div className="trend-legend">
              <span>
                <i className="dot dot--birth" /> Live Birth
              </span>
              <span>
                <i className="dot dot--death" /> Death
              </span>
            </div>
          </div>
          <TrendChart data={trendMonths} />
        </div>

        <div className="card about-card">
          <div className="about-card__title">
            <InfoIcon /> About Heatmaps
          </div>
          <p>
            The Heatmaps tool shows the total number of civil registry records — Live Birth, Marriage, and Death —
            per barangay on a single view. Click a barangay to see its detailed breakdown and analytics.
          </p>
          <div className="about-card__note">
            <NoteIcon />
            Note: Late registration is shown separately from on-time records.
          </div>
          <button className="link-btn" onClick={handleToggleLateReg}>
            {showLateReg ? "Hide late registration" : "View late registration"}
          </button>

          {showLateReg && (
            <div className="late-reg">
              <div className="late-reg__row">
                <span>Live Birth</span>
                <b>{lateReg.birth.toLocaleString()}</b>
                <span className="late-reg__pct">
                  {totals.birth ? ((lateReg.birth / totals.birth) * 100).toFixed(1) : "0.0"}% of type
                </span>
              </div>
              <div className="late-reg__row">
                <span>Marriage</span>
                <b>{lateReg.marriage.toLocaleString()}</b>
                <span className="late-reg__pct">
                  {totals.marriage ? ((lateReg.marriage / totals.marriage) * 100).toFixed(1) : "0.0"}% of type
                </span>
              </div>
              <div className="late-reg__row">
                <span>Death</span>
                <b>{lateReg.death.toLocaleString()}</b>
                <span className="late-reg__pct">
                  {totals.death ? ((lateReg.death / totals.death) * 100).toFixed(1) : "0.0"}% of type
                </span>
              </div>
              <div className="late-reg__total">
                {(lateReg.birth + lateReg.marriage + lateReg.death).toLocaleString()} late-registered records in{" "}
                {year}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function ExportIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3v12m0-12 4 4m-4-4-4 4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function UsersIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path
        d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M11 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8ZM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function VoteIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="2" />
      <path d="m8 12 3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function BirthIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2" />
      <path d="M6 21c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function MarriageIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <circle cx="8" cy="14" r="5" stroke="currentColor" strokeWidth="2" />
      <circle cx="16" cy="14" r="5" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
function DeathIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 2 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6l-8-4Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M9 12h6M12 9v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function InfoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M12 11v6M12 7v.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function NoteIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}