import type { ChangeEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useGlobalState } from '@src/GlobalStateProvider';
import { cleanNaNValue } from '@utils/cleanNaNValue';

import { clearOutfitPending, getOutfitPending, setOutfitPending } from './outfitPendingSave';
import { buildEmptyOutfitDraft, draftFromConfig, nextOutfitRowId } from './types';
import type { OutfitConfig, OutfitDraft, OutfitEntry } from './types';

export type OutfitLoadState = { status: 'idle' | 'loading' | 'ready' } | { status: 'error'; message: string };

/**
 * Shared editor state for the Easy Outfits config, used by both the Settings and
 * the Outfits tabs. Each tab is its own route (only one mounts at a time), so
 * they stay in sync through the module-level pending store: every edit parks the
 * whole draft there, and mounting restores it — so switching tabs, or leaving
 * and coming back, never loses the slot settings or the outfit rows, and the one
 * bottom-left Save button flushes the lot. Nothing is written to disk until then.
 */
export const useOutfitDraft = () => {
  const [state] = useGlobalState();
  const projectPath = state.projectPath;

  const [draft, setDraft] = useState<OutfitDraft>(buildEmptyOutfitDraft);
  const [loadState, setLoadState] = useState<OutfitLoadState>({ status: 'idle' });
  // Flips on the first edit so the park effect only stores real changes.
  const dirtyRef = useRef(false);

  useEffect(() => {
    dirtyRef.current = false;
    if (!projectPath) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoadState({ status: 'idle' });
      return;
    }
    const pending = getOutfitPending();
    if (pending && pending.projectPath !== projectPath) clearOutfitPending();
    if (pending && pending.projectPath === projectPath) {
      dirtyRef.current = true;
      setDraft(pending.draft);
      setLoadState({ status: 'ready' });
      return;
    }
    setLoadState({ status: 'loading' });
    const cancel = window.api.readOutfitConfig(
      { projectPath },
      ({ config }) => {
        setDraft(draftFromConfig(config as OutfitConfig));
        setLoadState({ status: 'ready' });
      },
      ({ errorMessage }) => setLoadState({ status: 'error', message: errorMessage })
    );
    return cancel;
  }, [projectPath]);

  const markDirty = () => {
    dirtyRef.current = true;
  };

  // Park edits in the shared save store so the bottom-left "Save data" button
  // owns them — nothing is written to disk until the user explicitly saves.
  useEffect(() => {
    if (!dirtyRef.current || !projectPath) return;
    setOutfitPending(projectPath, draft);
  }, [draft, projectPath]);

  const updateSlot = (key: 'outfit_bag_slot' | 'outfit_icon_slot') => (event: ChangeEvent<HTMLInputElement>) => {
    const value = Math.max(0, cleanNaNValue(parseInt(event.target.value, 10), 0));
    setDraft((prev) => ({ ...prev, [key]: value }));
    markDirty();
  };

  /** Append a fresh outfit row and return its id, so the caller can select it. */
  const addOutfit = (): string => {
    const id = nextOutfitRowId();
    setDraft((prev) => ({
      ...prev,
      rows: [...prev.rows, { id, key: '', entry: { overworld: '', back_sprite: '' } }],
    }));
    markDirty();
    return id;
  };

  const changeKey = (id: string, key: string) => {
    setDraft((prev) => ({ ...prev, rows: prev.rows.map((row) => (row.id === id ? { ...row, key } : row)) }));
    markDirty();
  };

  const changeEntry = (id: string, entry: OutfitEntry) => {
    setDraft((prev) => ({ ...prev, rows: prev.rows.map((row) => (row.id === id ? { ...row, entry } : row)) }));
    markDirty();
  };

  const deleteRow = (id: string) => {
    setDraft((prev) => ({ ...prev, rows: prev.rows.filter((row) => row.id !== id) }));
    markDirty();
  };

  return { projectPath, loadState, draft, updateSlot, addOutfit, changeKey, changeEntry, deleteRow };
};
