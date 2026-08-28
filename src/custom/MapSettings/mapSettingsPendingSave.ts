import type { MapSettingsConfig } from './types';

/**
 * Fork-owned module store for the unsaved per-map Settings config, mirroring
 * `craftingPendingSave` / `ambientCriesPendingSave`. The config lives in a plugin
 * JSON, not Studio's tracked project data, so it rides the app shell's
 * SaveProjectButton (same "Save data" button + unsaved dot) instead of a button
 * of its own. Memory-only until the user explicitly saves — nothing here writes
 * to disk on its own.
 */

type Pending = { projectPath: string; config: MapSettingsConfig } | null;

let pending: Pending = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

export const setMapSettingsPending = (projectPath: string, config: MapSettingsConfig) => {
  pending = { projectPath, config };
  notify();
};

export const clearMapSettingsPending = () => {
  if (!pending) return;
  pending = null;
  notify();
};

export const getMapSettingsPending = (): Pending => pending;

export const subscribeMapSettingsPending = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/**
 * Write the pending config to disk, then clear it. Resolves immediately when
 * nothing is pending, so the save button can always await it unconditionally.
 */
export const flushMapSettingsSave = (): Promise<void> =>
  new Promise((resolve, reject) => {
    const p = pending;
    if (!p) return resolve();
    window.api.saveMapSettingsConfig(
      { projectPath: p.projectPath, config: p.config },
      () => {
        clearMapSettingsPending();
        resolve();
      },
      ({ errorMessage }) => reject(new Error(errorMessage))
    );
  });
