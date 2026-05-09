// LRU cache of thumbnail blob URLs keyed by `path|mtime|size`.
//
// The cache holds up to MAX entries; when full, the oldest entry's blob
// URL is revoked before the entry is dropped so we don't leak memory.
// Hits bump the entry to the end of the Map's iteration order (Maps
// remember insertion order, so delete + re-set bumps).
//
// In-flight requests are deduped via PENDING so concurrent tile renders
// for the same file don't fan out to the helper.

import * as fs from './fs.js';

const MAX = 256;
const cache = new Map(); // key -> { url }
const PENDING = new Map(); // key -> Promise<string|null>

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'avif']);
const VIDEO_EXTS = new Set(['mp4', 'webm', 'mov', 'avi', 'mkv', 'wmv']);

export function shouldThumbnail(entry) {
  if (!entry || entry.is_dir) return false;
  const ext = (entry.extension || '').toLowerCase();
  return IMAGE_EXTS.has(ext) || VIDEO_EXTS.has(ext);
}

export async function getThumbnail(entry, size = 96) {
  if (!shouldThumbnail(entry)) return null;
  const key = `${entry.path}|${entry.modified_ms || 0}|${size}`;
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit.url;
  }
  if (PENDING.has(key)) return PENDING.get(key);
  const promise = (async () => {
    const url = await fs.thumbnail(entry.path, size);
    if (!url) return null;
    if (cache.size >= MAX) {
      const oldest = cache.keys().next().value;
      const c = cache.get(oldest);
      if (c?.url) URL.revokeObjectURL(c.url);
      cache.delete(oldest);
    }
    cache.set(key, { url });
    return url;
  })();
  PENDING.set(key, promise);
  promise.finally(() => PENDING.delete(key));
  return promise;
}

export function clearThumbnailCache() {
  for (const c of cache.values()) {
    if (c?.url) URL.revokeObjectURL(c.url);
  }
  cache.clear();
}
