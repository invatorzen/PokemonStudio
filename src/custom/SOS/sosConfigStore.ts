import { useEffect, useSyncExternalStore } from 'react';
import { useGlobalState } from '@src/GlobalStateProvider';

import { buildEmptySosConfig, type SosConfig, type SosEntry } from './types';
import { clearSosPending, getSosPending, setSosPending } from './sosPendingSave';

/**
 * Fork-owned module store for the SOS-battle config.
 *
 * The SOS DataBlock and the SOS editor are separate components on the Pokémon
 * page, so the config can't live in either one's local state. This single store
 * loads the plugin JSON once per project (a backend read), exposes
 * `getSosEntry` / `setSosEntry` to read and mutate a caller's ally table, and a
 * `subscribe` / `getSnapshot` pair so both components stay in sync through
 * `useSyncExternalStore`. Every mutation also parks the whole config in
 * `sosPendingSave`, so the bottom-left "Save data" button owns the actual write.
 */

type Status = 'idle' | 'loading' | 'ready' | 'error';
type StoreState = {
  projectPath: string | null;
  status: Status;
  config: SosConfig;
  error?: string;
};

let state: StoreState = { projectPath: null, status: 'idle', config: buildEmptySosConfig() };
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
 * the DataBlock and the editor triggers a single read. Unsaved edits parked from
 * a previous visit are restored instead of re-reading disk, so navigating away
 * and back never loses work; pending for a different project is stale and dropped.
 */
export const loadSosConfigForProject = (projectPath: string | null) => {
  if (!projectPath) {
    if (state.projectPath !== null || state.status !== 'idle') {
      setState({ projectPath: null, status: 'idle', config: buildEmptySosConfig() });
    }
    return;
  }
  if (state.projectPath === projectPath && state.status !== 'idle') return;

  const pending = getSosPending();
  if (pending && pending.projectPath !== projectPath) clearSosPending();
  if (pending && pending.projectPath === projectPath) {
    setState({ projectPath, status: 'ready', config: pending.config });
    return;
  }

  setState({ projectPath, status: 'loading', config: buildEmptySosConfig() });
  window.api.readSosBattle(
    { projectPath },
    ({ config }) => {
      // Guard against a late response after the project changed.
      if (state.projectPath !== projectPath) return;
      setState({ projectPath, status: 'ready', config });
    },
    ({ errorMessage }) => {
      if (state.projectPath !== projectPath) return;
      setState({ projectPath, status: 'error', config: buildEmptySosConfig(), error: errorMessage });
    }
  );
};

/** The caller's SOS entry, or `undefined` when the species has no SOS config. */
export const getSosEntry = (dbSymbol: string): SosEntry | undefined => state.config.species[dbSymbol];

/**
 * Write a caller's SOS entry into `species`, normalized to the bridge contract.
 *
 * SOS is opt-out: a species calls by default, so "no entry" already means
 * enabled. An entry is only worth persisting when it departs from that default —
 * it is disabled (`enabled: false`), or it customizes allies or the call rate.
 * The default state (enabled, no allies, no rate) drops the key so an
 * unconfigured species leaves no trace. `enabled` is written only when `false`,
 * matching the seed convention where enabled callers omit the key.
 *
 * Mutations park the config so the bottom-left save button persists them; there
 * is no auto-save to disk here.
 */
export const setSosEntry = (dbSymbol: string, entry: SosEntry | null) => {
  if (!state.projectPath) return;
  const species = { ...state.config.species };

  const isDefault = !entry || (entry.enabled !== false && entry.allies.length === 0 && entry.call_rate === undefined);
  if (isDefault) {
    delete species[dbSymbol];
  } else {
    const normalized: SosEntry = { allies: entry!.allies };
    if (entry!.call_rate !== undefined) normalized.call_rate = entry!.call_rate;
    if (entry!.enabled === false) normalized.enabled = false;
    species[dbSymbol] = normalized;
  }

  const config = { ...state.config, species };
  setState({ ...state, config });
  setSosPending(state.projectPath, config);
};

/**
 * Replace the global `settings` block. Merges over whatever was on disk so any
 * key the editor does not surface round-trips untouched, then parks the config
 * for the bottom-left save button — same no-auto-save contract as setSosEntry.
 */
export const setSosSettings = (settings: Record<string, unknown>) => {
  if (!state.projectPath) return;
  const merged = { ...(state.config.settings ?? {}), ...settings };
  const config = { ...state.config, settings: merged };
  setState({ ...state, config });
  setSosPending(state.projectPath, config);
};

/**
 * Hook wrapping the store. The first component to mount for a project triggers
 * the lazy load; both the DataBlock and the editor re-render on any change.
 */
export const useSosConfig = () => {
  const [{ projectPath }] = useGlobalState();
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);

  useEffect(() => {
    loadSosConfigForProject(projectPath ?? null);
  }, [projectPath]);

  return {
    status: snapshot.status,
    error: snapshot.error,
    config: snapshot.config,
    getEntry: (dbSymbol: string): SosEntry | undefined => snapshot.config.species[dbSymbol],
    setEntry: setSosEntry,
    settings: snapshot.config.settings,
    setSettings: setSosSettings,
  };
};
