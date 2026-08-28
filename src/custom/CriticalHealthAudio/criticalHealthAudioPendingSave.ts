import type { CriticalHealthAudioConfig } from './types';

/**
 * Fork-owned module store for the unsaved Critical Health Audio config, mirroring
 * `ambientCriesPendingSave` / `outfitPendingSave` / `sosPendingSave`. The config
 * lives in a plugin JSON, not Studio's tracked project data, so it can't ride the
 * normal save pipeline on its own. Every edit parks the whole config here and the
 * app shell's SaveProjectButton flushes it on "Save data"/"Save all" (and shows
 * the same unsaved dot).
 *
 * Never writes to disk on its own: nothing here calls the backend until the user
 * explicitly triggers a save. Memory-only, like the other pending stores —
 * unsaved work is lost on force-quit.
 */

type Pending = { projectPath: string; config: CriticalHealthAudioConfig } | null;

let pending: Pending = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

/** Record the current unsaved config (replaces any previous pending). */
export const setCriticalHealthAudioPending = (projectPath: string, config: CriticalHealthAudioConfig) => {
  pending = { projectPath, config };
  notify();
};

export const clearCriticalHealthAudioPending = () => {
  if (!pending) return;
  pending = null;
  notify();
};

export const getCriticalHealthAudioPending = (): Pending => pending;

export const subscribeCriticalHealthAudioPending = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/**
 * Write the pending config to disk, then clear it. Resolves immediately when
 * nothing is pending, so the save button can always await it unconditionally.
 */
export const flushCriticalHealthAudioSave = (): Promise<void> =>
  new Promise((resolve, reject) => {
    const p = pending;
    if (!p) return resolve();
    window.api.saveCriticalHealthAudioConfig(
      { projectPath: p.projectPath, config: p.config },
      () => {
        clearCriticalHealthAudioPending();
        resolve();
      },
      ({ errorMessage }) => reject(new Error(errorMessage))
    );
  });
