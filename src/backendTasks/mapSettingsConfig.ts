import log from 'electron-log';
import fs from 'fs';
import path from 'path';
import type { MapSettingsConfig } from '@src/custom/MapSettings/types';
import { buildDefaultMapSettingsConfig, isDefaultMapSettingsEntry, sanitizeMapSettingsConfig } from '@src/custom/MapSettings/types';
import { defineBackendServiceFunction } from './defineBackendServiceFunction';

/**
 * Read + write the per-map Settings config at
 * `<projectPath>/Data/configs/plugins/map_settings.json`.
 *
 * A Ruby patch reads this exact shape on `Game_Map#setup`, so on read a missing
 * file yields empty defaults (the project may never have set a map graphic), and
 * on write we re-emit only sanitized, sparse data (maps with no graphic dropped)
 * and pretty-print.
 */

const RELATIVE_CONFIG_PATH = path.join('Data', 'configs', 'plugins', 'map_settings.json');

export type ReadMapSettingsConfigInput = { projectPath: string };
export type ReadMapSettingsConfigOutput = { config: MapSettingsConfig };

const readMapSettingsConfig = async (payload: ReadMapSettingsConfigInput): Promise<ReadMapSettingsConfigOutput> => {
  log.info('read-map-settings-config');
  const filePath = path.join(payload.projectPath, RELATIVE_CONFIG_PATH);
  if (!fs.existsSync(filePath)) {
    log.info('read-map-settings-config/missing-default');
    return { config: buildDefaultMapSettingsConfig() };
  }
  const raw = fs.readFileSync(filePath, { encoding: 'utf-8' });
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw `map_settings.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`;
  }
  log.info('read-map-settings-config/success');
  return { config: sanitizeMapSettingsConfig(parsed) };
};

export type SaveMapSettingsConfigInput = { projectPath: string; config: MapSettingsConfig };
export type SaveMapSettingsConfigOutput = Record<string, never>;

const saveMapSettingsConfig = async (payload: SaveMapSettingsConfigInput): Promise<SaveMapSettingsConfigOutput> => {
  log.info('save-map-settings-config');
  const filePath = path.join(payload.projectPath, RELATIVE_CONFIG_PATH);
  // The plugins folder may not exist on projects that never used a plugin config.
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  const sanitized = sanitizeMapSettingsConfig(payload.config);
  // Defense in depth: drop any entry that ended up default (no graphic).
  const maps: MapSettingsConfig['maps'] = {};
  Object.entries(sanitized.maps).forEach(([key, entry]) => {
    if (!isDefaultMapSettingsEntry(entry)) maps[key] = entry;
  });
  fs.writeFileSync(filePath, JSON.stringify({ maps }, null, 2));
  log.info('save-map-settings-config/success');
  return {};
};

export const registerReadMapSettingsConfig = defineBackendServiceFunction('read-map-settings-config', readMapSettingsConfig);
export const registerSaveMapSettingsConfig = defineBackendServiceFunction('save-map-settings-config', saveMapSettingsConfig);
