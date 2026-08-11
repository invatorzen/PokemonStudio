import { HIDDEN_GROTTO_KLASS, type HiddenGrottoConfig } from './types';

/**
 * Fork-owned module store for unsaved Hidden Grottos config, mirroring the map
 * editor's `pendingEdits` store. The grotto config lives in a plugin JSON, not
 * Studio's tracked project data, so it can't ride the normal save pipeline on
 * its own. Instead the editor parks its unsaved config here and the app shell's
 * SaveProjectButton flushes it on "Save all" (and shows the same unsaved dot) —
 * so grotto edits use the one bottom-left save button like everything else,
 * with no separate button of their own.
 *
 * Memory-only, like the map pending edits: unsaved work is lost on force-quit.
 */

type Pending = { projectPath: string; config: HiddenGrottoConfig } | null;

let pending: Pending = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

/** Record the current unsaved grotto config (replaces any previous pending). */
export const setGrottoPending = (projectPath: string, config: HiddenGrottoConfig) => {
  pending = { projectPath, config };
  notify();
};

export const clearGrottoPending = () => {
  if (!pending) return;
  pending = null;
  notify();
};

export const getGrottoPending = (): Pending => pending;

export const subscribeGrottoPending = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/**
 * Write the pending config to disk, then clear it. Resolves immediately when
 * nothing is pending, so the save button can always await it unconditionally.
 */
export const flushGrottoSave = (): Promise<void> =>
  new Promise((resolve, reject) => {
    const p = pending;
    if (!p) return resolve();
    window.api.writeHiddenGrotto(
      { projectPath: p.projectPath, config: { ...p.config, klass: HIDDEN_GROTTO_KLASS } },
      () => {
        clearGrottoPending();
        resolve();
      },
      ({ errorMessage }) => reject(new Error(errorMessage))
    );
  });
