import log from 'electron-log';
import fs from 'fs';
import path from 'path';
import type { CriticalHealthAudioConfig, CriticalHealthAudioMode } from '@src/custom/CriticalHealthAudio/types';
import {
  DEFAULT_BGM_REPLACEMENT_MODE,
  DEFAULT_CRITICAL_HEALTH_AUDIO_MODE,
  DEFAULT_SOUND_EFFECT_MODE,
  buildDefaultCriticalHealthAudioConfig,
} from '@src/custom/CriticalHealthAudio/types';
import { defineBackendServiceFunction } from './defineBackendServiceFunction';

/**
 * Read + write the Critical Health Audio plugin config at
 * `<projectPath>/Data/configs/plugins/critical_health_audio_config.json`.
 *
 * The plugin reads this exact shape, so two guarantees matter here:
 *  - On read, a missing file yields the documented defaults rather than an error
 *    (the project may never have configured the plugin yet).
 *  - On write, we re-emit ONLY the known keys, in the documented order, always
 *    keeping both sub-objects present (mode just selects which one is active),
 *    and pretty-print.
 */

const RELATIVE_CONFIG_PATH = path.join('Data', 'configs', 'plugins', 'critical_health_audio_config.json');

/** Coerce to a finite number, else the fallback. */
const num = (value: unknown, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

/** Clamp a coerced number into [min, max]. */
const clamp = (value: unknown, fallback: number, min: number, max: number): number => Math.min(max, Math.max(min, num(value, fallback)));

/** Coerce to a non-empty trimmed string, else the fallback. */
const str = (value: unknown, fallback: string): string => (typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback);

/** Coerce to one of the two known modes, else the default. */
const mode = (value: unknown): CriticalHealthAudioMode =>
  value === 'sound_effect' || value === 'bgm_replacement' ? value : DEFAULT_CRITICAL_HEALTH_AUDIO_MODE;

/** Build a sanitized config from an arbitrary parsed object, filling defaults. */
const sanitize = (raw: unknown): CriticalHealthAudioConfig => {
  const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const se = obj.sound_effect_mode && typeof obj.sound_effect_mode === 'object' ? (obj.sound_effect_mode as Record<string, unknown>) : {};
  const bgm = obj.bgm_replacement_mode && typeof obj.bgm_replacement_mode === 'object' ? (obj.bgm_replacement_mode as Record<string, unknown>) : {};
  return {
    mode: mode(obj.mode),
    sound_effect_mode: {
      filename: str(se.filename, DEFAULT_SOUND_EFFECT_MODE.filename),
      volume: clamp(se.volume, DEFAULT_SOUND_EFFECT_MODE.volume, 0, 100),
      bgm_volume_reduction_percent: clamp(se.bgm_volume_reduction_percent, DEFAULT_SOUND_EFFECT_MODE.bgm_volume_reduction_percent, 0, 100),
    },
    bgm_replacement_mode: {
      filename: str(bgm.filename, DEFAULT_BGM_REPLACEMENT_MODE.filename),
      volume: clamp(bgm.volume, DEFAULT_BGM_REPLACEMENT_MODE.volume, 0, 100),
      fade_in_ms: Math.max(0, num(bgm.fade_in_ms, DEFAULT_BGM_REPLACEMENT_MODE.fade_in_ms)),
      restore_fade_in_ms: Math.max(0, num(bgm.restore_fade_in_ms, DEFAULT_BGM_REPLACEMENT_MODE.restore_fade_in_ms)),
    },
  };
};

export type ReadCriticalHealthAudioConfigInput = { projectPath: string };
export type ReadCriticalHealthAudioConfigOutput = { config: CriticalHealthAudioConfig };

const readCriticalHealthAudioConfig = async (payload: ReadCriticalHealthAudioConfigInput): Promise<ReadCriticalHealthAudioConfigOutput> => {
  log.info('read-critical-health-audio-config');
  const filePath = path.join(payload.projectPath, RELATIVE_CONFIG_PATH);

  if (!fs.existsSync(filePath)) {
    log.info('read-critical-health-audio-config/missing-default');
    return { config: buildDefaultCriticalHealthAudioConfig() };
  }

  const raw = fs.readFileSync(filePath, { encoding: 'utf-8' });
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    // Throw a string — IPC cannot serialize Error instances.
    throw `critical_health_audio_config.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw 'critical_health_audio_config.json does not contain a JSON object.';
  }

  log.info('read-critical-health-audio-config/success');
  return { config: sanitize(parsed) };
};

export type SaveCriticalHealthAudioConfigInput = { projectPath: string; config: CriticalHealthAudioConfig };
export type SaveCriticalHealthAudioConfigOutput = Record<string, never>;

const saveCriticalHealthAudioConfig = async (payload: SaveCriticalHealthAudioConfigInput): Promise<SaveCriticalHealthAudioConfigOutput> => {
  log.info('save-critical-health-audio-config');
  const filePath = path.join(payload.projectPath, RELATIVE_CONFIG_PATH);

  // The plugins folder may not exist on projects that have never used a plugin.
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  // Re-emit only the known keys, in the documented order, both sub-objects present.
  const toWrite = sanitize(payload.config);
  fs.writeFileSync(filePath, JSON.stringify(toWrite, null, 2));

  log.info('save-critical-health-audio-config/success');
  return {};
};

export const registerReadCriticalHealthAudioConfig = defineBackendServiceFunction('read-critical-health-audio-config', readCriticalHealthAudioConfig);
export const registerSaveCriticalHealthAudioConfig = defineBackendServiceFunction('save-critical-health-audio-config', saveCriticalHealthAudioConfig);
