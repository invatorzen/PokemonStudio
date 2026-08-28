import { useSyncExternalStore } from 'react';

/**
 * Which type chart is currently selected on the Types page: 0 = Default (the base
 * Studio type data), >0 = an alternative chart's id. This is ephemeral UI state
 * (NOT persisted), shared between the TypeControlBar (the Chart dropdown + New
 * chart button live there) and the Type page (which renders the chart's matrix),
 * so it lives in a tiny module store rather than either component.
 */

let selectedId = 0;
const listeners = new Set<() => void>();

export const getSelectedChartId = (): number => selectedId;

export const setSelectedChartId = (id: number) => {
  if (selectedId === id) return;
  selectedId = id;
  listeners.forEach((listener) => listener());
};

export const subscribeSelectedChartId = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useSelectedChartId = (): number => useSyncExternalStore(subscribeSelectedChartId, getSelectedChartId);
