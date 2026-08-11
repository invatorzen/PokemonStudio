import log from 'electron-log';
import fs from 'fs';
import path from 'path';
import type { SosConfig } from '@src/custom/SOS/types';
import { defineBackendServiceFunction } from './defineBackendServiceFunction';

/**
 * Read + write the cc-sos-battles bridge config at
 * `<projectPath>/Data/configs/plugins/sos_battles.json`.
 *
 * This is the Studio-editable JSON our Ruby StudioBridge feeds into Zozo's
 * SOSBattles plugin (klass `Configs::Project::SosBattlesConfig`). The per-creature
 * `species` map is edited from the SOS block on the Pokémon page; the global
 * `settings` block is edited on the SOS Settings page. Two guarantees matter
 * here, mirroring the grotto backend:
 *  - On read, a missing file yields a sensible empty default rather than an error.
 *  - On write, the `klass` field and ANY unknown keys the renderer hands back
 *    (including the whole `settings` block) are preserved verbatim — we simply
 *    pretty-print whatever object we are given.
 */

const RELATIVE_CONFIG_PATH = path.join('Data', 'configs', 'plugins', 'sos_battles.json');

const SOS_BATTLES_KLASS = 'Configs::Project::SosBattlesConfig';

const buildEmptyConfig = (): SosConfig => ({
  klass: SOS_BATTLES_KLASS,
  species: {},
});

export type ReadSosBattleInput = { projectPath: string };
export type ReadSosBattleOutput = { config: SosConfig };

const readSosBattle = async (payload: ReadSosBattleInput): Promise<ReadSosBattleOutput> => {
  log.info('read-sos-battle');
  const filePath = path.join(payload.projectPath, RELATIVE_CONFIG_PATH);

  if (!fs.existsSync(filePath)) {
    log.info('read-sos-battle/missing-default');
    return { config: buildEmptyConfig() };
  }

  const raw = fs.readFileSync(filePath, { encoding: 'utf-8' });
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    // Throw a string — IPC cannot serialize Error instances.
    throw `sos_battles.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw 'sos_battles.json does not contain a JSON object.';
  }

  // Guarantee `species` + `klass` exist so the UI never has to null-check them,
  // while leaving every other key (notably `settings`) intact for round-trip.
  const obj = parsed as Record<string, unknown>;
  const config: SosConfig = {
    ...(obj as SosConfig),
    klass: typeof obj.klass === 'string' ? (obj.klass as string) : SOS_BATTLES_KLASS,
    species: obj.species && typeof obj.species === 'object' && !Array.isArray(obj.species) ? (obj.species as SosConfig['species']) : {},
  };

  log.info('read-sos-battle/success');
  return { config };
};

export type WriteSosBattleInput = { projectPath: string; config: SosConfig };
export type WriteSosBattleOutput = Record<string, never>;

const writeSosBattle = async (payload: WriteSosBattleInput): Promise<WriteSosBattleOutput> => {
  log.info('write-sos-battle');
  const filePath = path.join(payload.projectPath, RELATIVE_CONFIG_PATH);

  // The plugins folder may not exist on projects that have never used a plugin.
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  // Spread the incoming config so every key it carried (including `settings` and
  // any unknown keys) is written back untouched, then force `klass` so the config
  // always keeps its PSDK class regardless of what the renderer sent.
  const toWrite = { ...payload.config, klass: SOS_BATTLES_KLASS };
  fs.writeFileSync(filePath, JSON.stringify(toWrite, null, 2));

  log.info('write-sos-battle/success');
  return {};
};

export const registerReadSosBattle = defineBackendServiceFunction('read-sos-battle', readSosBattle);
export const registerWriteSosBattle = defineBackendServiceFunction('write-sos-battle', writeSosBattle);
