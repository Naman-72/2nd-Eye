export function normalizeUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    u.hash = ""; // ignore hash
    return u.toString();
  } catch {
    return null;
  }
}

export function isTrackableUrl(rawUrl) {
  if (!rawUrl) return false;
  if (
    rawUrl.startsWith("chrome://") ||
    rawUrl.startsWith("chrome-extension://") ||
    rawUrl.startsWith("edge://") ||
    rawUrl.startsWith("about:") ||
    rawUrl.startsWith("file://")
  ) {
    return false;
  }
  return true;
}

export function formatMs(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}
