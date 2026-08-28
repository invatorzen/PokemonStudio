import log from 'electron-log';
import fs from 'fs';
import path from 'path';
import type { TypeChart, TypeChartsConfig } from '@src/custom/TypeCharts/types';
import {
  buildDefaultTypeChartsConfig,
  chartFileName,
  chartIdFromFileName,
  parseNamesCsv,
  sanitizeEffectiveness,
  sanitizeTypeChartsConfig,
  serializeNamesCsv,
} from '@src/custom/TypeCharts/types';
import { defineBackendServiceFunction } from './defineBackendServiceFunction';

/**
 * Read + write the "multiple type charts" data at
 * `<projectPath>/Data/configs/type_charts/`, edited from Studio's Types section.
 *
 * The folder is fork-owned and read verbatim by Umbra's Ruby runtime, so Studio
 * never regenerates it — it only round-trips what the user edits:
 *  - `names.csv` (`id;name` per row) names the alternative charts (id >= 1);
 *  - `chart_<id>.json` holds one FULL effectiveness table each, storing only
 *    non-neutral matchups (factor != 1) — anything absent means neutral 1.0.
 *
 * On read a missing folder yields an empty config (chart 0 / "Default" always
 * exists implicitly as the base Studio type data). On save we write one
 * `chart_<id>.json` per chart plus `names.csv`, and delete the JSON files of any
 * charts the user removed. The shape helpers are the same pure functions the
 * renderer uses, imported from the renderer-safe `types.ts`.
 */

const RELATIVE_FOLDER = path.join('Data', 'configs', 'type_charts');
const NAMES_FILE = 'names.csv';

export type ReadTypeChartsConfigInput = { projectPath: string };
export type ReadTypeChartsConfigOutput = { config: TypeChartsConfig };

const readTypeChartsConfig = async (payload: ReadTypeChartsConfigInput): Promise<ReadTypeChartsConfigOutput> => {
  log.info('read-type-charts-config');
  const folder = path.join(payload.projectPath, RELATIVE_FOLDER);

  if (!fs.existsSync(folder)) {
    log.info('read-type-charts-config/missing-default');
    return { config: buildDefaultTypeChartsConfig() };
  }

  // Names come from names.csv; a missing file just means no names yet.
  const names = new Map<number, string>();
  const namesPath = path.join(folder, NAMES_FILE);
  if (fs.existsSync(namesPath)) {
    const csv = fs.readFileSync(namesPath, { encoding: 'utf-8' });
    parseNamesCsv(csv).forEach(({ id, name }) => names.set(id, name));
  }

  // Every chart_<id>.json in the folder is an alternative chart.
  const effById = new Map<number, ReturnType<typeof sanitizeEffectiveness>>();
  fs.readdirSync(folder).forEach((entry) => {
    const id = chartIdFromFileName(entry);
    if (id === null) return;
    const raw = fs.readFileSync(path.join(folder, entry), { encoding: 'utf-8' });
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      // Throw a string — IPC cannot serialize Error instances.
      throw `${entry} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`;
    }
    effById.set(id, sanitizeEffectiveness(parsed));
  });

  // Union the ids seen in either source so a named-but-empty chart still shows.
  const ids = new Set<number>([...names.keys(), ...effById.keys()]);
  const charts: TypeChart[] = Array.from(ids)
    .sort((a, b) => a - b)
    .map((id) => ({ id, name: names.get(id) ?? '', effectiveness: effById.get(id) ?? {} }));

  log.info('read-type-charts-config/success');
  return { config: sanitizeTypeChartsConfig({ charts }) };
};

export type SaveTypeChartsConfigInput = { projectPath: string; config: TypeChartsConfig };
export type SaveTypeChartsConfigOutput = Record<string, never>;

const saveTypeChartsConfig = async (payload: SaveTypeChartsConfigInput): Promise<SaveTypeChartsConfigOutput> => {
  log.info('save-type-charts-config');
  const folder = path.join(payload.projectPath, RELATIVE_FOLDER);
  fs.mkdirSync(folder, { recursive: true });

  // Re-sanitize so only known keys / storable factors reach disk.
  const { charts } = sanitizeTypeChartsConfig(payload.config);
  const keepIds = new Set(charts.map((chart) => chart.id));

  // Delete chart_<id>.json files for charts that were removed.
  fs.readdirSync(folder).forEach((entry) => {
    const id = chartIdFromFileName(entry);
    if (id !== null && !keepIds.has(id)) fs.rmSync(path.join(folder, entry));
  });

  // Write one pretty-printed chart_<id>.json per chart (non-neutral entries only).
  charts.forEach((chart) => {
    fs.writeFileSync(path.join(folder, chartFileName(chart.id)), JSON.stringify(chart.effectiveness, null, 2));
  });

  // Write names.csv (id;name), always — an empty file when there are no charts.
  fs.writeFileSync(path.join(folder, NAMES_FILE), serializeNamesCsv(charts));

  log.info('save-type-charts-config/success');
  return {};
};

export const registerReadTypeChartsConfig = defineBackendServiceFunction('read-type-charts-config', readTypeChartsConfig);
export const registerSaveTypeChartsConfig = defineBackendServiceFunction('save-type-charts-config', saveTypeChartsConfig);
