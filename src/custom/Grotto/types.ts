/**
 * Shared, renderer-safe types for the Hidden Grottos feature.
 *
 * This mirrors the on-disk shape of the PSDK plugin config at
 * `Data/configs/plugins/hidden_grotto.json` (klass
 * `Configs::Project::HiddenGrottoConfig`). It is imported with `import type`
 * from both the backend task and the renderer so there is a single source of
 * truth without pulling main-process code into the renderer bundle.
 */

/** A single weighted entry: `[weight, item_db_symbol]`. */
export type GrottoWeightedItem = [number, string];

/**
 * A PSDK `generate_from_hash` creature hash. Only `id` + `level` are required;
 * every other key is optional and omitted from the JSON when unset so PSDK
 * falls back to its own rolls.
 */
export type GrottoCreatureHash = {
  id: string;
  level: number;
  nature?: string;
  /**
   * IV array in Studio's stat order: [HP, Atk, Def, Speed, Sp. Atk, Sp. Def].
   * A number (0–31) fixes that IV; `null` leaves it to PSDK's random roll
   * (`opts.dig(:stats, i) || random`). Omit the whole array to randomize all.
   */
  stats?: (number | null)[];
  moves?: string[];
  /**
   * Ability dbSymbol. PSDK's `generate_from_hash` reads `:ability` (any ability
   * id/symbol) via `ability_initialize` — it does NOT read a slot index — so we
   * store the ability directly. The editor still surfaces the species' slot 1/2/
   * hidden at the top of the picker for convenience.
   */
  ability?: string;
  /**
   * The ability's slot (0 = first, 1 = second, 2 = hidden) when `ability` is one
   * of the species' slots. `generate_from_hash` doesn't read this, so the plugin
   * assigns `pokemon.ability_index` after generation — that's what keeps hidden
   * abilities flagged as hidden. Omitted for an arbitrary (non-slot) ability.
   */
  ability_index?: number;
  shiny?: boolean;
  form?: number;
  gender?: number;
};

/** A single weighted creature entry: `[weight, creatureHash]`. */
export type GrottoWeightedCreature = [number, GrottoCreatureHash];

/** The tile a map's grotto anchor event is moved to at map setup: `[x, y]`. */
export type GrottoPosition = [number, number];

/**
 * The full config object. The editable tables are typed explicitly; the index
 * signature lets any other future key round-trip untouched through
 * read → edit → write.
 */
export type HiddenGrottoConfig = {
  klass: string;
  visible_items: GrottoWeightedItem[];
  hidden_items: GrottoWeightedItem[];
  unique_items: Record<string, GrottoWeightedItem[]>;
  unique_pokemon: Record<string, GrottoWeightedCreature[]>;
  /**
   * Per-map grotto placement, keyed by map id (as a string). Read by the
   * Easy_Grottos plugin's Scheduler hook, which `moveto`s the anchor event to
   * this tile at map setup. Absent maps keep the anchor where the mapper laid it.
   */
  grotto_positions?: Record<string, GrottoPosition>;
  // Any other unknown key is preserved verbatim on write.
  [key: string]: unknown;
};

export const HIDDEN_GROTTO_KLASS = 'Configs::Project::HiddenGrottoConfig';

/** A sensible empty config, used when the file does not exist yet. */
export const buildEmptyHiddenGrottoConfig = (): HiddenGrottoConfig => ({
  klass: HIDDEN_GROTTO_KLASS,
  visible_items: [],
  hidden_items: [],
  unique_items: {},
  unique_pokemon: {},
});
