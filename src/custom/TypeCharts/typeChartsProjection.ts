import { StudioType, StudioDamageTo } from '@modelEntities/type';
import { DbSymbol } from '@modelEntities/dbSymbol';
import { NEUTRAL_FACTOR, type TypeChart, type TypeChartEffectiveness } from './types';

/**
 * Bridge between the fork's chart config and Studio's native type components.
 *
 * The whole "multiple type charts" surface reuses Studio's own Types table and
 * efficiency/resistance blocks by PROJECTING the selected alternative chart onto
 * `StudioType[]`: each type's `damageTo` is rebuilt from the chart's effectiveness
 * row, so every native reader (`getEfficiencies`, `getResistances`, the table's
 * `RatioCategoryIcon`) shows that chart's matchups with no change of its own.
 *
 * The DEFAULT chart (id 0 / no chart) projects to the base types unchanged, so
 * selecting "Default" is a true no-op and native behaviour is untouched.
 *
 * `damageToRow` is the inverse: it turns a (chart-projected) type's edited
 * `damageTo` back into the chart's stored effectiveness row.
 */

/** Project one type's `damageTo` from an alternative chart's effectiveness row. */
export const projectTypeOntoChart = (type: StudioType, chart: TypeChart | undefined): StudioType => {
  if (!chart) return type;
  const row = chart.effectiveness[type.dbSymbol] ?? {};
  const damageTo: StudioDamageTo[] = Object.entries(row).map(([defensiveType, factor]) => ({
    defensiveType: defensiveType as DbSymbol,
    factor,
  }));
  return { ...type, damageTo };
};

/** Project a whole `dbSymbol → StudioType` record onto a chart (identity for Default). */
export const projectTypesOntoChart = (
  types: Record<string, StudioType>,
  chart: TypeChart | undefined
): Record<string, StudioType> => {
  if (!chart) return types;
  const out: Record<string, StudioType> = {};
  Object.entries(types).forEach(([key, type]) => {
    out[key] = projectTypeOntoChart(type, chart);
  });
  return out;
};

/** Inverse of the projection: a (projected) type's `damageTo` → a chart effectiveness row. */
export const damageToRow = (damageTo: StudioDamageTo[]): TypeChartEffectiveness[string] => {
  const row: Record<string, number> = {};
  damageTo.forEach(({ defensiveType, factor }) => {
    if (defensiveType && factor !== NEUTRAL_FACTOR) row[defensiveType] = factor;
  });
  return row;
};
