// src/offline/adapters/analyticsFromSnapshot.js
const ARRAYS = {
  birth: ["birth_active", "birth_archived"],
  marriage: ["marriage_active", "marriage_archived"],
  death: ["death_active", "death_archived"],
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function buildAnalyticsFromSnapshot(snapshot = {}) {
  const rowsOf = (type) => ARRAYS[type].flatMap((k) => snapshot[k] || []);

  const counts = {
    birth: rowsOf("birth").length,
    marriage: rowsOf("marriage").length,
    death: rowsOf("death").length,
  };

  const yearMap = {};
  const byMonth = MONTH_NAMES.map((name, i) => ({
    month_num: i + 1,
    month_name: name,
    count: 0,
  }));

  for (const type of Object.keys(ARRAYS)) {
    for (const r of rowsOf(type)) {
      // Same date source as the backend: uploaded_at (local time, YYYY-MM-...)
      const m = /^(\d{4})-(\d{2})/.exec(r.uploaded_at || "");
      if (!m) continue;
      const year = Number(m[1]);
      const month = Number(m[2]);
      yearMap[year] = (yearMap[year] || 0) + 1;
      byMonth[month - 1].count += 1;
    }
  }

  const total = counts.birth + counts.marriage + counts.death;

  return {
    summary: {
      total_records: total,
      total_birth_records: counts.birth,
      total_marriage_records: counts.marriage,
      total_death_records: counts.death,
      uploaded_today: 0,
      uploaded_today_breakdown: { birth: 0, marriage: 0, death: 0 },
    },
    byYear: Object.entries(yearMap)
      .sort(([a], [b]) => a - b)
      .map(([year, count]) => ({ year: Number(year), count })),
    byMonth,
  };
}