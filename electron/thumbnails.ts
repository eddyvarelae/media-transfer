import path from 'node:path';
import { nativeImage } from 'electron';

// QuickLook can render these; anything else (XML sidecars, BIN, ...) gets no tile.
const THUMB_EXTS = new Set([
  '.jpg', '.jpeg', '.heif', '.heic', '.hif', '.png', '.arw', '.mp4', '.mov', '.m4v', '.mts',
]);
const CACHE_MAX = 200;
const TIMEOUT_MS = 3000;

const cache = new Map<string, string | null>();

function remember(key: string, value: string | null) {
  cache.delete(key);
  cache.set(key, value);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
}

/** 96x96 QuickLook thumbnail as a data URL, or null. Never called from the copy path. */
export async function getThumbnail(absPath: string): Promise<string | null> {
  if (cache.has(absPath)) {
    const hit = cache.get(absPath) ?? null;
    remember(absPath, hit);
    return hit;
  }
  if (!THUMB_EXTS.has(path.extname(absPath).toLowerCase())) return null;
  let result: string | null = null;
  try {
    const img = await Promise.race([
      nativeImage.createThumbnailFromPath(absPath, { width: 96, height: 96 }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS)),
    ]);
    if (img && !img.isEmpty()) result = img.toDataURL();
  } catch {
    result = null;
  }
  remember(absPath, result);
  return result;
}
