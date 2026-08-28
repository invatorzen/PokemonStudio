/**
 * Shared, renderer-safe types + pure (de)serialization helpers for the
 * "multiple type charts" feature.
 *
 * Umbra can offer several full type-effectiveness charts, chosen in-game by a
 * game variable. Chart 0 is always the DEFAULT — the base Studio type data
 * (`StudioType.damageTo`) — and is never persisted here. Charts 1+ are FULL,
 * independent effectiveness tables the user edits and names in Studio.
 *
 * On disk the charts live in a fork-owned folder the Ruby runtime reads:
 *   `<projectPath>/Data/configs/type_charts/`
 *     - `chart_<id>.json` (id >= 1): `{ "<attack>": { "<defend>": factor, … }, … }`,
 *       storing ONLY non-neutral matchups (factor != 1). Anything absent = 1.0.
 *     - `names.csv`: one `id;name` row per alternative chart.
 *
 * These helpers are the single source of truth for that shape: the renderer
 * imports the types + mutators, and the backend task imports the pure
 * `sanitize*` / `parseNamesCsv` / `serializeNamesCsv` helpers (no Electron / DOM
 * code) so read + write agree on the format.
 */

/* -------------------------------------------------------------------------- */
/*  Config shape                                                              */
/* -------------------------------------------------------------------------- */

/** Attacking-type symbol → defending-type symbol → damage factor (non-neutral only). */
export type TypeChartEffectiveness = Record<string, Record<string, number>>;

/** One alternative chart (id >= 1). Chart 0 / "Default" is never represented here. */
export type TypeChart = {
  id: number;
  name: string;
  effectiveness: TypeChartEffectiveness;
};

/** The whole feature config: the ordered list of alternative charts. */
export type TypeChartsConfig = {
  charts: TypeChart[];
};

/** The standard factor ladder the matrix editor cycles a cell through. */
export const STANDARD_FACTORS = [0, 0.25, 0.5, 1, 2, 4] as const;

/** The default / neutral factor. Cells at this value are never stored. */
export const NEUTRAL_FACTOR = 1;

export const buildDefaultTypeChartsConfig = (): TypeChartsConfig => ({ charts: [] });

/* -------------------------------------------------------------------------- */
/*  Pure helpers (shared with the backend task)                              */
/* -------------------------------------------------------------------------- */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A factor is kept only when finite, non-negative and not exactly neutral (1). */
const isStorableFactor = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value !== NEUTRAL_FACTOR;

/** Coerce an arbitrary value into a nested effectiveness map, dropping neutral / invalid entries. */
export const sanitizeEffectiveness = (raw: unknown): TypeChartEffectiveness => {
  const out: TypeChartEffectiveness = {};
  if (!isRecord(raw)) return out;
  Object.entries(raw).forEach(([attack, row]) => {
    if (!attack || !isRecord(row)) return;
    const cleaned: Record<string, number> = {};
    Object.entries(row).forEach(([defend, factor]) => {
      if (defend && isStorableFactor(factor)) cleaned[defend] = factor;
    });
    if (Object.keys(cleaned).length > 0) out[attack] = cleaned;
  });
  return out;
};

/** Coerce a single chart, forcing a sane integer id (>= 1) and a string name. */
export const sanitizeTypeChart = (raw: unknown): TypeChart => {
  const obj = isRecord(raw) ? raw : {};
  const idNum = typeof obj.id === 'number' ? obj.id : parseInt(String(obj.id), 10);
  const id = Number.isFinite(idNum) ? Math.max(1, Math.trunc(idNum)) : 1;
  return {
    id,
    name: typeof obj.name === 'string' ? obj.name : '',
    effectiveness: sanitizeEffectiveness(obj.effectiveness),
  };
};

/** Full config sanitizer: dedupes ids (last wins) and sorts ascending. */
export const sanitizeTypeChartsConfig = (raw: unknown): TypeChartsConfig => {
  const obj = isRecord(raw) ? raw : {};
  const list = Array.isArray(obj.charts) ? obj.charts : [];
  const byId = new Map<number, TypeChart>();
  list.forEach((entry) => {
    const chart = sanitizeTypeChart(entry);
    byId.set(chart.id, chart);
  });
  const charts = Array.from(byId.values()).sort((a, b) => a.id - b.id);
  return { charts };
};

/* ------------------------------- names.csv -------------------------------- */

