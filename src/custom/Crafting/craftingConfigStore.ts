import { useEffect, useSyncExternalStore } from 'react';
import { useGlobalState } from '@src/GlobalStateProvider';

import { clearCraftingPending, getCraftingPending, setCraftingPending } from './craftingPendingSave';
import {
  buildEmptyCraftingDraft,
  buildLeafNode,
  draftFromConfig,
  nextCraftingId,
  type CategoryDraft,
  type CraftingConfig,
  type CraftingDraft,
  type RecipeDraft,
} from './types';

/**
 * Fork-owned module store for the Crafting config.
 *
 * The Categories tab and the Recipes tab are separate routes (only one mounts at
 * a time) but edit the SAME config file. This single store loads the plugin JSON
 * once per project (a backend read), exposes typed mutators for both tabs, and a
 * `subscribe` / `getSnapshot` pair so every surface stays in sync through
 * `useSyncExternalStore`. Every mutation parks the whole draft in
 * `craftingPendingSave`, so the bottom-left "Save data" button owns the actual
 * write — no auto-save and no button of its own.
 */

type Status = 'idle' | 'loading' | 'ready' | 'error';
type StoreState = {
  projectPath: string | null;
  status: Status;
  draft: CraftingDraft;
  error?: string;
};

let state: StoreState = { projectPath: null, status: 'idle', draft: buildEmptyCraftingDraft() };
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
const setState = (next: StoreState) => {
  state = next;
  notify();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const getSnapshot = () => state;

/**
 * Lazily (re)load the config for a project. Idempotent per project: repeated
 * calls while loaded/loading for the same project are no-ops, so mounting both
 * tabs triggers a single read. Unsaved edits parked from a previous visit are
 * restored instead of re-reading disk; pending for a different project is dropped.
 */
export const loadCraftingConfigForProject = (projectPath: string | null) => {
  if (!projectPath) {
    if (state.projectPath !== null || state.status !== 'idle') {
      setState({ projectPath: null, status: 'idle', draft: buildEmptyCraftingDraft() });
    }
    return;
  }
  if (state.projectPath === projectPath && state.status !== 'idle') return;

  const pending = getCraftingPending();
  if (pending && pending.projectPath !== projectPath) clearCraftingPending();
  if (pending && pending.projectPath === projectPath) {
    setState({ projectPath, status: 'ready', draft: pending.draft });
    return;
  }

  setState({ projectPath, status: 'loading', draft: buildEmptyCraftingDraft() });
  window.api.readCraftingConfig(
    { projectPath },
    ({ config }) => {
      // Guard against a late response after the project changed.
      if (state.projectPath !== projectPath) return;
      setState({ projectPath, status: 'ready', draft: draftFromConfig(config as CraftingConfig) });
    },
    ({ errorMessage }) => {
      if (state.projectPath !== projectPath) return;
      setState({ projectPath, status: 'error', draft: buildEmptyCraftingDraft(), error: errorMessage });
    }
  );
};

const parkAndSet = (draft: CraftingDraft) => {
  if (!state.projectPath) return;
  setState({ ...state, draft });
  setCraftingPending(state.projectPath, draft);
};

const setCategories = (categories: CategoryDraft[]) => parkAndSet({ ...state.draft, categories });
const setRecipes = (recipes: RecipeDraft[]) => parkAndSet({ ...state.draft, recipes });

/* ------------------------------- categories ------------------------------- */

export const addCategory = () => setCategories([...state.draft.categories, { id: nextCraftingId('cat'), key: '', icon: 0 }]);

export const updateCategory = (id: string, patch: Partial<Omit<CategoryDraft, 'id'>>) =>
  setCategories(state.draft.categories.map((row) => (row.id === id ? { ...row, ...patch } : row)));

export const deleteCategory = (id: string) => setCategories(state.draft.categories.filter((row) => row.id !== id));

/** Move a category by one slot (order is meaningful on disk). */
export const moveCategory = (id: string, direction: -1 | 1) => {
  const rows = state.draft.categories;
  const index = rows.findIndex((row) => row.id === id);
  const target = index + direction;
  if (index === -1 || target < 0 || target >= rows.length) return;
  const next = rows.slice();
  [next[index], next[target]] = [next[target], next[index]];
  setCategories(next);
};

/* -------------------------------- recipes --------------------------------- */

/** Append a fresh recipe and return its id, so the caller can select it. */
export const addRecipe = (): string => {
  const id = nextCraftingId('recipe');
  setRecipes([
    ...state.draft.recipes,
    {
      id,
      key: '',
      result: '',
      quantity: 1,
      category: '',
      maxCraft: null,
      ingredients: [],
      condition: buildLeafNode({ type: 'manual', value: true }),
    },
  ]);
  return id;
};

export const updateRecipe = (id: string, patch: Partial<Omit<RecipeDraft, 'id'>>) =>
  setRecipes(state.draft.recipes.map((row) => (row.id === id ? { ...row, ...patch } : row)));

export const deleteRecipe = (id: string) => setRecipes(state.draft.recipes.filter((row) => row.id !== id));

/**
 * Hook wrapping the store. The first tab to mount for a project triggers the lazy
 * load; every surface re-renders on any change.
 */
export const useCraftingConfig = () => {
  const [{ projectPath }] = useGlobalState();
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);

  useEffect(() => {
    loadCraftingConfigForProject(projectPath ?? null);
  }, [projectPath]);

  return {
    projectPath,
    status: snapshot.status,
    error: snapshot.error,
    draft: snapshot.draft,
    addCategory,
    updateCategory,
    deleteCategory,
    moveCategory,
    addRecipe,
    updateRecipe,
    deleteRecipe,
  };
};
