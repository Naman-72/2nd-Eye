import { formatMs } from "./url_utils.js";
import {
  getLocalDayKey,
  getDayKeys,
  getDayBucket,
  bucketToJson,
  bucketToCsv,
  downloadText
} from "./storage.js";

const todayKeyEl = document.getElementById("todayKey");
const totalTimeEl = document.getElementById("totalTime");
const urlCountEl = document.getElementById("urlCount");
const topTimeEl = document.getElementById("topTime");

const searchEl = document.getElementById("search");
const emptyEl = document.getElementById("empty");
const listCardEl = document.getElementById("listCard");
const rowsEl = document.getElementById("rows");

const daySelectEl = document.getElementById("daySelect");
const exportJsonBtn = document.getElementById("exportJson");
const exportCsvBtn = document.getElementById("exportCsv");

let selectedDayKey = getLocalDayKey(Date.now());
let allEntries = [];
let currentBucket = {};

function safeText(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function parseUrlParts(url) {
  try {
    const u = new URL(url);
    return { host: u.host, sub: (u.pathname || "/") + (u.search || "") };
  } catch {
    return { host: url, sub: "" };
  }
}

function faviconFor(url) {
  return `chrome://favicon/size/32/${url}`;
}

function renderList(entries) {
  if (!entries.length) {
    listCardEl.classList.add("hidden");
    emptyEl.classList.remove("hidden");
    rowsEl.innerHTML = "";
    return;
  }

  emptyEl.classList.add("hidden");
  listCardEl.classList.remove("hidden");

  rowsEl.innerHTML = entries
    .map(({ url, ms, host, sub }) => {
      const title = safeText(url);
      return `
        <div class="row" title="${title}">
          <div class="timeCell">${formatMs(ms)}</div>
          <div class="urlCell">
            <div class="urlTextWrap">
              <div class="urlMain">${safeText(host)}</div>
              <div class="urlSub">${safeText(sub)}</div>
            </div>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderSummary(entries) {
  const total = entries.reduce((acc, e) => acc + e.ms, 0);
  totalTimeEl.textContent = formatMs(total);
  urlCountEl.textContent = String(entries.length);
  topTimeEl.textContent = entries.length ? formatMs(entries[0].ms) : "00:00:00";
}

function rebuildEntriesFromBucket(bucket) {
  return Object.entries(bucket)
    .map(([url, ms]) => {
      const { host, sub } = parseUrlParts(url);
      return { url, ms, host, sub };
    })
    .filter((x) => Number.isFinite(x.ms) && x.ms > 0)
    .sort((a, b) => b.ms - a.ms);
}

function applyFilter() {
  const q = (searchEl.value || "").trim().toLowerCase();
  if (!q) {
    renderSummary(allEntries);
    renderList(allEntries);
    return;
  }

  const filtered = allEntries.filter((e) => e.url.toLowerCase().includes(q));
  renderSummary(allEntries); // keep total stable for the day
  renderList(filtered);
}

async function populateDaySelect() {
  const keys = await getDayKeys(30);
  const today = getLocalDayKey(Date.now());

  const options = keys.includes(today) ? keys : [today, ...keys];

  daySelectEl.innerHTML = options
    .map((k) => `<option value="${k}">${k}${k === today ? " (Today)" : ""}</option>`)
    .join("");

  daySelectEl.value = selectedDayKey;
}

async function loadDay(dayKey) {
  selectedDayKey = dayKey;
  todayKeyEl.textContent = dayKey;

  currentBucket = await getDayBucket(dayKey);
  allEntries = rebuildEntriesFromBucket(currentBucket);

  renderSummary(allEntries);
  applyFilter();
}

// Exports
exportJsonBtn.addEventListener("click", () => {
  const json = bucketToJson(selectedDayKey, currentBucket);
  downloadText(`time-tracker_${selectedDayKey}.json`, json, "application/json");
});

exportCsvBtn.addEventListener("click", () => {
  const csv = bucketToCsv(selectedDayKey, currentBucket);
  downloadText(`time-tracker_${selectedDayKey}.csv`, csv, "text/csv");
});

// Day change
daySelectEl.addEventListener("change", async () => {
  searchEl.value = "";
  await loadDay(daySelectEl.value);
});

// Search
searchEl.addEventListener("input", applyFilter);

// Init
(async function init() {
  selectedDayKey = getLocalDayKey(Date.now());
  await populateDaySelect();
  await loadDay(selectedDayKey);
})();
