import { configFromDraft, type CraftingDraft } from './types';

/**
 * Fork-owned module store for the unsaved Crafting config, mirroring
 * `outfitPendingSave` / `ambientCriesPendingSave`. The crafting config lives in a
 * plugin JSON, not Studio's tracked project data, so it can't ride the normal
 * save pipeline on its own. The editor parks its unsaved draft here and the app
 * shell's SaveProjectButton flushes it on "Save data"/"Save all" (and shows the
 * same unsaved dot) — so crafting edits use the one bottom-left save button like
 * everything else, with no separate button of their own.
 *
 * Never writes to disk on its own: nothing here calls the backend until the user
 * explicitly triggers a save. Memory-only — unsaved work is lost on force-quit.
 */

type Pending = { projectPath: string; draft: CraftingDraft } | null;

let pending: Pending = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

/** Record the current unsaved crafting draft (replaces any previous pending). */
export const setCraftingPending = (projectPath: string, draft: CraftingDraft) => {
  pending = { projectPath, draft };
  notify();
};

export const clearCraftingPending = () => {
  if (!pending) return;
  pending = null;
  notify();
};

export const getCraftingPending = (): Pending => pending;

export const subscribeCraftingPending = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/**
 * Write the pending draft to disk (collapsing it to the persisted config shape),
 * then clear it. Resolves immediately when nothing is pending, so the save button
 * can always await it unconditionally.
 */
export const flushCraftingSave = (): Promise<void> =>
  new Promise((resolve, reject) => {
    const p = pending;
    if (!p) return resolve();
    window.api.saveCraftingConfig(
      { projectPath: p.projectPath, config: configFromDraft(p.draft) },
      () => {
        clearCraftingPending();
        resolve();
      },
      ({ errorMessage }) => reject(new Error(errorMessage))
    );
  });
