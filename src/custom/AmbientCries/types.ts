/**
 * Shared, renderer-safe types for the Ambient Cries feature.
 *
 * Mirrors the on-disk shape of the Ambient Cries plugin config at
 * `Data/configs/plugins/ambient_cries_config.json`. A Ruby patch reads this exact
 * shape. Imported with `import type` from both the backend task and the renderer
 * so there is one source of truth without pulling main-process code into the
 * renderer bundle.
 *
 * Two things are deliberately sparse and MUST NOT be written with defaults:
 *  - `zones`: only zones that depart from the default carry an entry.
 *  - a zone's `species`: only species that are excluded or re-weighted carry an
 *    entry. A species absent from the map is included at its encounter-rate
 *    default.
 */

export type AmbientCriesTimingMode = 'inherit' | 'fixed' | 'random' | 'range';

/**
 * A zone's cry cadence. All three of value/min/max are always kept in memory —
 * the `mode` selects which are used at runtime (fixed → `value`, random →
 * rand 0..`value`, range → rand `min`..`max`). Keeping them all lets the user
 * switch modes without losing the numbers they typed.
 *
 * `'inherit'` is the default and means "use the global roll interval". It is a
 * memory-only mode: it MUST NOT be serialized. The Ruby patch treats ANY present
 * `timing` object as an override (and its `parse_timing` only knows
 * fixed/random/range), so an inherit zone omits the `timing` key entirely — a
 * missing key is how the Ruby reads "use the global interval". See
 * {@link serializeZoneTiming}.
 */
export type AmbientCriesTiming = {
  mode: AmbientCriesTimingMode;
  value: number;
  min: number;
  max: number;
};

/**
 * A species' per-zone override. Sparse: `included` is present only when `false`,
 * `weight` only when the user typed a custom one. An entry with neither is not
 * persisted (that is the "included at encounter-rate default" state).
 */
export type AmbientCriesSpeciesEntry = {
  included?: boolean;
  weight?: number;
};

export type AmbientEnvironment = 'ground' | 'water';

export type AmbientCriesZone = {
  enabled: boolean;
  /**
   * Present only for a real override (fixed/random/range). Absent means "inherit
   * the global interval" — the serialized form the Ruby reads. In memory an
   * inherit zone may also carry a `{mode:'inherit',…}` timing (so the fields keep
   * values), but that is stripped on the way to storage/disk.
   */
  timing?: AmbientCriesTiming;
  /**
   * Per-species overrides, split by the environment the cry plays in: `ground`
   * when walking, `water` when surfing — mirroring the plugin's
   * ground/water_system_tags. A zone's ground and water pools come from different
   * groups (a Pond/Ocean group feeds only water), so their overrides are kept
   * apart. Both maps are sparse (see {@link AmbientCriesSpeciesEntry}).
   */
  ground: Record<string, AmbientCriesSpeciesEntry>;
  water: Record<string, AmbientCriesSpeciesEntry>;
};

/** The whole config as written to disk. `zones` is keyed by zone db_symbol. */
export type AmbientCriesConfig = {
  roll_chance_percent: number;
  roll_interval_seconds: [number, number];
  volume: [number, number];
  ground_system_tags: string[];
  water_system_tags: string[];
  zones: Record<string, AmbientCriesZone>;
};

export const DEFAULT_ROLL_CHANCE_PERCENT = 50;
export const DEFAULT_ROLL_INTERVAL_SECONDS: [number, number] = [20, 40];
export const DEFAULT_VOLUME: [number, number] = [60, 80];
export const DEFAULT_GROUND_SYSTEM_TAGS = ['grass', 'cave', 'tall_grass', 'snow', 'sand'] as const;
export const DEFAULT_WATER_SYSTEM_TAGS = ['sea', 'pond'] as const;

export const DEFAULT_ZONE_TIMING_VALUE = 30;
export const DEFAULT_ZONE_TIMING_MIN = 20;
export const DEFAULT_ZONE_TIMING_MAX = 40;

