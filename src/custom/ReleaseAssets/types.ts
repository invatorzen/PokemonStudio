/**
 * Release assets — which graphics/audio files go into the release build.
 *
 * The backend scan lists every asset PSDK's compilation would ship, with why it
 * is needed (or that nothing references it). The page turns that into a
 * checkbox tree; the selection is saved to `<project>/release_assets.json`,
 * which Umbra's `00080 ReleaseAssets.rb` reads during `project_compilation`.
 */

/** Why an asset is kept. */
export type AssetReason =
  /** A data file or script mentions it. `label` says where (e.g. "Map 012 (Cadere) · event 5"). */
  | { type: 'source'; label: string }
  /** The whole folder is kept because code builds names in it (interface, pokedex, cries…). */
  | { type: 'folder'; folder: string }
  /** A folder named in code whose files are loaded by computed names (numbered frames…). */
  | { type: 'folderInCode'; folder: string; label: string }
  /** A variant of a used asset that code derives from its name (`_8dir`, `_night`…). */
  | { type: 'variant'; of: string }
  /** Named from an id by code (follower sprites "805_0", trainer art "025_big"…). */
  | { type: 'idName' }
  /** Code builds this name from a fixed start (`"key_short_#{…}"`). */
  | { type: 'prefix'; prefix: string; label: string };

export type AssetStatus = 'used' | 'rule' | 'unused';

export type ReleaseAsset = {
  /** Project-relative path, forward slashes, original case (e.g. "graphics/characters/NPC 01.png"). */
  path: string;
  size: number;
  status: AssetStatus;
  /** Up to a handful of reasons, most specific first. Empty when unused. */
  reasons: AssetReason[];
};

/** Fixed parts of the release that aren't graphics/audio, all approximate. */
export type ReleaseOtherSizes = {
  /** Ruby runtime + DLLs + executables. */
  engine: number;
  /** Ruby standard library files PSDK copies. Upper bound (the whole lib folder). */
  lib: number;
  /** Data/ files the build packs (maps, database, texts, animations). */
  data: number;
  /** Compiled scripts (Scripts.dat), estimated from the source size. */
  scripts: number;
  /** Fonts + shaders, copied as-is. */
  fontsAndShaders: number;
};

export type ReleaseAssetsScan = {
  assets: ReleaseAsset[];
  other: ReleaseOtherSizes;
  /** How many files of each kind the scan read, for the summary line. */
  sources: { maps: number; dataFiles: number; scripts: number; texts: number; tiled: number; unreadable: string[] };
  /** Milliseconds the scan took. */
  durationMs: number;
};

/** Per-file choice made by hand; "Remove unused assets" never overrides these. */
export type ManualChoice = 'include' | 'exclude';

/** Contents of `<project>/release_assets.json`. */
export type ReleaseAssetsSelection = {
  version: 1;
  /** false = build everything (the file is ignored by the build hook). */
  enabled: boolean;
  /** Paths left out of the release (project-relative, original case). */
  excluded: string[];
  /** Hand-made choices, keyed by lowercase path. */
  manual: Record<string, ManualChoice>;
  /** Every asset path known when the selection was last saved (lowercase), to flag new files. */
  reviewed: string[];
};

export const emptySelection = (): ReleaseAssetsSelection => ({ version: 1, enabled: true, excluded: [], manual: {}, reviewed: [] });

/** Lowercase lookup key for a project-relative path. */
export const assetKey = (path: string) => path.replace(/\\/g, '/').toLowerCase();
