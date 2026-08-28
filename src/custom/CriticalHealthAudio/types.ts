/**
 * Shared, renderer-safe types for the Critical Health Audio feature.
 *
 * Mirrors the on-disk shape of the Critical Health Audio plugin config at
 * `Data/configs/plugins/critical_health_audio_config.json`. The plugin reads
 * these exact keys. Imported with `import type` from both the backend task and
 * the renderer so there is one source of truth without pulling main-process code
 * into the renderer bundle.
 *
 * This is a single global config: `mode` selects which behavior the game uses,
 * but BOTH sub-objects are always present on disk so switching modes never loses
 * the numbers the user typed for the other one.
 *
 * Audio filenames are stored as project-relative paths WITHOUT an extension
 * (e.g. `audio/se/low_health`, `audio/bgm/battle_low_hp`) — the plugin resolves
 * the extension at runtime the way PSDK's audio system does.
 */

export type CriticalHealthAudioMode = 'sound_effect' | 'bgm_replacement';

/** The sound-effect behavior: play a looping SE and duck the current BGM. */
export type CriticalHealthSoundEffectMode = {
  /** SE path under `audio/se/`, no extension (e.g. `audio/se/low_health`). */
  filename: string;
  /** Playback volume, 0–100. */
  volume: number;
  /** How much to lower the running BGM while the SE plays, 0–100 (%). */
  bgm_volume_reduction_percent: number;
};

/** The BGM-replacement behavior: swap the battle BGM for a low-HP track. */
export type CriticalHealthBgmReplacementMode = {
  /** BGM path under `audio/bgm/`, no extension (e.g. `audio/bgm/battle_low_hp`). */
  filename: string;
  /** Playback volume, 0–100. */
  volume: number;
  /** Fade-in when the replacement track starts, in ms (≥ 0). */
  fade_in_ms: number;
  /** Fade-in when the original BGM is restored, in ms (≥ 0). */
  restore_fade_in_ms: number;
};

/** The whole config as written to disk. Both sub-objects are always present. */
export type CriticalHealthAudioConfig = {
  mode: CriticalHealthAudioMode;
  sound_effect_mode: CriticalHealthSoundEffectMode;
  bgm_replacement_mode: CriticalHealthBgmReplacementMode;
};

export const DEFAULT_CRITICAL_HEALTH_AUDIO_MODE: CriticalHealthAudioMode = 'sound_effect';

export const DEFAULT_SOUND_EFFECT_MODE: CriticalHealthSoundEffectMode = {
  filename: 'audio/se/low_health',
  volume: 100,
  bgm_volume_reduction_percent: 35,
};

export const DEFAULT_BGM_REPLACEMENT_MODE: CriticalHealthBgmReplacementMode = {
  filename: 'audio/bgm/battle_low_hp',
  volume: 100,
  fade_in_ms: 500,
  restore_fade_in_ms: 500,
};

export const buildDefaultCriticalHealthAudioConfig = (): CriticalHealthAudioConfig => ({
  mode: DEFAULT_CRITICAL_HEALTH_AUDIO_MODE,
  sound_effect_mode: { ...DEFAULT_SOUND_EFFECT_MODE },
  bgm_replacement_mode: { ...DEFAULT_BGM_REPLACEMENT_MODE },
});
