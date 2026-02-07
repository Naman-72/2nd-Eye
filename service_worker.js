import { normalizeUrl, isTrackableUrl } from "./url_utils.js";
import { addTime, cleanupOldDays, getLocalDayKey, getState, setState } from "./storage.js";

function now() {
  return Date.now();
}

function isSameDay(tsA, tsB) {
  return getLocalDayKey(tsA) === getLocalDayKey(tsB);
}

function dayStartEpoch(dayKey) {
  return new Date(dayKey + "T00:00:00").getTime();
}

async function stopAndCommit(reason = "unknown") {
  const state = await getState();
  if (!state.startedAt || !state.activeUrl) {
    return;
  }

  const end = now();
  const start = state.startedAt;
  if (end <= start) {
    await setState({ ...state, startedAt: null });
    return;
  }

  // Split across midnight if needed
  if (isSameDay(start, end)) {
    const dayKey = getLocalDayKey(start);
    await addTime(dayKey, state.activeUrl, end - start);
  } else {
    // Commit from start -> end of start-day, then start of end-day -> end
    const startDayKey = getLocalDayKey(start);
    const endDayKey = getLocalDayKey(end);

    const startDayEnd = dayStartEpoch(endDayKey); // midnight of end day
    const firstChunk = Math.max(0, startDayEnd - start);
    const secondChunk = Math.max(0, end - startDayEnd);

    if (firstChunk > 0) await addTime(startDayKey, state.activeUrl, firstChunk);
    if (secondChunk > 0) await addTime(endDayKey, state.activeUrl, secondChunk);
  }

  await cleanupOldDays(31);

  // Clear startedAt (but keep activeUrl/tab ids; next start will reset)
  await setState({ ...state, startedAt: null });
}

async function startIfEligible(tab, windowFocused, windowId) {
  if (!windowFocused) return;

  if (!tab || typeof tab.id !== "number") return;
  if (!tab.url) return;

  if (!isTrackableUrl(tab.url)) return;

  const normalized = normalizeUrl(tab.url);
  if (!normalized) return;

  const state = await getState();

  // Start a new session
  await setState({
    ...state,
    activeTabId: tab.id,
    activeWindowId: windowId ?? tab.windowId ?? state.activeWindowId,
    activeUrl: normalized,
    startedAt: now(),
    windowFocused: true
  });
}

async function transitionTo(tab, windowFocused, windowId, reason) {
  // Stop current session, then possibly start new one
  await stopAndCommit(reason);
  await startIfEligible(tab, windowFocused, windowId);
}

async function getCurrentActiveTabInWindow(windowId) {
  try {
    const tabs = await chrome.tabs.query({ active: true, windowId });
    return tabs?.[0] || null;
  } catch {
    return null;
  }
}

// On install/startup, initialize focus state + active tab
chrome.runtime.onInstalled.addListener(async () => {
  await cleanupOldDays(31);

  const win = await chrome.windows.getLastFocused({ populate: true }).catch(() => null);
  const focused = !!win?.focused;
  const tab = win?.tabs?.find((t) => t.active) || null;

  // Ensure we don't carry stale running timer across install
  await setState({
    activeTabId: tab?.id ?? null,
    activeWindowId: win?.id ?? null,
    activeUrl: tab?.url ? normalizeUrl(tab.url) : null,
    startedAt: null,
    windowFocused: focused
  });

  if (focused && tab) {
    await startIfEligible(tab, true, win.id);
  }
});

// Active tab changed
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const state = await getState();
  const focused = state.windowFocused && activeInfo.windowId === state.activeWindowId;

  const tab = await chrome.tabs.get(activeInfo.tabId).catch(() => null);
  await transitionTo(tab, focused, activeInfo.windowId, "tab_activated");
});

// Navigation / URL change (includes query changes; hash-only changes often won’t fire reliably on all SPAs)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!changeInfo.url) return;

  const state = await getState();
  const isActive = tabId === state.activeTabId;
  if (!isActive) return;

  if (!state.windowFocused) {
    // If not focused, just update activeUrl so next focus starts with correct URL
    const normalized = isTrackableUrl(changeInfo.url) ? normalizeUrl(changeInfo.url) : null;
    await setState({ ...state, activeUrl: normalized });
    return;
  }

  // Focused + active: transition to new URL
  await transitionTo(tab, true, tab.windowId, "url_updated");
});

// Window focus changes
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  const state = await getState();

  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    // Lost focus
    await stopAndCommit("window_blur");
    await setState({ ...state, windowFocused: false, activeWindowId: null, startedAt: null });
    return;
  }

  // Gained focus on a window
  const tab = await getCurrentActiveTabInWindow(windowId);
  // Stop anything (safety), then start
  await stopAndCommit("window_focus_switch");
  await setState({ ...state, windowFocused: true, activeWindowId: windowId, startedAt: null });
  await startIfEligible(tab, true, windowId);
});

// Tab closed
chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  const state = await getState();
  if (tabId !== state.activeTabId) return;

  await stopAndCommit("tab_closed");
  await setState({
    ...state,
    activeTabId: null,
    activeUrl: null,
    startedAt: null
  });
});
