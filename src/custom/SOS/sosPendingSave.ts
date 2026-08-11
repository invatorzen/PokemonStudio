import { SOS_BATTLES_KLASS, type SosConfig } from './types';

/**
 * Fork-owned module store for unsaved SOS-battle config, mirroring
 * `grottoPendingSave`. The SOS config lives in a plugin JSON, not Studio's
 * tracked project data, so it can't ride the normal save pipeline on its own.
 * Instead the config store parks its unsaved config here and the app shell's
 * SaveProjectButton flushes it on "Save data" (and shows the same unsaved dot) —
 * so SOS edits use the one bottom-left save button like everything else, with no
 * separate button of their own.
 *
 * Memory-only, like the map pending edits: unsaved work is lost on force-quit.
 */

type Pending = { projectPath: string; config: SosConfig } | null;

let pending: Pending = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

/** Record the current unsaved SOS config (replaces any previous pending). */
export const setSosPending = (projectPath: string, config: SosConfig) => {
  pending = { projectPath, config };
  notify();
};

export const clearSosPending = () => {
  if (!pending) return;
  pending = null;
  notify();
};

export const getSosPending = (): Pending => pending;

export const subscribeSosPending = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/**
 * Write the pending config to disk, then clear it. Resolves immediately when
 * nothing is pending, so the save button can always await it unconditionally.
 */
export const flushSosSave = (): Promise<void> =>
  new Promise((resolve, reject) => {
    const p = pending;
    if (!p) return resolve();
    window.api.writeSosBattle(
      { projectPath: p.projectPath, config: { ...p.config, klass: SOS_BATTLES_KLASS } },
      () => {
        clearSosPending();
        resolve();
      },
      ({ errorMessage }) => reject(new Error(errorMessage))
    );
  });
