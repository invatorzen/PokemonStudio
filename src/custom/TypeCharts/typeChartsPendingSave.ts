import type { TypeChartsConfig } from './types';

/**
 * Fork-owned module store for the unsaved type-charts config, mirroring
 * `craftingPendingSave` / `mapSettingsPendingSave`. The charts live in a
 * fork-owned data folder (`Data/configs/type_charts/`), not Studio's tracked
 * project data, so they can't ride the normal save pipeline on their own. The
 * editor parks its unsaved config here and the app shell's SaveProjectButton
 * flushes it on "Save data"/"Save all" (and shows the same unsaved dot) — so
 * type-chart edits use the one bottom-left save button like everything else,
 * with no separate button of their own.
 *
 * Never writes to disk on its own: nothing here calls the backend until the user
 * explicitly triggers a save. Memory-only — unsaved work is lost on force-quit.
 */

type Pending = { projectPath: string; config: TypeChartsConfig } | null;

let pending: Pending = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

/** Record the current unsaved type-charts config (replaces any previous pending). */
export const setTypeChartsPending = (projectPath: string, config: TypeChartsConfig) => {
  pending = { projectPath, config };
  notify();
};

export const clearTypeChartsPending = () => {
  if (!pending) return;
  pending = null;
  notify();
};

export const getTypeChartsPending = (): Pending => pending;

export const subscribeTypeChartsPending = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/**
 * Write the pending config to disk, then clear it. Resolves immediately when
 * nothing is pending, so the save button can always await it unconditionally.
 */
export const flushTypeChartsSave = (): Promise<void> =>
  new Promise((resolve, reject) => {
    const p = pending;
    if (!p) return resolve();
    window.api.saveTypeChartsConfig(
      { projectPath: p.projectPath, config: p.config },
      () => {
        clearTypeChartsPending();
        resolve();
      },
      ({ errorMessage }) => reject(new Error(errorMessage))
    );
  });