export const buildDefaultAmbientCriesConfig = (): AmbientCriesConfig => ({
  roll_chance_percent: DEFAULT_ROLL_CHANCE_PERCENT,
  roll_interval_seconds: [...DEFAULT_ROLL_INTERVAL_SECONDS],
  volume: [...DEFAULT_VOLUME],
  ground_system_tags: [...DEFAULT_GROUND_SYSTEM_TAGS],
  water_system_tags: [...DEFAULT_WATER_SYSTEM_TAGS],
  zones: {},
});

export const buildDefaultZoneTiming = (): AmbientCriesTiming => ({
  mode: 'inherit',
  value: DEFAULT_ZONE_TIMING_VALUE,
  min: DEFAULT_ZONE_TIMING_MIN,
  max: DEFAULT_ZONE_TIMING_MAX,
});

/** A fresh, on-by-default zone with default timing and no species overrides. */
export const buildDefaultAmbientCriesZone = (): AmbientCriesZone => ({
  enabled: true,
  timing: buildDefaultZoneTiming(),
  ground: {},
  water: {},
});

/**
 * Convert a Studio group `systemTag` (CamelCase, e.g. `TallGrass`, `Ocean`,
 * `Custom_Puddle`) to the plugin's snake_case tag vocabulary (`tall_grass`,
 * `sea`, `puddle`) used in `ground_system_tags` / `water_system_tags`. Mirrors
 * PSDK's `GameData::SystemTags#system_tag_db_symbol` so the editor partitions
 * groups exactly as the game does at runtime.
 */
export const systemTagToPluginTag = (systemTag: string): string => {
  switch (systemTag) {
    case 'Ocean':
      return 'sea';
    case 'HeadButt':
      return 'headbutt';
    case 'RegularGround':
      return 'regular_ground';
    default: {
      const base = systemTag.startsWith('Custom_') ? systemTag.slice('Custom_'.length) : systemTag;
      return base
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/[\s-]+/g, '_')
        .toLowerCase();
    }
  }
};

/**
 * Which cry pool a group belongs to, from its `systemTag` and the config's tag
 * lists. Water is checked first, so a water-tagged group (e.g. a Pond group) is
 * never pulled into the ground pool. Returns null when the tag is in neither
 * list — that group then contributes no cries in either mode, exactly as at
 * runtime.
 */
export const environmentForSystemTag = (systemTag: string, groundTags: string[], waterTags: string[]): AmbientEnvironment | null => {
  const tag = systemTagToPluginTag(systemTag);
  if (waterTags.some((t) => t.toLowerCase() === tag)) return 'water';
  if (groundTags.some((t) => t.toLowerCase() === tag)) return 'ground';
  return null;
};

/**
 * True when a timing carries no override and should not be serialized: absent, or
 * the memory-only `'inherit'` mode. Any real fixed/random/range timing — even one
 * whose numbers happen to match the defaults — IS an override and is kept.
 */
export const isDefaultTiming = (t: AmbientCriesTiming | undefined): boolean => !t || t.mode === 'inherit';

/**
 * The timing to serialize, or `undefined` when the zone inherits the global
 * interval (absent/`'inherit'`). Serializing `{mode:'inherit',…}` would make the
 * Ruby treat the zone as an override and fall through to random, so an inherit
 * zone MUST omit the `timing` key entirely.
 */
export const serializeZoneTiming = (t: AmbientCriesTiming | undefined): AmbientCriesTiming | undefined => (isDefaultTiming(t) ? undefined : t);

/**
 * True when a zone carries no departure from the default and should be dropped
 * from the sparse `zones` map: enabled, inherited timing, and no ground/water
 * species override.
 */
export const isDefaultAmbientCriesZone = (z: AmbientCriesZone): boolean =>
  z.enabled === true && isDefaultTiming(z.timing) && Object.keys(z.ground).length === 0 && Object.keys(z.water).length === 0;

/**
 * Collapse a species entry to its sparse form (or `null` when it is the default,
 * i.e. included with no custom weight and should be removed from the map).
 */
export const sparseSpeciesEntry = (included: boolean, weight: number | undefined): AmbientCriesSpeciesEntry | null => {
  const excluded = included === false;
  const hasWeight = typeof weight === 'number' && Number.isFinite(weight);
  if (!excluded && !hasWeight) return null;
  const entry: AmbientCriesSpeciesEntry = {};
  if (excluded) entry.included = false;
  if (hasWeight) entry.weight = weight;
  return entry;
};
