const STATE_KEY = "tt_state_v1";
const DATA_KEY = "tt_data_v1";

// Data model:
// tt_data_v1 = {
//   "YYYY-MM-DD": {
//     "https://example.com/path?x=1": 12345,   // ms
//     ...
//   },
//   ...
// }
//
// tt_state_v1 = {
//   activeTabId: number|null,
//   activeWindowId: number|null,
//   activeUrl: string|null,
//   startedAt: number|null,        // epoch ms
//   windowFocused: boolean
// }

export async function getState() {
  const res = await chrome.storage.local.get([STATE_KEY]);
  return res[STATE_KEY] || {
    activeTabId: null,
    activeWindowId: null,
    activeUrl: null,
    startedAt: null,
    windowFocused: false
  };
}

export async function setState(state) {
  await chrome.storage.local.set({ [STATE_KEY]: state });
}

export async function getAllData() {
  const res = await chrome.storage.local.get([DATA_KEY]);
  return res[DATA_KEY] || {};
}

export async function setAllData(data) {
  await chrome.storage.local.set({ [DATA_KEY]: data });
}

export function getLocalDayKey(epochMs = Date.now()) {
  const d = new Date(epochMs);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function daysBetween(dayA, dayB) {
  // day keys are "YYYY-MM-DD"
  const a = new Date(dayA + "T00:00:00");
  const b = new Date(dayB + "T00:00:00");
  return Math.round((b - a) / (24 * 3600 * 1000));
}

export async function addTime(dayKey, url, deltaMs) {
  if (!dayKey || !url || !Number.isFinite(deltaMs) || deltaMs <= 0) return;

  const data = await getAllData();
  if (!data[dayKey]) data[dayKey] = {};
  data[dayKey][url] = (data[dayKey][url] || 0) + deltaMs;

  await setAllData(data);
}

export async function cleanupOldDays(retainDays = 31) {
  const data = await getAllData();
  const today = getLocalDayKey(Date.now());
  const keys = Object.keys(data);

  for (const dayKey of keys) {
    const age = daysBetween(dayKey, today); // positive if dayKey < today
    if (age > retainDays) {
      delete data[dayKey];
    }
  }
  await setAllData(data);
}


export async function getDayKeys(limitDays = 30) {
  const data = await getAllData();
  const keys = Object.keys(data);
  keys.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0)); // latest first
  return keys.slice(0, limitDays);
}

export async function getDayBucket(dayKey) {
  const data = await getAllData();
  return data[dayKey] || {};
}

export function bucketToJson(dayKey, bucket) {
  return JSON.stringify({ day: dayKey, entries: bucket }, null, 2);
}

export function bucketToCsv(dayKey, bucket) {
  const rows = [["day", "url", "ms"]];
  for (const [url, ms] of Object.entries(bucket)) rows.push([dayKey, url, String(ms)]);

  const esc = (v) => {
    const s = String(v ?? "");
    return /[\n\r",]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };

  return rows.map((r) => r.map(esc).join(",")).join("\n");
}

export function downloadText(filename, text, mime = "text/plain") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}
