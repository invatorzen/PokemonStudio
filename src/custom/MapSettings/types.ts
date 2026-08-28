/**
 * Shared, renderer-safe types + pure (de)serialization for the per-map Settings
 * feature (fog / panorama / battleback graphics baked into the map instead of a
 * parallel-process Change Fog event).
 *
 * Mirrors the on-disk shape of the fork-owned config at
 * `Data/configs/plugins/map_settings.json`. A Ruby patch reads this exact shape
 * and applies it on `Game_Map#setup`, so the field names/units here are the
 * contract. Imported with `import type` from the renderer, and the config-level
 * sanitizers are also imported at runtime by the backend task (pure, no
 * Electron/DOM), so there is one source of truth for the file's shape.
 *
 * The map is keyed by its numeric id as a string (`"1"`) — the RMXP map id the
 * runtime's `Game_Map#setup(map_id)` receives, which equals `StudioMap.id`.
 */

/**
 * Time-of-day graphic variants. Bare graphic names per PSDK period; an empty
 * period falls back to the asset's `name` (its "all times" / default graphic).
 * The runtime picks a period from `$env.morning?/day?/sunset?/night?` at map
 * setup. Period keys MUST match the Ruby side.
 */
export type TimeVariants = {
  morning: string;
  day: string;
  sunset: string;
  night: string;
};

/** Fog: matches the Change Fog (204) command's fields so a map fog looks identical. */
export type MapFogSettings = {
  /** Bare graphic name in `graphics/fogs` ('' = no fog). The "all times" graphic. */
  name: string;
  /** When true, the graphic is chosen per time of day from `times` (fog params stay shared). */
  byTime: boolean;
  /** Time-of-day graphic variants (empty period → `name`). */
  times: TimeVariants;
  hue: number;
  /** 0..255. */
  opacity: number;
  /** 0 normal, 1 add, 2 sub, 3 multiply. */
  blend: number;
  /** Percent; 100 = 1×. */
  zoom: number;
  /** Auto-scroll speed. */
  sx: number;
  sy: number;
  /** Static offset in fog-texture px. */
  ox: number;
  oy: number;
};

export type MapPanoramaSettings = {
  /** Bare graphic name in `graphics/panoramas` ('' = none). The "all times" graphic. */
  name: string;
  byTime: boolean;
  times: TimeVariants;
  hue: number;
};

export type MapBattlebackSettings = {
  /** Bare graphic name in `graphics/battlebacks` ('' = tileset default). The "all times" graphic. */
  name: string;
  byTime: boolean;
  times: TimeVariants;
};

export type MapSettingsEntry = {
  fog: MapFogSettings;
  panorama: MapPanoramaSettings;
  battleback: MapBattlebackSettings;
};

/** Whole config as written to disk. `maps` keyed by `String(map.id)`. */
export type MapSettingsConfig = {
  maps: Record<string, MapSettingsEntry>;
};

export const buildDefaultTimeVariants = (): TimeVariants => ({ morning: '', day: '', sunset: '', night: '' });

export const buildDefaultFog = (): MapFogSettings => ({
  name: '',
  byTime: false,
  times: buildDefaultTimeVariants(),
  hue: 0,
  opacity: 255,
  blend: 0,
  zoom: 100,
  sx: 0,
  sy: 0,
  ox: 0,
  oy: 0,
});
export const buildDefaultPanorama = (): MapPanoramaSettings => ({ name: '', byTime: false, times: buildDefaultTimeVariants(), hue: 0 });
export const buildDefaultBattleback = (): MapBattlebackSettings => ({ name: '', byTime: false, times: buildDefaultTimeVariants() });
export const buildDefaultMapSettingsEntry = (): MapSettingsEntry => ({
  fog: buildDefaultFog(),
  panorama: buildDefaultPanorama(),
  battleback: buildDefaultBattleback(),
});

export const buildDefaultMapSettingsConfig = (): MapSettingsConfig => ({ maps: {} });

/* -------------------------------------------------------------------------- */
/*  Pure sanitizers (shared with the backend task)                            */
/* -------------------------------------------------------------------------- */

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, fallback: number): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : fallback;
};
const int = (v: unknown, fallback: number): number => Math.trunc(num(v, fallback));
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const bool = (v: unknown): boolean => v === true;

const sanitizeTimeVariants = (raw: unknown): TimeVariants => {
  const o = isRecord(raw) ? raw : {};
  return { morning: str(o.morning), day: str(o.day), sunset: str(o.sunset), night: str(o.night) };
};

/** Any graphic set at all — the "all times" name or any time-of-day variant. */
const hasAnyName = (name: string, times: TimeVariants): boolean =>
  !!name.trim() || !!times.morning.trim() || !!times.day.trim() || !!times.sunset.trim() || !!times.night.trim();

export const sanitizeFog = (raw: unknown): MapFogSettings => {
  const o = isRecord(raw) ? raw : {};
  return {
    name: str(o.name),
    byTime: bool(o.byTime),
    times: sanitizeTimeVariants(o.times),
    hue: int(o.hue, 0),
    opacity: Math.max(0, Math.min(255, int(o.opacity, 255))),
    blend: [0, 1, 2, 3].includes(int(o.blend, 0)) ? int(o.blend, 0) : 0,
    zoom: Math.max(1, int(o.zoom, 100)),
    sx: int(o.sx, 0),
    sy: int(o.sy, 0),
    ox: int(o.ox, 0),
    oy: int(o.oy, 0),
  };
};

export const sanitizePanorama = (raw: unknown): MapPanoramaSettings => {
  const o = isRecord(raw) ? raw : {};
  return { name: str(o.name), byTime: bool(o.byTime), times: sanitizeTimeVariants(o.times), hue: int(o.hue, 0) };
};

export const sanitizeBattleback = (raw: unknown): MapBattlebackSettings => {
  const o = isRecord(raw) ? raw : {};
  return { name: str(o.name), byTime: bool(o.byTime), times: sanitizeTimeVariants(o.times) };
};

export const sanitizeMapSettingsEntry = (raw: unknown): MapSettingsEntry => {
  const o = isRecord(raw) ? raw : {};
  return { fog: sanitizeFog(o.fog), panorama: sanitizePanorama(o.panorama), battleback: sanitizeBattleback(o.battleback) };
};

/** True when an entry carries no graphic at all and should be dropped (sparse map). */
export const isDefaultMapSettingsEntry = (e: MapSettingsEntry): boolean =>
  !hasAnyName(e.fog.name, e.fog.times) && !hasAnyName(e.panorama.name, e.panorama.times) && !hasAnyName(e.battleback.name, e.battleback.times);

/** Does this asset have any graphic set (all-times name or any time variant)? */
export const assetHasGraphic = (asset: { name: string; times: TimeVariants }): boolean => hasAnyName(asset.name, asset.times);

export const sanitizeMapSettingsConfig = (raw: unknown): MapSettingsConfig => {
  const o = isRecord(raw) ? raw : {};
  const maps: Record<string, MapSettingsEntry> = {};
  if (isRecord(o.maps)) {
    Object.entries(o.maps).forEach(([key, value]) => {
      const entry = sanitizeMapSettingsEntry(value);
      // Keep sparse: only maps that actually set a graphic are stored.
      if (key && !isDefaultMapSettingsEntry(entry)) maps[key] = entry;
    });
  }
  return { maps };
};
