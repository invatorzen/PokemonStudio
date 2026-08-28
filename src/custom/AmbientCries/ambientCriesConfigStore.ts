import { useEffect, useSyncExternalStore } from 'react';
import { useGlobalState } from '@src/GlobalStateProvider';

import { buildDefaultAmbientCriesConfig, isDefaultAmbientCriesZone, serializeZoneTiming, type AmbientCriesConfig, type AmbientCriesZone } from './types';
import { clearAmbientCriesPending, getAmbientCriesPending, setAmbientCriesPending } from './ambientCriesPendingSave';

/**
 * Fork-owned module store for the Ambient Cries config.
 *
 * The global dashboard page and the per-zone block are separate components on
 * separate routes, but they edit the SAME config file. This single store loads
 * the plugin JSON once per project (a backend read), exposes `setGlobal` /
 * `setZone` to mutate it, and a `subscribe` / `getSnapshot` pair so every surface
 * stays in sync through `useSyncExternalStore`. Every mutation also parks the
 * whole config in `ambientCriesPendingSave`, so the bottom-left "Save data"
 * button owns the actual write — no auto-save, no button of its own.
 */

type Status = 'idle' | 'loading' | 'ready' | 'error';
type StoreState = {
  projectPath: string | null;
  status: Status;
  config: AmbientCriesConfig;
  error?: string;
};

let state: StoreState = { projectPath: null, status: 'idle', config: buildDefaultAmbientCriesConfig() };
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
 * surfaces triggers a single read. Unsaved edits parked from a previous visit are
 * restored instead of re-reading disk, so navigating away and back never loses
 * work; pending for a different project is stale and dropped.
 */
export const loadAmbientCriesConfigForProject = (projectPath: string | null) => {
  if (!projectPath) {
    if (state.projectPath !== null || state.status !== 'idle') {
      setState({ projectPath: null, status: 'idle', config: buildDefaultAmbientCriesConfig() });
    }
    return;
  }
  if (state.projectPath === projectPath && state.status !== 'idle') return;

  const pending = getAmbientCriesPending();
  if (pending && pending.projectPath !== projectPath) clearAmbientCriesPending();
  if (pending && pending.projectPath === projectPath) {
    setState({ projectPath, status: 'ready', config: pending.config });
    return;
  }

  setState({ projectPath, status: 'loading', config: buildDefaultAmbientCriesConfig() });
  window.api.readAmbientCriesConfig(
    { projectPath },
    ({ config }) => {
      // Guard against a late response after the project changed.
      if (state.projectPath !== projectPath) return;
      setState({ projectPath, status: 'ready', config });
    },
    ({ errorMessage }) => {
      if (state.projectPath !== projectPath) return;
      setState({ projectPath, status: 'error', config: buildDefaultAmbientCriesConfig(), error: errorMessage });
    }
  );
};

const parkAndSet = (config: AmbientCriesConfig) => {
  if (!state.projectPath) return;
  setState({ ...state, config });
  setAmbientCriesPending(state.projectPath, config);
};

/** Merge a partial into the global (non-zone) fields, then park for save. */
export const setAmbientCriesGlobal = (partial: Partial<Omit<AmbientCriesConfig, 'zones'>>) => {
  parkAndSet({ ...state.config, ...partial });
};

/**
 * Write a zone's block into `zones`, keeping the map sparse: a zone that is back
 * to its defaults (enabled, inherited timing, no species override) drops its key
 * so an unconfigured zone leaves no trace. The caller hands the fully-built zone;
 * the sparse species collapsing is done by the caller via `sparseSpeciesEntry`.
 *
 * Timing is collapsed here too: an `'inherit'` (or absent) timing drops the
 * `timing` key entirely, so the parked config never carries a memory-only inherit
 * timing that would read as an override on disk (defense in depth with the
 * backend save).
 */
export const setAmbientCriesZone = (zoneDbSymbol: string, zone: AmbientCriesZone | null) => {
  const zones = { ...state.config.zones };
  const collapsed = zone && {
    enabled: zone.enabled,
    ground: zone.ground,
    water: zone.water,
    ...(serializeZoneTiming(zone.timing) ? { timing: serializeZoneTiming(zone.timing) } : {}),
  };
  if (!collapsed || isDefaultAmbientCriesZone(collapsed)) {
    delete zones[zoneDbSymbol];
  } else {
    zones[zoneDbSymbol] = collapsed;
  }
  parkAndSet({ ...state.config, zones });
};

/**
 * Hook wrapping the store. The first surface to mount for a project triggers the
 * lazy load; every surface re-renders on any change.
 */
export const useAmbientCriesConfig = () => {
  const [{ projectPath }] = useGlobalState();
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);

  useEffect(() => {
    loadAmbientCriesConfigForProject(projectPath ?? null);
  }, [projectPath]);

  return {
    status: snapshot.status,
    error: snapshot.error,
    config: snapshot.config,
    getZone: (zoneDbSymbol: string): AmbientCriesZone | undefined => snapshot.config.zones[zoneDbSymbol],
    setZone: setAmbientCriesZone,
    setGlobal: setAmbientCriesGlobal,
  };
};
