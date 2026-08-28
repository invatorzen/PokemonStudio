import { useEffect, useSyncExternalStore } from 'react';
import { useGlobalState } from '@src/GlobalStateProvider';

import { clearTypeChartsPending, getTypeChartsPending, setTypeChartsPending } from './typeChartsPendingSave';
import {
  buildDefaultTypeChartsConfig,
  withFactor,
  type TypeChart,
  type TypeChartEffectiveness,
  type TypeChartsConfig,
} from './types';

/**
 * Fork-owned module store for the multiple-type-charts config.
 *
 * The Types "table" surface reads and edits the alternative charts through this
 * one store: it loads the folder once per project (a backend read), exposes
 * typed mutators, and a `subscribe` / `getSnapshot` pair so every surface stays
 * in sync through `useSyncExternalStore`. Every mutation parks the whole config
 * in `typeChartsPendingSave`, so the bottom-left "Save data" button owns the
 * actual write — no auto-save and no button of its own.
 *
 * Chart 0 / "Default" is NOT held here: it's the base Studio type data and is
 * edited through the normal per-type editors. Only alternative charts (id >= 1)
 * live in this config.
 */

type Status = 'idle' | 'loading' | 'ready' | 'error';
type StoreState = {
  projectPath: string | null;
  status: Status;
  config: TypeChartsConfig;
  error?: string;
};

let state: StoreState = { projectPath: null, status: 'idle', config: buildDefaultTypeChartsConfig() };
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
 * calls while loaded/loading for the same project are no-ops. Unsaved edits
 * parked from a previous visit are restored instead of re-reading disk; pending
 * for a different project is dropped.
 */
export const loadTypeChartsConfigForProject = (projectPath: string | null) => {
  if (!projectPath) {
    if (state.projectPath !== null || state.status !== 'idle') {
      setState({ projectPath: null, status: 'idle', config: buildDefaultTypeChartsConfig() });
    }
    return;
  }
  if (state.projectPath === projectPath && state.status !== 'idle') return;

  const pending = getTypeChartsPending();
  if (pending && pending.projectPath !== projectPath) clearTypeChartsPending();
  if (pending && pending.projectPath === projectPath) {
    setState({ projectPath, status: 'ready', config: pending.config });
    return;
  }

  setState({ projectPath, status: 'loading', config: buildDefaultTypeChartsConfig() });
  window.api.readTypeChartsConfig(
    { projectPath },
    ({ config }) => {
      // Guard against a late response after the project changed.
      if (state.projectPath !== projectPath) return;
      setState({ projectPath, status: 'ready', config: config as TypeChartsConfig });
    },
    ({ errorMessage }) => {
      if (state.projectPath !== projectPath) return;
      setState({ projectPath, status: 'error', config: buildDefaultTypeChartsConfig(), error: errorMessage });
    }
  );
};

const parkAndSet = (charts: TypeChart[]) => {
  if (!state.projectPath) return;
  const config: TypeChartsConfig = { charts };
  setState({ ...state, config });
  setTypeChartsPending(state.projectPath, config);
};

/**
 * Add a fresh alternative chart seeded with the given (default) effectiveness,
 * returning its id so the caller can select it. Ids are assigned as
 * `max(existing) + 1` so removing then adding never resurrects an old chart's id.
 */
export const addTypeChart = (name: string, effectiveness: TypeChartEffectiveness): number => {
  const id = state.config.charts.reduce((max, chart) => Math.max(max, chart.id), 0) + 1;
  parkAndSet([...state.config.charts, { id, name, effectiveness }]);
  return id;
};

export const renameTypeChart = (id: number, name: string) =>
  parkAndSet(state.config.charts.map((chart) => (chart.id === id ? { ...chart, name } : chart)));

export const deleteTypeChart = (id: number) => parkAndSet(state.config.charts.filter((chart) => chart.id !== id));

/** Set a single attack×defend cell of a chart; a neutral factor removes the entry. */
export const setTypeChartCell = (id: number, attack: string, defend: string, factor: number) =>
  parkAndSet(
    state.config.charts.map((chart) =>
      chart.id === id ? { ...chart, effectiveness: withFactor(chart.effectiveness, attack, defend, factor) } : chart
    )
  );

/**
 * Replace one attacking type's whole effectiveness row (all its defenders). Used
 * when the native Types table edits a chart: the table hands back the attacking
 * type's full `damageTo`, which the projection layer turns into `row`. An empty
 * row drops the attacker from the sparse map entirely.
 */
export const setTypeChartAttackRow = (id: number, attack: string, row: Record<string, number>) =>
  parkAndSet(
    state.config.charts.map((chart) => {
      if (chart.id !== id) return chart;
      const effectiveness = { ...chart.effectiveness };
      if (Object.keys(row).length > 0) effectiveness[attack] = { ...row };
      else delete effectiveness[attack];
      return { ...chart, effectiveness };
    })
  );

/**
 * Hook wrapping the store. Mounting the Types table surface triggers the lazy
 * load; every surface re-renders on any change.
 */
export const useTypeChartsConfig = () => {
  const [{ projectPath }] = useGlobalState();
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);

  useEffect(() => {
    loadTypeChartsConfigForProject(projectPath ?? null);
  }, [projectPath]);

  return {
    projectPath,
    status: snapshot.status,
    error: snapshot.error,
    charts: snapshot.config.charts,
    addTypeChart,
    renameTypeChart,
    deleteTypeChart,
    setTypeChartCell,
    setTypeChartAttackRow,
  };
};
