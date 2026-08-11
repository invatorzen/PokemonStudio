import { enforceCsvLayerData } from './tmxLayerData';

/**
 * Writing a map's .tmx to disk. Extracted from MapEditorPage so it can be reused
 * by the standalone parked-edit flush (which writes maps from outside the map
 * editor) — the on-disk result is identical to the editor saving the map itself.
 */

const fixTilesetSourcesInTmx = (bytes: Uint8Array): Uint8Array => {
  const xml = new TextDecoder().decode(bytes);
  let fixedCount = 0;
  const fixed = xml.replace(
    /(<tileset\b[^>]*?\bsource\s*=\s*["'])([^"']+)/g,
    (full, prefix, src: string) => {
      // Bug compensation: an earlier bridge build of `writeMap` passed the
      // full .tmx path (including filename) instead of the parent dir, so
      // MapWriter computed paths off-by-one and emitted `../../Tilesets/`
      // (one extra `..`). Collapse that here so already-saved files heal
      // on the next round-trip.
      if (src.startsWith('../../Tilesets/') || src.startsWith('../../Assets/')) {
        fixedCount++;
        return `${prefix}${src.slice(3)}`; // drop one "../"
      }
      // libtiled may write external-tileset sources in two broken forms
      // when no map path is passed to MapWriter:
      //   - `Tilesets/foo.tsx`   (MEMFS root, no separator)
      //   - `/Tilesets/foo.tsx`  (MEMFS absolute path)
      // Both get resolved relative to the .tmx's Maps/ folder, missing
      // the `..` climb-out to reach the sibling Tilesets/ folder.
      //
      // Anything already starting with `../` or `Maps/` is correct on
      // disk — leave it alone. Absolute Windows paths (drive letters,
      // backslashes) are exotic enough to also leave alone.
      if (src.startsWith('../') || src.startsWith('Maps/')) return full;
      if (/^[A-Za-z]:[\\/]/.test(src)) return full; // C:\... or C:/...
      // Strip a leading slash if present, then climb out of Maps/.
      const stripped = src.startsWith('/') ? src.slice(1) : src;
      fixedCount++;
      return `${prefix}../${stripped}`;
    }
  );
  if (fixedCount > 0) {
    console.log(`[tiled] fixTilesetSourcesInTmx: rewrote ${fixedCount} tileset source(s) to use "../" prefix`);
  }
  return new TextEncoder().encode(fixed);
};

export const saveBytes = async (
  projectPath: string,
  tiledFilename: string,
  bytes: Uint8Array
): Promise<{ size: number; mtime: number }> => {
  const fixed = fixTilesetSourcesInTmx(bytes);
  // Re-encode all <data> blocks as CSV regardless of the source .tmx's
  // original encoding. Standardizes the on-disk format across the project
  // (better diffs, no half-broken libtiled base64 path) and is lossless —
  // same gids, just a different serialization. Falls back to `fixed` on
  // any parse failure.
  const csvBuf = await enforceCsvLayerData(fixed.buffer.slice(fixed.byteOffset, fixed.byteOffset + fixed.byteLength) as ArrayBuffer);
  return new Promise((resolve, reject) => {
    window.api.writeMapBytes(
      { projectPath, tiledFilename, bytes: csvBuf },
      (payload) => resolve(payload),
      (err) => reject(new Error(err.errorMessage))
    );
  });
};
