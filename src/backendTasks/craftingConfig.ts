import log from 'electron-log';
import fs from 'fs';
import path from 'path';
import type { CraftingConfig } from '@src/custom/Crafting/types';
import { buildDefaultCraftingConfig, sanitizeCraftingConfig } from '@src/custom/Crafting/types';
import { defineBackendServiceFunction } from './defineBackendServiceFunction';

/**
 * Read + write the Crafting plugin config at
 * `<projectPath>/Data/configs/crafting_config.json`, edited from Studio's
 * "Crafting" section. Guarantees:
 *  - On read, a missing file yields the plugin's documented default
 *    (`{ categories: [{ all: 3 }], data: {} }`) rather than an error.
 *  - On read and on write, the shape is sanitized: `categories` stays an ordered
 *    array of single-key `{ key: icon }` objects, `data` a recipe map, and every
 *    `unlock_condition` is re-emitted faithfully as a recursive and/or/not tree
 *    with only the known keys (empty optional pokemon sub-fields and unset
 *    `max_craft` dropped).
 *
 * The `sanitize*` helpers are the same pure functions the renderer uses, imported
 * from the renderer-safe `types.ts`, so the file shape has one source of truth.
 */

const RELATIVE_CONFIG_PATH = path.join('Data', 'configs', 'crafting_config.json');

export type ReadCraftingConfigInput = { projectPath: string };
export type ReadCraftingConfigOutput = { config: CraftingConfig };

const readCraftingConfig = async (payload: ReadCraftingConfigInput): Promise<ReadCraftingConfigOutput> => {
  log.info('read-crafting-config');
  const filePath = path.join(payload.projectPath, RELATIVE_CONFIG_PATH);

  if (!fs.existsSync(filePath)) {
    log.info('read-crafting-config/missing-default');
    return { config: buildDefaultCraftingConfig() };
  }

  const raw = fs.readFileSync(filePath, { encoding: 'utf-8' });
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    // Throw a string — IPC cannot serialize Error instances.
    throw `crafting_config.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw 'crafting_config.json does not contain a JSON object.';
  }

  log.info('read-crafting-config/success');
  return { config: sanitizeCraftingConfig(parsed) };
};

export type SaveCraftingConfigInput = { projectPath: string; config: CraftingConfig };
export type SaveCraftingConfigOutput = Record<string, never>;

const saveCraftingConfig = async (payload: SaveCraftingConfigInput): Promise<SaveCraftingConfigOutput> => {
  log.info('save-crafting-config');
  const filePath = path.join(payload.projectPath, RELATIVE_CONFIG_PATH);

  // The configs folder should exist, but be defensive on a fresh project.
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  // Re-sanitize so only known keys reach disk, even if the renderer sent extra.
  const toWrite = sanitizeCraftingConfig(payload.config);
  fs.writeFileSync(filePath, JSON.stringify(toWrite, null, 2));

  log.info('save-crafting-config/success');
  return {};
};

export const registerReadCraftingConfig = defineBackendServiceFunction('read-crafting-config', readCraftingConfig);
export const registerSaveCraftingConfig = defineBackendServiceFunction('save-crafting-config', saveCraftingConfig);
