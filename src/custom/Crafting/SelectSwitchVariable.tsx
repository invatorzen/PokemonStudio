import React, { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { useGlobalState } from '@src/GlobalStateProvider';
import { StudioDropDown } from '@components/StudioDropDown';

import { NumberField } from './craftingUi';

/**
 * A named picker for a game switch or variable id.
 *
 * Reads the switch/variable NAMES from Data/System.rxdata once per project (via
 * the fork's `read-rmxp-switch-names` backend task, the same one the event editor
 * uses) and offers an `id — name` dropdown. If the names can't be read (no
 * project, a read error, or an empty list) it degrades gracefully to a plain
 * number input, so the field always works.
 */

type Names = { switches: string[]; variables: string[] };
type Status = 'idle' | 'loading' | 'ready' | 'error';
type StoreState = { projectPath: string | null; status: Status; names: Names };

let state: StoreState = { projectPath: null, status: 'idle', names: { switches: [], variables: [] } };
const listeners = new Set<() => void>();
const setState = (next: StoreState) => {
  state = next;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const getSnapshot = () => state;

const loadNames = (projectPath: string | null) => {
  if (!projectPath) {
    if (state.projectPath !== null || state.status !== 'idle') {
      setState({ projectPath: null, status: 'idle', names: { switches: [], variables: [] } });
    }
    return;
  }
  if (state.projectPath === projectPath && state.status !== 'idle') return;

  setState({ projectPath, status: 'loading', names: { switches: [], variables: [] } });
  window.api.readRMXPSwitchNames(
    { projectPath },
    ({ switches, variables }) => {
      if (state.projectPath !== projectPath) return;
      setState({ projectPath, status: 'ready', names: { switches, variables } });
    },
    () => {
      if (state.projectPath !== projectPath) return;
      // Best-effort: a read failure just means the number-input fallback is used.
      setState({ projectPath, status: 'error', names: { switches: [], variables: [] } });
    }
  );
};

const useSwitchVariableNames = () => {
  const [{ projectPath }] = useGlobalState();
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);
  useEffect(() => {
    loadNames(projectPath ?? null);
  }, [projectPath]);
  return snapshot;
};

type SelectSwitchVariableProps = {
  kind: 'switch' | 'variable';
  value: number;
  onChange: (id: number) => void;
};

export const SelectSwitchVariable = ({ kind, value, onChange }: SelectSwitchVariableProps) => {
  const { t } = useTranslation();
  const { status, names } = useSwitchVariableNames();
  const list = kind === 'switch' ? names.switches : names.variables;

  const options = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    // index 0 is unused in RMXP; start at 1.
    for (let id = 1; id < list.length; id += 1) {
      const name = list[id];
      opts.push({ value: String(id), label: name ? `${id} — ${name}` : `${id}` });
    }
    // Keep the current value selectable even if it's beyond the named range.
    if (value > 0 && !opts.some((o) => o.value === String(value))) {
      opts.push({ value: String(value), label: `${value}` });
      opts.sort((a, b) => Number(a.value) - Number(b.value));
    }
    return opts;
  }, [list, value]);

  // Fall back to a bare number input when names are unavailable.
  if (status !== 'ready' || options.length === 0) {
    return <NumberField value={value} min={1} integer narrow onChange={onChange} />;
  }

  const optionals = { deletedOption: `${value}`, noOptionLabel: t('crafting_no_match') };
  return <StudioDropDown value={String(value)} options={options} onChange={(v) => onChange(parseInt(v, 10) || 0)} optionals={optionals} />;
};
