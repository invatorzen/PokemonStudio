import { useEffect, useSyncExternalStore } from 'react';
import { useGlobalState } from '@src/GlobalStateProvider';

import { clearMapSettingsPending, getMapSettingsPending, setMapSettingsPending } from './mapSettingsPendingSave';
import { buildDefaultMapSettingsConfig, buildDefaultMapSettingsEntry, isDefaultMapSettingsEntry, type MapSettingsConfig, type MapSettingsEntry } from './types';

/**
 * Fork-owned module store for the per-map Settings config. Loads the plugin JSON
 * once per project, exposes `getEntry` / `setEntry` keyed by `String(map.id)`,
 * and a subscribe/getSnapshot pair so the Map page and its editor dialog stay in
 * sync via `useSyncExternalStore`. Every mutation parks the whole config in
 * `mapSettingsPendingSave` for the bottom-left Save button — no auto-save.
 */

type Status = 'idle' | 'loading' | 'ready' | 'error';
type StoreState = { projectPath: string | null; status: Status; config: MapSettingsConfig; error?: string };

let state: StoreState = { projectPath: null, status: 'idle', config: buildDefaultMapSettingsConfig() };
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

export const loadMapSettingsConfigForProject = (projectPath: string | null) => {
  if (!projectPath) {
    if (state.projectPath !== null || state.status !== 'idle') {
      setState({ projectPath: null, status: 'idle', config: buildDefaultMapSettingsConfig() });
    }
    return;
  }
  if (state.projectPath === projectPath && state.status !== 'idle') return;

  const pending = getMapSettingsPending();
  if (pending && pending.projectPath !== projectPath) clearMapSettingsPending();
  if (pending && pending.projectPath === projectPath) {
    setState({ projectPath, status: 'ready', config: pending.config });
    return;
  }

  setState({ projectPath, status: 'loading', config: buildDefaultMapSettingsConfig() });
  window.api.readMapSettingsConfig(
    { projectPath },
    ({ config }) => {
      if (state.projectPath !== projectPath) return;
      setState({ projectPath, status: 'ready', config: config as MapSettingsConfig });
    },
    ({ errorMessage }) => {
      if (state.projectPath !== projectPath) return;
      setState({ projectPath, status: 'error', config: buildDefaultMapSettingsConfig(), error: errorMessage });
    }
  );
};

const parkAndSet = (config: MapSettingsConfig) => {
  if (!state.projectPath) return;
  setState({ ...state, config });
  setMapSettingsPending(state.projectPath, config);
};

/** Write a map's entry, keeping the map sparse: an entry with no graphic is dropped. */
export const setMapSettingsEntry = (mapId: number, entry: MapSettingsEntry) => {
  const key = String(mapId);
  const maps = { ...state.config.maps };
  if (isDefaultMapSettingsEntry(entry)) delete maps[key];
  else maps[key] = entry;
  parkAndSet({ ...state.config, maps });
};

export const useMapSettingsConfig = () => {
  const [{ projectPath }] = useGlobalState();
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);

  useEffect(() => {
    loadMapSettingsConfigForProject(projectPath ?? null);
  }, [projectPath]);

  return {
    status: snapshot.status,
    error: snapshot.error,
    config: snapshot.config,
    getEntry: (mapId: number): MapSettingsEntry => snapshot.config.maps[String(mapId)] ?? buildDefaultMapSettingsEntry(),
    setEntry: setMapSettingsEntry,
  };
};
