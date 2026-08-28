import log from 'electron-log';
import fs from 'fs';
import path from 'path';
import type { AmbientCriesConfig, AmbientCriesSpeciesEntry, AmbientCriesTiming, AmbientCriesZone } from '@src/custom/AmbientCries/types';
import {
  buildDefaultAmbientCriesConfig,
  DEFAULT_GROUND_SYSTEM_TAGS,
  DEFAULT_WATER_SYSTEM_TAGS,
  DEFAULT_ZONE_TIMING_MAX,
  DEFAULT_ZONE_TIMING_MIN,
  DEFAULT_ZONE_TIMING_VALUE,
  isDefaultAmbientCriesZone,
  serializeZoneTiming,
} from '@src/custom/AmbientCries/types';
import { defineBackendServiceFunction } from './defineBackendServiceFunction';

/**
 * Read + write the Ambient Cries plugin config at
 * `<projectPath>/Data/configs/plugins/ambient_cries_config.json`.
 *
 * A Ruby patch reads this exact shape, so two guarantees matter here:
 *  - On read, a missing file yields the documented defaults rather than an error
 *    (the project may never have configured the plugin yet).
 *  - On write, we re-emit only the known keys, keep the `zones`/`species` maps
 *    sparse (a zone that is back to its defaults is dropped; a species that is
 *    included at its encounter-rate default is dropped), and pretty-print.
 */

const RELATIVE_CONFIG_PATH = path.join('Data', 'configs', 'plugins', 'ambient_cries_config.json');

