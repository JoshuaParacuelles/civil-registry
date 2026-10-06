export const DEMOGRAPHIC_TYPES = [
  { value: "total", label: "Total Population" },
  { value: "child", label: "Non-working Dependent Children" },
  { value: "nonWorkingAdult", label: "Non-working Adults" },
  { value: "workingAdult", label: "Working Adults" },
  { value: "nonWorkingSenior", label: "Non-working Seniors" },
  { value: "workingSenior", label: "Working Seniors" },
  { value: "voting", label: "Voting Population" },
  { value: "nonVoting", label: "Non-voting Population" },
];

export const DEMO_STATS = [
  { key: "total", label: "Total Population" },
  { key: "child", label: "Dependent Children" },
  { key: "workingAdult", label: "Working Adults" },
  { key: "nonWorkingAdult", label: "Non-working Adults" },
  { key: "workingSenior", label: "Working Seniors" },
  { key: "nonWorkingSenior", label: "Non-working Seniors" },
  { key: "voting", label: "Voting" },
  { key: "nonVoting", label: "Non-voting" },
];

export const AGE_GROUPS = [
  { value: "all", label: "All Ages" },
  { value: "children", label: "Children (0–17)" },
  { value: "adults", label: "Adults (18–59)" },
  { value: "seniors", label: "Seniors (60+)" },
];

export const EMPLOYMENT_FILTERS = [
  { value: "all", label: "All Employment" },
  { value: "working", label: "Working" },
  { value: "non-working", label: "Non-working" },
];

export const VOTING_FILTERS = [
  { value: "all", label: "All Voting Status" },
  { value: "voting", label: "Voting" },
  { value: "non-voting", label: "Non-voting" },
];

const VOTING_AGE = 18;
const SENIOR_AGE = 60;
const MAX_AGE = 120;

const WORKING_VALUES = new Set(["working", "employed", "self-employed", "self employed", "yes", "true", "1"]);
const VOTING_VALUES = new Set(["voting", "voter", "registered", "registered voter", "eligible", "qualified", "yes", "true", "1"]);

const ROMAN_NUMERALS = { 1: "i", 2: "ii", 3: "iii", 4: "iv", 5: "v", 6: "vi" };

function toKey(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function normalizeBarangayKey(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^brgy\b\s*/, "barangay ")
    .replace(/^barangay\s+(\d)$/, (_, digit) => `barangay ${ROMAN_NUMERALS[digit] ?? digit}`);
}

export function resolveAge(row, today = new Date()) {
  const dobValue = row.date_of_birth ?? row.birthdate ?? row.birth_date;

  if (dobValue) {
    const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dobValue));
    let year;
    let month;
    let day;

    if (isoMatch) {
      year = Number(isoMatch[1]);
      month = Number(isoMatch[2]) - 1;
      day = Number(isoMatch[3]);
    } else {
      const parsed = new Date(dobValue);
      if (!Number.isNaN(parsed.getTime())) {
        year = parsed.getFullYear();
        month = parsed.getMonth();
        day = parsed.getDate();
      }
    }

    if (year !== undefined) {
      let age = today.getFullYear() - year;
      if (today.getMonth() < month || (today.getMonth() === month && today.getDate() < day)) {
        age -= 1;
      }
      return age >= 0 && age <= MAX_AGE ? age : null;
    }
  }

  const rawAge = row.age;
  if (rawAge !== null && rawAge !== undefined && rawAge !== "" && Number.isFinite(Number(rawAge))) {
    const age = Math.floor(Number(rawAge));
    return age >= 0 && age <= MAX_AGE ? age : null;
  }

  return null;
}

export function emptyStats() {
  return {
    total: 0,
    child: 0,
    workingAdult: 0,
    nonWorkingAdult: 0,
    workingSenior: 0,
    nonWorkingSenior: 0,
    voting: 0,
    nonVoting: 0,
  };
}

function classify(age, working) {
  if (age < VOTING_AGE) return "child";
  if (age < SENIOR_AGE) return working ? "workingAdult" : "nonWorkingAdult";
  return working ? "workingSenior" : "nonWorkingSenior";
}

function ageGroupOf(age) {
  if (age < VOTING_AGE) return "children";
  if (age < SENIOR_AGE) return "adults";
  return "seniors";
}

export function prepareResidents(rows, barangayNames) {
  const keyToName = new Map(barangayNames.map((name) => [normalizeBarangayKey(name), name]));
  const today = new Date();
  const records = [];
  let skipped = 0;

  rows.forEach((row) => {
    const barangay = keyToName.get(normalizeBarangayKey(row.barangay ?? row.barangay_name));
    const age = resolveAge(row, today);

    if (!barangay || age === null) {
      skipped += 1;
      return;
    }

    const isAdultAge = age >= VOTING_AGE;
    const working = isAdultAge && WORKING_VALUES.has(toKey(row.employment_status));
    const voting = isAdultAge && VOTING_VALUES.has(toKey(row.voting_status ?? row.voter_status));

    records.push({
      barangay,
      ageGroup: ageGroupOf(age),
      category: classify(age, working),
      working,
      voting,
    });
  });

  return { records, skipped };
}

export function filterRecords(records, { ageGroup, employment, voting }) {
  return records.filter((record) => {
    if (ageGroup !== "all" && record.ageGroup !== ageGroup) return false;
    if (employment === "working" && !record.working) return false;
    if (employment === "non-working" && record.working) return false;
    if (voting === "voting" && !record.voting) return false;
    if (voting === "non-voting" && record.voting) return false;
    return true;
  });
}

export function aggregateByBarangay(records, barangayNames) {
  const result = {};
  barangayNames.forEach((name) => {
    result[name] = emptyStats();
  });

  records.forEach((record) => {
    const stats = result[record.barangay];
    stats.total += 1;
    stats[record.category] += 1;
    if (record.voting) {
      stats.voting += 1;
    } else {
      stats.nonVoting += 1;
    }
  });

  return result;
}

export function sumStats(statsList) {
  return statsList.reduce((acc, stats) => {
    Object.keys(acc).forEach((key) => {
      acc[key] += stats[key];
    });
    return acc;
  }, emptyStats());
}

export function formatPercent(part, total) {
  return total > 0 ? ((part / total) * 100).toFixed(1) : "0.0";
}