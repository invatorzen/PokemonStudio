import type { AmbientCriesConfig } from './types';

/**
 * Fork-owned module store for the unsaved Ambient Cries config, mirroring
 * `grottoPendingSave` / `outfitPendingSave` / `sosPendingSave`. The config lives
 * in a plugin JSON, not Studio's tracked project data, so it can't ride the
 * normal save pipeline on its own. Both surfaces (the global dashboard page and
 * the per-zone block) edit the SAME config, so they share this one pending store:
 * every edit parks the whole config here and the app shell's SaveProjectButton
 * flushes it on "Save data"/"Save all" (and shows the same unsaved dot).
 *
 * Never writes to disk on its own: nothing here calls the backend until the user
 * explicitly triggers a save. Memory-only, like the other pending stores —
 * unsaved work is lost on force-quit.
 */

type Pending = { projectPath: string; config: AmbientCriesConfig } | null;

let pending: Pending = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

/** Record the current unsaved config (replaces any previous pending). */
export const setAmbientCriesPending = (projectPath: string, config: AmbientCriesConfig) => {
  pending = { projectPath, config };
  notify();
};

export const clearAmbientCriesPending = () => {
  if (!pending) return;
  pending = null;
  notify();
};

export const getAmbientCriesPending = (): Pending => pending;

export const subscribeAmbientCriesPending = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/**
 * Write the pending config to disk, then clear it. Resolves immediately when
 * nothing is pending, so the save button can always await it unconditionally.
 */
export const flushAmbientCriesSave = (): Promise<void> =>
  new Promise((resolve, reject) => {
    const p = pending;
    if (!p) return resolve();
    window.api.saveAmbientCriesConfig(
      { projectPath: p.projectPath, config: p.config },
      () => {
        clearAmbientCriesPending();
        resolve();
      },
      ({ errorMessage }) => reject(new Error(errorMessage))
    );
  });
