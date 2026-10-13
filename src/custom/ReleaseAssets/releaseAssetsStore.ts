import { useEffect, useSyncExternalStore } from 'react';
import { useGlobalState } from '@src/GlobalStateProvider';

import { assetKey, emptySelection, type ReleaseAsset, type ReleaseAssetsScan, type ReleaseAssetsSelection } from './types';
import { clearReleaseAssetsPending, getReleaseAssetsPending, setReleaseAssetsPending } from './releaseAssetsPendingSave';

/**
 * Store for the Release assets page (and the build dialog's summary).
 *
 * Loads the saved selection, then runs the scan (a few seconds; read-only).
 * The selection lives here; every change is also parked in the pending-save
 * module so the bottom-left "Save data" button owns the write. Parked edits for
 * the same project are restored on revisit, so navigating away never loses work.
 */

type Status = 'idle' | 'loading' | 'scanning' | 'ready' | 'error';
type StoreState = {
  projectPath: string | null;
  status: Status;
  error?: string;
  scan: ReleaseAssetsScan | null;
  selection: ReleaseAssetsSelection;
  /** No release_assets.json yet (nothing flagged as new, everything ships). */
  neverSaved: boolean;
  /** Selections before each change, for Undo. */
  history: ReleaseAssetsSelection[];
};

const UNDO_LIMIT = 30;

let state: StoreState = { projectPath: null, status: 'idle', scan: null, selection: emptySelection(), neverSaved: true, history: [] };
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

const runScan = (projectPath: string) => {
  setState({ ...state, status: 'scanning', error: undefined });
  window.api.scanReleaseAssets(
    { projectPath },
    ({ scan }) => {
      if (state.projectPath !== projectPath) return;
      setState({ ...state, status: 'ready', scan });
    },
    ({ errorMessage }) => {
      if (state.projectPath !== projectPath) return;
      setState({ ...state, status: 'error', error: errorMessage });
    }
  );
};

/** Load the selection then scan, once per project. */
export const loadReleaseAssetsForProject = (projectPath: string | null) => {
  if (!projectPath) {
    if (state.projectPath !== null) setState({ projectPath: null, status: 'idle', scan: null, selection: emptySelection(), neverSaved: true, history: [] });
    return;
  }
  if (state.projectPath === projectPath && state.status !== 'idle') return;

  const pending = getReleaseAssetsPending();
  if (pending && pending.projectPath !== projectPath) clearReleaseAssetsPending();

  setState({ projectPath, status: 'loading', scan: null, selection: emptySelection(), neverSaved: true, history: [] });
  window.api.readReleaseAssetsSelection(
    { projectPath },
    ({ selection }) => {
      if (state.projectPath !== projectPath) return;
      const restored = pending && pending.projectPath === projectPath ? pending.selection : selection;
      setState({ ...state, selection: restored ?? emptySelection(), neverSaved: !selection });
      runScan(projectPath);
    },
    ({ errorMessage }) => {
      if (state.projectPath !== projectPath) return;
      setState({ ...state, status: 'error', error: errorMessage });
    }
  );
};

/** Scan again (after adding or removing files). */
export const rescanReleaseAssets = () => {
  if (state.projectPath && state.status !== 'loading' && state.status !== 'scanning') runScan(state.projectPath);
};

/** Apply a change: remember the previous selection for Undo and park for save. */
const commit = (selection: ReleaseAssetsSelection) => {
  if (!state.projectPath) return;
  const scanned = state.scan?.assets;
  // Saved alongside: every asset known now (for "new since last review"), and only
  // exclusions of files that still exist.
  const existing = scanned ? new Set(scanned.map((a) => assetKey(a.path))) : null;
  const next: ReleaseAssetsSelection = {
    ...selection,
    excluded: existing ? selection.excluded.filter((p) => existing.has(assetKey(p))) : selection.excluded,
    reviewed: existing ? [...existing] : selection.reviewed,
  };
  setState({ ...state, selection: next, history: [...state.history, state.selection].slice(-UNDO_LIMIT) });
  setReleaseAssetsPending(state.projectPath, next);
};

/** Check or uncheck assets by hand (a file or a whole folder). Recorded as manual choices. */
export const setAssetsIncluded = (assets: ReleaseAsset[], include: boolean) => {
  const excluded = new Map(state.selection.excluded.map((p) => [assetKey(p), p]));
  const manual = { ...state.selection.manual };
  for (const asset of assets) {
    const key = assetKey(asset.path);
    if (include) excluded.delete(key);
    else excluded.set(key, asset.path);
    manual[key] = include ? 'include' : 'exclude';
  }
  commit({ ...state.selection, excluded: [...excluded.values()], manual });
};

/** Uncheck every asset the scan found unused, leaving hand-made choices alone. */
export const removeUnusedAssets = () => {
  if (!state.scan) return 0;
  const excluded = new Map(state.selection.excluded.map((p) => [assetKey(p), p]));
  let count = 0;
  for (const asset of state.scan.assets) {
    const key = assetKey(asset.path);
    if (asset.status !== 'unused' || state.selection.manual[key] || excluded.has(key)) continue;
    excluded.set(key, asset.path);
    count += 1;
  }
  if (count) commit({ ...state.selection, excluded: [...excluded.values()] });
  return count;
};

/** Forget every hand-made choice and include everything again. */
export const includeAllAssets = () => commit({ ...state.selection, excluded: [], manual: {} });

export const setReleaseAssetsEnabled = (enabled: boolean) => commit({ ...state.selection, enabled });

export const undoReleaseAssets = () => {
  if (!state.projectPath || !state.history.length) return;
  const previous = state.history[state.history.length - 1];
  const history = state.history.slice(0, -1);
  setState({ ...state, selection: previous, history });
  // Undone back to what was loaded: nothing left to save.
  if (history.length) setReleaseAssetsPending(state.projectPath, previous);
  else clearReleaseAssetsPending();
};

export const useReleaseAssets = () => {
  const [{ projectPath }] = useGlobalState();
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);
  useEffect(() => {
    loadReleaseAssetsForProject(projectPath ?? null);
  }, [projectPath]);
  return snapshot;
};
