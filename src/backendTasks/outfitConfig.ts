import log from 'electron-log';
import fs from 'fs';
import path from 'path';
import type { OutfitConfig, OutfitEntry } from '@src/custom/Outfits/types';
import { defineBackendServiceFunction } from './defineBackendServiceFunction';

/**
 * Read + write the Easy Outfits plugin config at
 * `<projectPath>/Data/configs/plugins/outfit_config.json`.
 *
 * Registered in PSDK as `Configs.register(:outfit_config, 'plugins/outfit_config', :json, …)`
 * and edited from Studio's "Outfits" section. Two guarantees matter here:
 *  - On read, a missing file yields the plugin's documented defaults rather than
 *    an error (the project may never have configured an outfit yet).
 *  - On write, the JSON shape is preserved exactly: `outfits` stays a string-keyed
 *    map, and each entry's `gender` key is emitted only when it is a real boolean
 *    — never `null`, and omitted entirely when unset (the Ruby reads these keys).
 */

const RELATIVE_CONFIG_PATH = path.join('Data', 'configs', 'plugins', 'outfit_config.json');

const DEFAULT_BAG_SLOT = 9;
const DEFAULT_ICON_SLOT = 6;

const buildDefaultConfig = (): OutfitConfig => ({
  outfit_bag_slot: DEFAULT_BAG_SLOT,
  outfit_icon_slot: DEFAULT_ICON_SLOT,
  outfits: {},
});

/** Coerce an arbitrary value into a valid outfit entry, dropping unknown keys. */
const sanitizeEntry = (value: unknown): OutfitEntry => {
  const obj = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    overworld: typeof obj.overworld === 'string' ? obj.overworld : '',
    back_sprite: typeof obj.back_sprite === 'string' ? obj.back_sprite : '',
    ...(typeof obj.gender === 'boolean' ? { gender: obj.gender } : {}),
  };
};

export type ReadOutfitConfigInput = { projectPath: string };
export type ReadOutfitConfigOutput = { config: OutfitConfig };

const readOutfitConfig = async (payload: ReadOutfitConfigInput): Promise<ReadOutfitConfigOutput> => {
  log.info('read-outfit-config');
  const filePath = path.join(payload.projectPath, RELATIVE_CONFIG_PATH);

  if (!fs.existsSync(filePath)) {
    log.info('read-outfit-config/missing-default');
    return { config: buildDefaultConfig() };
  }

  const raw = fs.readFileSync(filePath, { encoding: 'utf-8' });
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    // Throw a string — IPC cannot serialize Error instances.
    throw `outfit_config.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw 'outfit_config.json does not contain a JSON object.';
  }

  const obj = parsed as Record<string, unknown>;
  const rawOutfits = obj.outfits && typeof obj.outfits === 'object' && !Array.isArray(obj.outfits) ? (obj.outfits as Record<string, unknown>) : {};
  const outfits: Record<string, OutfitEntry> = {};
  Object.entries(rawOutfits).forEach(([key, entry]) => {
    outfits[key] = sanitizeEntry(entry);
  });

  const config: OutfitConfig = {
    outfit_bag_slot: typeof obj.outfit_bag_slot === 'number' ? obj.outfit_bag_slot : DEFAULT_BAG_SLOT,
    outfit_icon_slot: typeof obj.outfit_icon_slot === 'number' ? obj.outfit_icon_slot : DEFAULT_ICON_SLOT,
    outfits,
  };

  log.info('read-outfit-config/success');
  return { config };
};

export type SaveOutfitConfigInput = { projectPath: string; config: OutfitConfig };
export type SaveOutfitConfigOutput = Record<string, never>;

const saveOutfitConfig = async (payload: SaveOutfitConfigInput): Promise<SaveOutfitConfigOutput> => {
  log.info('save-outfit-config');
  const filePath = path.join(payload.projectPath, RELATIVE_CONFIG_PATH);

  // The plugins folder may not exist on projects that have never used a plugin.
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  // Rebuild each entry so only the three known keys are written and `gender` is
  // emitted only as a real boolean (never null, omitted when unset).
  const outfits: Record<string, OutfitEntry> = {};
  Object.entries(payload.config.outfits ?? {}).forEach(([key, entry]) => {
    outfits[key] = {
      overworld: entry.overworld ?? '',
      back_sprite: entry.back_sprite ?? '',
      ...(typeof entry.gender === 'boolean' ? { gender: entry.gender } : {}),
    };
  });

  const toWrite: OutfitConfig = {
    outfit_bag_slot: payload.config.outfit_bag_slot,
    outfit_icon_slot: payload.config.outfit_icon_slot,
    outfits,
  };
  fs.writeFileSync(filePath, JSON.stringify(toWrite, null, 2));

  log.info('save-outfit-config/success');
  return {};
};

export const registerReadOutfitConfig = defineBackendServiceFunction('read-outfit-config', readOutfitConfig);
export const registerSaveOutfitConfig = defineBackendServiceFunction('save-outfit-config', saveOutfitConfig);