/** Coerce to a finite number, else the fallback. */
const num = (value: unknown, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

/** Coerce to a [min, max] number pair, filling gaps with the fallback pair. */
const pair = (value: unknown, fallback: [number, number]): [number, number] => {
  if (Array.isArray(value)) return [num(value[0], fallback[0]), num(value[1], fallback[1])];
  return [fallback[0], fallback[1]];
};

/** Coerce to an array of non-empty strings, else a copy of the fallback list. */
const tags = (value: unknown, fallback: readonly string[]): string[] => {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
  return [...fallback];
};

/**
 * Read a timing block, keeping all of value/min/max (the mode selects which are
 * used). An absent or unknown mode means "inherit the global interval".
 */
const readTiming = (value: unknown): AmbientCriesTiming => {
  const obj = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const mode = obj.mode === 'fixed' || obj.mode === 'random' || obj.mode === 'range' ? obj.mode : 'inherit';
  return {
    mode,
    value: num(obj.value, DEFAULT_ZONE_TIMING_VALUE),
    min: num(obj.min, DEFAULT_ZONE_TIMING_MIN),
    max: num(obj.max, DEFAULT_ZONE_TIMING_MAX),
  };
};

/**
 * Collapse a species entry to its sparse form: keep `included` only when false
 * and `weight` only when a real number. Returns null when the entry carries no
 * departure from the default (included at encounter-rate weight) and should be
 * dropped from the map entirely.
 */
const sparseSpeciesEntry = (value: unknown): AmbientCriesSpeciesEntry | null => {
  const obj = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const excluded = obj.included === false;
  const hasWeight = typeof obj.weight === 'number' && Number.isFinite(obj.weight);
  if (!excluded && !hasWeight) return null;
  const entry: AmbientCriesSpeciesEntry = {};
  if (excluded) entry.included = false;
  if (hasWeight) entry.weight = obj.weight as number;
  return entry;
};

/** Collapse a raw species map into its sparse form (dropping default entries). */
const sanitizeSpeciesMap = (value: unknown): Record<string, AmbientCriesSpeciesEntry> => {
  const out: Record<string, AmbientCriesSpeciesEntry> = {};
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  Object.entries(raw).forEach(([sym, entry]) => {
    const sparse = sparseSpeciesEntry(entry);
    if (sparse) out[sym] = sparse;
  });
  return out;
};

/**
 * Rebuild a zone with sparse ground/water species maps and a serialized timing.
 * Timing keeps all three fields when it is a real override (fixed/random/range);
 * an inherited timing omits the `timing` key entirely — a present `timing` is an
 * override to the Ruby, so inherit MUST NOT be written.
 *
 * Legacy migration: a pre-split zone stored a single `species` map (applied to
 * whichever groups matched the player's environment). It is read into `ground`
 * (the common case), so old configs keep their overrides; `water` starts empty.
 */
const sanitizeZone = (value: unknown): AmbientCriesZone => {
  const obj = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const hasSplit = 'ground' in obj || 'water' in obj;
  const ground = sanitizeSpeciesMap(hasSplit ? obj.ground : obj.species);
  const water = sanitizeSpeciesMap(obj.water);
  const timing = serializeZoneTiming(readTiming(obj.timing));
  return {
    enabled: typeof obj.enabled === 'boolean' ? obj.enabled : true,
    ...(timing ? { timing } : {}),
    ground,
    water,
  };
};

export type ReadAmbientCriesConfigInput = { projectPath: string };
export type ReadAmbientCriesConfigOutput = { config: AmbientCriesConfig };

const readAmbientCriesConfig = async (payload: ReadAmbientCriesConfigInput): Promise<ReadAmbientCriesConfigOutput> => {
  log.info('read-ambient-cries-config');
  const filePath = path.join(payload.projectPath, RELATIVE_CONFIG_PATH);

  if (!fs.existsSync(filePath)) {
    log.info('read-ambient-cries-config/missing-default');
    return { config: buildDefaultAmbientCriesConfig() };
  }

  const raw = fs.readFileSync(filePath, { encoding: 'utf-8' });
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    // Throw a string — IPC cannot serialize Error instances.
    throw `ambient_cries_config.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw 'ambient_cries_config.json does not contain a JSON object.';
  }

  const obj = parsed as Record<string, unknown>;
  const zones: Record<string, AmbientCriesZone> = {};
  const rawZones = obj.zones && typeof obj.zones === 'object' && !Array.isArray(obj.zones) ? (obj.zones as Record<string, unknown>) : {};
  Object.entries(rawZones).forEach(([sym, zone]) => {
    const sanitized = sanitizeZone(zone);
    // Keep sparse even on read: a zone that carries no departure is dropped.
    if (!isDefaultAmbientCriesZone(sanitized)) zones[sym] = sanitized;
  });

  const config: AmbientCriesConfig = {
    roll_chance_percent: num(obj.roll_chance_percent, 50),
    roll_interval_seconds: pair(obj.roll_interval_seconds, [20, 40]),
    volume: pair(obj.volume, [60, 80]),
    ground_system_tags: tags(obj.ground_system_tags, DEFAULT_GROUND_SYSTEM_TAGS),
    water_system_tags: tags(obj.water_system_tags, DEFAULT_WATER_SYSTEM_TAGS),
    zones,
  };

  log.info('read-ambient-cries-config/success');
  return { config };
};

export type SaveAmbientCriesConfigInput = { projectPath: string; config: AmbientCriesConfig };
export type SaveAmbientCriesConfigOutput = Record<string, never>;

const saveAmbientCriesConfig = async (payload: SaveAmbientCriesConfigInput): Promise<SaveAmbientCriesConfigOutput> => {
  log.info('save-ambient-cries-config');
  const filePath = path.join(payload.projectPath, RELATIVE_CONFIG_PATH);

  // The plugins folder may not exist on projects that have never used a plugin.
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  const c = payload.config;
  const zones: Record<string, AmbientCriesZone> = {};
  Object.entries(c.zones ?? {}).forEach(([sym, zone]) => {
    const sanitized = sanitizeZone(zone);
    // Drop any zone that is back to its defaults — keep the map sparse.
    if (!isDefaultAmbientCriesZone(sanitized)) zones[sym] = sanitized;
  });

  // Re-emit only the known keys, in the documented order.
  const toWrite: AmbientCriesConfig = {
    roll_chance_percent: num(c.roll_chance_percent, 50),
    roll_interval_seconds: pair(c.roll_interval_seconds, [20, 40]),
    volume: pair(c.volume, [60, 80]),
    ground_system_tags: tags(c.ground_system_tags, DEFAULT_GROUND_SYSTEM_TAGS),
    water_system_tags: tags(c.water_system_tags, DEFAULT_WATER_SYSTEM_TAGS),
    zones,
  };
  fs.writeFileSync(filePath, JSON.stringify(toWrite, null, 2));

  log.info('save-ambient-cries-config/success');
  return {};
};

export const registerReadAmbientCriesConfig = defineBackendServiceFunction('read-ambient-cries-config', readAmbientCriesConfig);
export const registerSaveAmbientCriesConfig = defineBackendServiceFunction('save-ambient-cries-config', saveAmbientCriesConfig);
