import { useEffect, useSyncExternalStore } from 'react';
import { useGlobalState } from '@src/GlobalStateProvider';
import type { ReadUmbraSwitchRegistryOutput } from '@src/backendTasks/readUmbraSwitchRegistry';

import { clearSwitchesVariablesPending, getSwitchesVariablesPending, setSwitchesVariablesPending } from './switchesVariablesPendingSave';

/**
 * Fork-owned store for the Database "Switches & Variables" manager. Loads the
 * switch/variable name arrays from Data/System.rxdata once per project (plus the
 * read-only Umbra Ruby registry annotations), exposes edit/add mutators that
 * park the whole set for the bottom-left save button, and a subscribe/getSnapshot
 * pair for useSyncExternalStore. No auto-save to disk.
 */

type Kind = 'switches' | 'variables';
type Status = 'idle' | 'loading' | 'ready' | 'error';
type State = {
  projectPath: string | null;
  status: Status;
  switches: string[];
  variables: string[];
  registry: ReadUmbraSwitchRegistryOutput;
  error?: string;
};

const emptyRegistry: ReadUmbraSwitchRegistryOutput = { switches: {}, variables: {} };
let state: State = { projectPath: null, status: 'idle', switches: [], variables: [], registry: emptyRegistry };
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
const setState = (next: State) => {
  state = next;
  notify();
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const getSnapshot = () => state;

const readNames = (projectPath: string): Promise<{ switches: string[]; variables: string[] }> =>
  new Promise((resolve, reject) =>
    window.api.readRMXPSwitchNames({ projectPath }, resolve, ({ errorMessage }) => reject(new Error(errorMessage)))
  );

const readRegistry = (projectPath: string): Promise<ReadUmbraSwitchRegistryOutput> =>
  new Promise((resolve) =>
    // Annotations are best-effort — a failure just means none are shown.
    window.api.readUmbraSwitchRegistry({ projectPath }, resolve, () => resolve(emptyRegistry))
  );

const loadForProject = (projectPath: string | null) => {
  if (!projectPath) {
    if (state.projectPath !== null || state.status !== 'idle') {
      setState({ projectPath: null, status: 'idle', switches: [], variables: [], registry: emptyRegistry });
    }
    return;
  }
  if (state.projectPath === projectPath && state.status !== 'idle') return;

  const pending = getSwitchesVariablesPending();
  if (pending && pending.projectPath !== projectPath) clearSwitchesVariablesPending();
  if (pending && pending.projectPath === projectPath) {
    // Keep unsaved edits, but still (re)load registry annotations.
    setState({ projectPath, status: 'ready', switches: pending.switches, variables: pending.variables, registry: state.registry });
    readRegistry(projectPath).then((registry) => state.projectPath === projectPath && setState({ ...state, registry }));
    return;
  }

  setState({ projectPath, status: 'loading', switches: [], variables: [], registry: emptyRegistry });
  Promise.all([readNames(projectPath), readRegistry(projectPath)])
    .then(([names, registry]) => {
      if (state.projectPath !== projectPath) return;
      setState({ projectPath, status: 'ready', switches: names.switches, variables: names.variables, registry });
    })
    .catch((e: unknown) => {
      if (state.projectPath !== projectPath) return;
      setState({ projectPath, status: 'error', switches: [], variables: [], registry: emptyRegistry, error: e instanceof Error ? e.message : String(e) });
    });
};

const park = () => {
  if (state.projectPath) setSwitchesVariablesPending(state.projectPath, state.switches, state.variables);
};

/** Rename a switch/variable by id (index). */
export const setName = (kind: Kind, id: number, name: string) => {
  const arr = state[kind].slice();
  while (arr.length <= id) arr.push('');
  arr[id] = name;
  setState({ ...state, [kind]: arr });
  park();
};

/** Append a new (empty) switch/variable, returning its new id. */
export const addEntry = (kind: Kind): number => {
  const arr = state[kind].slice();
  if (arr.length === 0) arr.push(''); // seed the unused index-0 slot
  arr.push('');
  const id = arr.length - 1;
  setState({ ...state, [kind]: arr });
  park();
  return id;
};

export const useSwitchesVariables = () => {
  const [{ projectPath }] = useGlobalState();
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);
  useEffect(() => {
    loadForProject(projectPath ?? null);
  }, [projectPath]);
  return { ...snapshot, setName, addEntry };
};
