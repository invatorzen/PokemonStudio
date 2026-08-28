import { useEffect, useSyncExternalStore } from 'react';
import { useGlobalState } from '@src/GlobalStateProvider';

import {
  buildDefaultCriticalHealthAudioConfig,
  type CriticalHealthAudioConfig,
  type CriticalHealthBgmReplacementMode,
  type CriticalHealthSoundEffectMode,
} from './types';
import {
  clearCriticalHealthAudioPending,
  getCriticalHealthAudioPending,
  setCriticalHealthAudioPending,
} from './criticalHealthAudioPendingSave';

/**
 * Fork-owned module store for the Critical Health Audio config.
 *
 * A single global config in a plugin JSON. This store loads the file once per
 * project (a backend read), exposes setters to mutate it, and a
 * `subscribe`/`getSnapshot` pair so the dashboard page stays in sync through
 * `useSyncExternalStore`. Every mutation also parks the whole config in
 * `criticalHealthAudioPendingSave`, so the bottom-left "Save data" button owns
 * the actual write — no auto-save, no button of its own.
 */

type Status = 'idle' | 'loading' | 'ready' | 'error';
type StoreState = {
  projectPath: string | null;
  status: Status;
  config: CriticalHealthAudioConfig;
  error?: string;
};

let state: StoreState = { projectPath: null, status: 'idle', config: buildDefaultCriticalHealthAudioConfig() };
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
 * parked from a previous visit are restored instead of re-reading disk, so
 * navigating away and back never loses work; pending for a different project is
 * stale and dropped.
 */
export const loadCriticalHealthAudioConfigForProject = (projectPath: string | null) => {
  if (!projectPath) {
    if (state.projectPath !== null || state.status !== 'idle') {
      setState({ projectPath: null, status: 'idle', config: buildDefaultCriticalHealthAudioConfig() });
    }
    return;
  }
  if (state.projectPath === projectPath && state.status !== 'idle') return;

  const pending = getCriticalHealthAudioPending();
  if (pending && pending.projectPath !== projectPath) clearCriticalHealthAudioPending();
  if (pending && pending.projectPath === projectPath) {
    setState({ projectPath, status: 'ready', config: pending.config });
    return;
  }

  setState({ projectPath, status: 'loading', config: buildDefaultCriticalHealthAudioConfig() });
  window.api.readCriticalHealthAudioConfig(
    { projectPath },
    ({ config }) => {
      // Guard against a late response after the project changed.
      if (state.projectPath !== projectPath) return;
      setState({ projectPath, status: 'ready', config });
    },
    ({ errorMessage }) => {
      if (state.projectPath !== projectPath) return;
      setState({ projectPath, status: 'error', config: buildDefaultCriticalHealthAudioConfig(), error: errorMessage });
    }
  );
};

const parkAndSet = (config: CriticalHealthAudioConfig) => {
  if (!state.projectPath) return;
  setState({ ...state, config });
  setCriticalHealthAudioPending(state.projectPath, config);
};

/** Set which behavior the game uses. Both sub-objects stay on disk regardless. */
export const setCriticalHealthAudioMode = (mode: CriticalHealthAudioConfig['mode']) => {
  parkAndSet({ ...state.config, mode });
};

/** Merge a partial into the sound-effect sub-object, then park for save. */
export const setCriticalHealthSoundEffect = (partial: Partial<CriticalHealthSoundEffectMode>) => {
  parkAndSet({ ...state.config, sound_effect_mode: { ...state.config.sound_effect_mode, ...partial } });
};

/** Merge a partial into the BGM-replacement sub-object, then park for save. */
export const setCriticalHealthBgmReplacement = (partial: Partial<CriticalHealthBgmReplacementMode>) => {
  parkAndSet({ ...state.config, bgm_replacement_mode: { ...state.config.bgm_replacement_mode, ...partial } });
};

/**
 * Hook wrapping the store. Mounting the dashboard page triggers the lazy load;
 * the page re-renders on any change.
 */
export const useCriticalHealthAudioConfig = () => {
  const [{ projectPath }] = useGlobalState();
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);

  useEffect(() => {
    loadCriticalHealthAudioConfigForProject(projectPath ?? null);
  }, [projectPath]);

  return {
    status: snapshot.status,
    error: snapshot.error,
    config: snapshot.config,
    setMode: setCriticalHealthAudioMode,
    setSoundEffect: setCriticalHealthSoundEffect,
    setBgmReplacement: setCriticalHealthBgmReplacement,
  };
};