/**
 * Parse a `names.csv` body (`id;name` per line) into `{ id, name }` rows.
 * Splits on the FIRST semicolon so names that contain one survive; blank lines
 * and rows without a positive integer id are skipped.
 */
export const parseNamesCsv = (text: string): { id: number; name: string }[] => {
  const rows: { id: number; name: string }[] = [];
  text.split(/\r?\n/).forEach((line) => {
    if (!line.trim()) return;
    const sep = line.indexOf(';');
    if (sep === -1) return;
    const id = parseInt(line.slice(0, sep).trim(), 10);
    if (!Number.isFinite(id) || id < 1) return;
    rows.push({ id, name: line.slice(sep + 1).trim() });
  });
  return rows;
};

/**
 * Serialize charts back to a `names.csv` body. Names are stripped of newlines
 * and semicolons (replaced with spaces) so the `id;name` format stays parseable.
 */
export const serializeNamesCsv = (charts: TypeChart[]): string =>
  charts.map((chart) => `${chart.id};${chart.name.replace(/[\r\n;]+/g, ' ').trim()}`).join('\n');

/** The `chart_<id>.json` filename for a given chart id. */
export const chartFileName = (id: number): string => `chart_${id}.json`;

/** Extract a chart id from a `chart_<id>.json` filename, or null if it doesn't match. */
export const chartIdFromFileName = (fileName: string): number | null => {
  const match = fileName.match(/^chart_(\d+)\.json$/);
  if (!match) return null;
  const id = parseInt(match[1], 10);
  return Number.isFinite(id) && id >= 1 ? id : null;
};

/* -------------------------------------------------------------------------- */
/*  Editor helpers (renderer-only, but pure)                                 */
/* -------------------------------------------------------------------------- */

/** Minimal shape the default-chart builder needs from a project type. */
export type DamageToLike = { defensiveType: string; factor: number };
export type TypeLike = { dbSymbol: string; damageTo: DamageToLike[] };

/**
 * Build a full effectiveness map from the base project types — the seed for a
 * newly created alternative chart, so it starts as a complete copy of the
 * current DEFAULT effectiveness with no link back to it. Neutral (factor 1)
 * matchups are omitted, exactly as they're absent from `damageTo`.
 */
export const buildDefaultEffectiveness = (types: TypeLike[]): TypeChartEffectiveness => {
  const effectiveness: TypeChartEffectiveness = {};
  types.forEach((type) => {
    const row: Record<string, number> = {};
    type.damageTo.forEach(({ defensiveType, factor }) => {
      if (isStorableFactor(factor) && defensiveType) row[defensiveType] = factor;
    });
    if (Object.keys(row).length > 0) effectiveness[type.dbSymbol] = row;
  });
  return effectiveness;
};

/** The current factor for an attack×defend pair (defaults to neutral when absent). */
export const getFactor = (effectiveness: TypeChartEffectiveness, attack: string, defend: string): number =>
  effectiveness[attack]?.[defend] ?? NEUTRAL_FACTOR;

/**
 * Cycle a factor one step along the standard ladder. `direction` 1 advances,
 * -1 goes back; both wrap. An off-ladder current value snaps to neutral first.
 */
export const cycleFactor = (current: number, direction: 1 | -1): number => {
  const index = STANDARD_FACTORS.indexOf(current as (typeof STANDARD_FACTORS)[number]);
  const from = index === -1 ? STANDARD_FACTORS.indexOf(NEUTRAL_FACTOR) : index;
  const next = (from + direction + STANDARD_FACTORS.length) % STANDARD_FACTORS.length;
  return STANDARD_FACTORS[next];
};

/**
 * Return a new effectiveness map with the attack×defend cell set to `factor`.
 * A neutral factor REMOVES the entry (and prunes the row when it empties), so
 * the stored map stays sparse. The input map is never mutated.
 */
export const withFactor = (
  effectiveness: TypeChartEffectiveness,
  attack: string,
  defend: string,
  factor: number
): TypeChartEffectiveness => {
  const next: TypeChartEffectiveness = {};
  Object.entries(effectiveness).forEach(([a, row]) => {
    next[a] = { ...row };
  });
  if (factor === NEUTRAL_FACTOR || !isStorableFactor(factor)) {
    if (next[attack]) {
      delete next[attack][defend];
      if (Object.keys(next[attack]).length === 0) delete next[attack];
    }
    return next;
  }
  next[attack] = { ...(next[attack] ?? {}), [defend]: factor };
  return next;
};
