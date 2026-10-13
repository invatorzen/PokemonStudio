import type { ReleaseAssetsSelection } from './types';

/**
 * Unsaved release-asset selection, flushed by the app shell's SaveProjectButton
 * on "Save data" / "Save all" (same unsaved dot), like the other fork pending
 * stores. Nothing here writes to disk until the user saves. Memory-only.
 */

type Pending = { projectPath: string; selection: ReleaseAssetsSelection } | null;

let pending: Pending = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

export const setReleaseAssetsPending = (projectPath: string, selection: ReleaseAssetsSelection) => {
  pending = { projectPath, selection };
  notify();
};

export const clearReleaseAssetsPending = () => {
  if (!pending) return;
  pending = null;
  notify();
};

export const getReleaseAssetsPending = (): Pending => pending;

export const subscribeReleaseAssetsPending = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Write the pending selection to `release_assets.json`, then clear it. Resolves at once when nothing is pending. */
export const flushReleaseAssetsSave = (): Promise<void> =>
  new Promise((resolve, reject) => {
    const p = pending;
    if (!p) return resolve();
    window.api.saveReleaseAssetsSelection(
      { projectPath: p.projectPath, selection: p.selection },
      () => {
        clearReleaseAssetsPending();
        resolve();
      },
      ({ errorMessage }) => reject(new Error(errorMessage))
    );
  });
