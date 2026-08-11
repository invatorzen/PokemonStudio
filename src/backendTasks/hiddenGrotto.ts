import log from 'electron-log';
import fs from 'fs';
import path from 'path';
import type { HiddenGrottoConfig } from '@src/custom/Grotto/types';
import { defineBackendServiceFunction } from './defineBackendServiceFunction';

/**
 * Read + write the Hidden Grottos plugin config at
 * `<projectPath>/Data/configs/plugins/hidden_grotto.json`.
 *
 * This is a fork-custom PSDK plugin config (klass
 * `Configs::Project::HiddenGrottoConfig`), edited from the "Hidden Grottos"
 * section. Two guarantees matter here:
 *  - On read, a missing file yields a sensible empty default rather than an error.
 *  - On write, the `klass` field and ANY unknown keys the renderer hands back
 *    (notably `positions`, added later by the project author) are preserved
 *    verbatim — we simply pretty-print whatever object we are given.
 */

const RELATIVE_CONFIG_PATH = path.join('Data', 'configs', 'plugins', 'hidden_grotto.json');

const HIDDEN_GROTTO_KLASS = 'Configs::Project::HiddenGrottoConfig';

const buildEmptyConfig = (): HiddenGrottoConfig => ({
  klass: HIDDEN_GROTTO_KLASS,
  visible_items: [],
  hidden_items: [],
  unique_items: {},
  unique_pokemon: {},
});

export type ReadHiddenGrottoInput = { projectPath: string };
export type ReadHiddenGrottoOutput = { config: HiddenGrottoConfig };

const readHiddenGrotto = async (payload: ReadHiddenGrottoInput): Promise<ReadHiddenGrottoOutput> => {
  log.info('read-hidden-grotto');
  const filePath = path.join(payload.projectPath, RELATIVE_CONFIG_PATH);

  if (!fs.existsSync(filePath)) {
    log.info('read-hidden-grotto/missing-default');
    return { config: buildEmptyConfig() };
  }

  const raw = fs.readFileSync(filePath, { encoding: 'utf-8' });
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    // Throw a string — IPC cannot serialize Error instances.
    throw `hidden_grotto.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw 'hidden_grotto.json does not contain a JSON object.';
  }

  // Guarantee the four editable tables + klass exist so the UI never has to
  // null-check them, while leaving every other key (e.g. `positions`) intact.
  const obj = parsed as Record<string, unknown>;
  const config: HiddenGrottoConfig = {
    ...(obj as HiddenGrottoConfig),
    klass: typeof obj.klass === 'string' ? (obj.klass as string) : HIDDEN_GROTTO_KLASS,
    visible_items: Array.isArray(obj.visible_items) ? (obj.visible_items as HiddenGrottoConfig['visible_items']) : [],
    hidden_items: Array.isArray(obj.hidden_items) ? (obj.hidden_items as HiddenGrottoConfig['hidden_items']) : [],
    unique_items: obj.unique_items && typeof obj.unique_items === 'object' ? (obj.unique_items as HiddenGrottoConfig['unique_items']) : {},
    unique_pokemon:
      obj.unique_pokemon && typeof obj.unique_pokemon === 'object' ? (obj.unique_pokemon as HiddenGrottoConfig['unique_pokemon']) : {},
  };

  log.info('read-hidden-grotto/success');
  return { config };
};

export type WriteHiddenGrottoInput = { projectPath: string; config: HiddenGrottoConfig };
export type WriteHiddenGrottoOutput = Record<string, never>;

const writeHiddenGrotto = async (payload: WriteHiddenGrottoInput): Promise<WriteHiddenGrottoOutput> => {
  log.info('write-hidden-grotto');
  const filePath = path.join(payload.projectPath, RELATIVE_CONFIG_PATH);

  // The plugins folder may not exist on projects that have never used a plugin.
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  // Spread the incoming config so every key it carried (including any unknown
  // keys like `positions`) is written back untouched, then force `klass` so the
  // config always keeps its PSDK class regardless of what the renderer sent.
  const toWrite = { ...payload.config, klass: HIDDEN_GROTTO_KLASS };
  fs.writeFileSync(filePath, JSON.stringify(toWrite, null, 2));

  log.info('write-hidden-grotto/success');
  return {};
};

export const registerReadHiddenGrotto = defineBackendServiceFunction('read-hidden-grotto', readHiddenGrotto);
export const registerWriteHiddenGrotto = defineBackendServiceFunction('write-hidden-grotto', writeHiddenGrotto);
