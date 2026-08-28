/**
 * Shared, renderer-safe types + pure (de)serialization helpers for the Crafting
 * feature.
 *
 * Mirrors the on-disk shape of the Crafting plugin config at
 * `Data/configs/crafting_config.json`. Imported with `import type` from the
 * renderer, and the config-level `sanitize*` helpers are also imported at
 * runtime by the backend task (they are pure and pull in no Electron / DOM
 * code), so there is a single source of truth for the file's shape.
 *
 * Studio only reads/writes this file; the plugin owns the runtime.
 *
 * There are two representations here:
 *  - the CONFIG shape (`CraftingConfig`, `CraftCondition`, …) — exactly what is
 *    written to disk;
 *  - the DRAFT shape (`CraftingDraft`, `DraftConditionNode`, …) — the editor's
 *    in-memory working copy. Drafts carry stable `id`/`_id` React keys and keep
 *    ordered lists (so an in-progress, not-yet-keyed row or ingredient can exist)
 *    that the object/array config form can't hold. `configFromDraft` /
 *    `draftFromConfig` bridge the two.
 */

/* -------------------------------------------------------------------------- */
/*  Config shape (on disk)                                                     */
/* -------------------------------------------------------------------------- */

/** Boolean-group operators. The plugin also accepts all/any/none; we emit these. */
export type CraftOperator = 'and' | 'or' | 'not';

/** A `pokemon` leaf: party must hold a matching creature. Optional keys are omitted when unset. */
export type CraftPokemonLeaf = {
  type: 'pokemon';
  db_symbol: string;
  min_loyalty?: number;
  min_level?: number;
  move?: string;
  ability?: string;
  holding_item?: string;
  gender?: number;
  form?: number;
  shiny?: boolean;
};

/** A single unlock-condition leaf (a concrete test, not a group). */
export type CraftLeaf =
  | { type: 'manual'; value: boolean }
  | { type: 'switch'; id: number }
  | { type: 'variable'; id: number; value: number }
  | { type: 'quest'; id: number }
  | { type: 'recipe'; key: string }
  | { type: 'item'; item: string; quantity: number }
  | CraftPokemonLeaf;

export type CraftLeafType = CraftLeaf['type'];

/** A boolean group of nested conditions (leaves or further groups). */
export type CraftGroup = { operator: CraftOperator; conditions: CraftCondition[] };

/** A condition is either a leaf or a group — recursively. */
export type CraftCondition = CraftLeaf | CraftGroup;

/** One recipe as written to disk. */
export type CraftingRecipe = {
  ingredients: Record<string, number>;
  result: string;
  quantity: number;
  category: string;
  /** Optional cap on how many times the recipe can be crafted. Omitted when unset. */
  max_craft?: number;
  unlock_condition: CraftCondition;
};

/**
 * The whole config as written to disk. `categories` is an ARRAY of single-key
 * objects (`{ "<key>": <iconIndex> }`) — order matters. `data` is a map keyed by
 * a recipe symbol.
 */
export type CraftingConfig = {
  categories: Record<string, number>[];
  data: Record<string, CraftingRecipe>;
};

/** The plugin's documented default for a project that has never configured crafting. */
export const buildDefaultCraftingConfig = (): CraftingConfig => ({
  categories: [{ all: 3 }],
  data: {},
});

/* -------------------------------------------------------------------------- */
/*  Config-level sanitizers (pure — shared with the backend task)             */
/* -------------------------------------------------------------------------- */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toInt = (value: unknown, fallback: number): number => {
  const n = typeof value === 'number' ? value : parseInt(String(value), 10);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
};

const toStr = (value: unknown): string => (typeof value === 'string' ? value : '');

/** all/any/none are accepted aliases; everything unknown falls back to `and`. */
const normalizeOperator = (value: unknown): CraftOperator => {
  switch (value) {
    case 'or':
    case 'any':
      return 'or';
    case 'not':
    case 'none':
      return 'not';
    case 'and':
    case 'all':
    default:
      return 'and';
  }
};

/** Coerce an arbitrary value into a valid leaf, defaulting to `manual: true` on anything unknown. */
export const sanitizeLeaf = (raw: unknown): CraftLeaf => {
  const obj = isRecord(raw) ? raw : {};
  switch (obj.type) {
    case 'manual':
      return { type: 'manual', value: obj.value !== false };
    case 'switch':
      return { type: 'switch', id: toInt(obj.id, 1) };
    case 'variable':
      return { type: 'variable', id: toInt(obj.id, 1), value: toInt(obj.value, 0) };
    case 'quest':
      return { type: 'quest', id: toInt(obj.id, 1) };
    case 'recipe':
      return { type: 'recipe', key: toStr(obj.key) };
    case 'item':
      return { type: 'item', item: toStr(obj.item), quantity: toInt(obj.quantity, 1) };
    case 'pokemon': {
      const leaf: CraftPokemonLeaf = { type: 'pokemon', db_symbol: toStr(obj.db_symbol) };
      if (obj.min_loyalty !== undefined && obj.min_loyalty !== null) leaf.min_loyalty = toInt(obj.min_loyalty, 0);
      if (obj.min_level !== undefined && obj.min_level !== null) leaf.min_level = toInt(obj.min_level, 1);
      if (typeof obj.move === 'string' && obj.move) leaf.move = obj.move;
      if (typeof obj.ability === 'string' && obj.ability) leaf.ability = obj.ability;
      if (typeof obj.holding_item === 'string' && obj.holding_item) leaf.holding_item = obj.holding_item;
      if (obj.gender !== undefined && obj.gender !== null) leaf.gender = toInt(obj.gender, 0);
      if (obj.form !== undefined && obj.form !== null) leaf.form = toInt(obj.form, 0);
      if (typeof obj.shiny === 'boolean') leaf.shiny = obj.shiny;
      return leaf;
    }
    default:
      return { type: 'manual', value: true };
  }
};

/** Re-emit a leaf with only the known keys (drops empty optional pokemon sub-fields). */
export const serializeLeaf = (leaf: CraftLeaf): CraftLeaf => {
  switch (leaf.type) {
    case 'manual':
      return { type: 'manual', value: !!leaf.value };
    case 'switch':
      return { type: 'switch', id: toInt(leaf.id, 1) };
    case 'variable':
      return { type: 'variable', id: toInt(leaf.id, 1), value: toInt(leaf.value, 0) };
    case 'quest':
      return { type: 'quest', id: toInt(leaf.id, 1) };
    case 'recipe':
      return { type: 'recipe', key: toStr(leaf.key) };
    case 'item':
      return { type: 'item', item: toStr(leaf.item), quantity: toInt(leaf.quantity, 1) };
    case 'pokemon': {
      const out: CraftPokemonLeaf = { type: 'pokemon', db_symbol: toStr(leaf.db_symbol) };
      if (typeof leaf.min_loyalty === 'number') out.min_loyalty = toInt(leaf.min_loyalty, 0);
      if (typeof leaf.min_level === 'number') out.min_level = toInt(leaf.min_level, 1);
      if (leaf.move) out.move = leaf.move;
      if (leaf.ability) out.ability = leaf.ability;
      if (leaf.holding_item) out.holding_item = leaf.holding_item;
      if (typeof leaf.gender === 'number') out.gender = toInt(leaf.gender, 0);
      if (typeof leaf.form === 'number') out.form = toInt(leaf.form, 0);
      if (typeof leaf.shiny === 'boolean') out.shiny = leaf.shiny;
      return out;
    }
    default:
      return { type: 'manual', value: true };
  }
};

/** Recursively coerce an arbitrary value into a valid condition tree. */
export const sanitizeCondition = (raw: unknown): CraftCondition => {
  if (isRecord(raw) && (Object.prototype.hasOwnProperty.call(raw, 'operator') || Object.prototype.hasOwnProperty.call(raw, 'conditions'))) {
    const conditions = Array.isArray(raw.conditions) ? raw.conditions.map(sanitizeCondition) : [];
    return { operator: normalizeOperator(raw.operator), conditions };
  }
  return sanitizeLeaf(raw);
};

/** Discriminate a condition: a group has `conditions`, a leaf has `type`. */
export const isCraftGroup = (condition: CraftCondition): condition is CraftGroup =>
  Object.prototype.hasOwnProperty.call(condition, 'conditions');

const sanitizeRecipe = (raw: unknown): CraftingRecipe => {
  const obj = isRecord(raw) ? raw : {};
  const ingredients: Record<string, number> = {};
  if (isRecord(obj.ingredients)) {
    Object.entries(obj.ingredients).forEach(([item, qty]) => {
      if (item) ingredients[item] = toInt(qty, 1);
    });
  }
  const recipe: CraftingRecipe = {
    ingredients,
    result: toStr(obj.result),
    quantity: toInt(obj.quantity, 1),
    category: toStr(obj.category),
    unlock_condition: obj.unlock_condition === undefined ? { type: 'manual', value: true } : sanitizeCondition(obj.unlock_condition),
  };
  if (obj.max_craft !== undefined && obj.max_craft !== null) recipe.max_craft = toInt(obj.max_craft, 0);
  return recipe;
};

/** Coerce the categories array into ordered single-key `{ key: icon }` objects, dropping empties. */
export const sanitizeCategories = (raw: unknown): Record<string, number>[] => {
  if (!Array.isArray(raw)) return [{ all: 3 }];
  const out: Record<string, number>[] = [];
  raw.forEach((entry) => {
    if (!isRecord(entry)) return;
    const key = Object.keys(entry)[0];
    if (!key) return;
    out.push({ [key]: toInt(entry[key], 0) });
  });
  return out;
};

/** Full config sanitizer used by the backend read + save (defense at the disk boundary). */
export const sanitizeCraftingConfig = (raw: unknown): CraftingConfig => {
  const obj = isRecord(raw) ? raw : {};
  const data: Record<string, CraftingRecipe> = {};
  if (isRecord(obj.data)) {
    Object.entries(obj.data).forEach(([key, value]) => {
      if (key) data[key] = sanitizeRecipe(value);
    });
  }
  return { categories: sanitizeCategories(obj.categories), data };
};

/* -------------------------------------------------------------------------- */
/*  Draft shape (in the editor)                                               */
/* -------------------------------------------------------------------------- */

/** A leaf node in the editor's condition tree. `leaf` holds the concrete test. */
export type DraftLeafNode = { _id: string; node: 'leaf'; leaf: CraftLeaf };

/** A group node in the editor's condition tree, with ordered children. */
export type DraftGroupNode = { _id: string; node: 'group'; operator: CraftOperator; conditions: DraftConditionNode[] };

export type DraftConditionNode = DraftLeafNode | DraftGroupNode;

/** A recipe's ingredient row in the editor (stable id survives item changes). */
export type IngredientRow = { id: string; item: string; qty: number };

/** One recipe in the editor's ordered working list. */
export type RecipeDraft = {
  id: string;
  /** The recipe symbol — the `data` map key. Empty while unset. */
  key: string;
  result: string;
  quantity: number;
  category: string;
  /** `null` means no cap → `max_craft` is omitted on save. */
  maxCraft: number | null;
  ingredients: IngredientRow[];
  /** The unlock-condition tree root — always present (defaults to `manual: true`). */
  condition: DraftConditionNode;
};

/** One category row in the editor's ordered working list. */
export type CategoryDraft = { id: string; key: string; icon: number };

/** The editor's whole in-memory draft, shared by the Categories and Recipes tabs. */
export type CraftingDraft = {
  categories: CategoryDraft[];
  recipes: RecipeDraft[];
};

let idCounter = 0;
/** Fresh stable id for a draft row / node. */
export const nextCraftingId = (prefix = 'craft'): string => `${prefix}-${++idCounter}`;

/** A fresh default leaf for a given leaf type (used when switching a node's type). */
export const defaultLeaf = (type: CraftLeafType): CraftLeaf => {
  switch (type) {
    case 'manual':
      return { type: 'manual', value: true };
    case 'switch':
      return { type: 'switch', id: 1 };
    case 'variable':
      return { type: 'variable', id: 1, value: 0 };
    case 'quest':
      return { type: 'quest', id: 1 };
    case 'recipe':
      return { type: 'recipe', key: '' };
    case 'item':
      return { type: 'item', item: '', quantity: 1 };
    case 'pokemon':
      return { type: 'pokemon', db_symbol: '' };
  }
};

export const buildLeafNode = (leaf: CraftLeaf): DraftLeafNode => ({ _id: nextCraftingId('cond'), node: 'leaf', leaf });
export const buildGroupNode = (operator: CraftOperator, conditions: DraftConditionNode[]): DraftGroupNode => ({
  _id: nextCraftingId('cond'),
  node: 'group',
  operator,
  conditions,
});

/** Config condition → draft node (recursive), assigning stable ids. */
export const conditionToNode = (condition: CraftCondition): DraftConditionNode => {
  if (isCraftGroup(condition)) return buildGroupNode(condition.operator, condition.conditions.map(conditionToNode));
  return buildLeafNode(condition);
};

/** Draft node → config condition (recursive), stripping ids and cleaning leaves. */
export const nodeToCondition = (node: DraftConditionNode): CraftCondition => {
  if (node.node === 'group') return { operator: node.operator, conditions: node.conditions.map(nodeToCondition) };
  return serializeLeaf(node.leaf);
};

export const buildEmptyCraftingDraft = (): CraftingDraft => ({ categories: [{ id: nextCraftingId('cat'), key: 'all', icon: 3 }], recipes: [] });

/** Build the editor draft from a persisted config (preserving order). */
export const draftFromConfig = (config: CraftingConfig): CraftingDraft => ({
  categories: config.categories.map((entry) => {
    const key = Object.keys(entry)[0] ?? '';
    return { id: nextCraftingId('cat'), key, icon: key ? entry[key] : 0 };
  }),
  recipes: Object.entries(config.data).map(([key, recipe]) => ({
    id: nextCraftingId('recipe'),
    key,
    result: recipe.result,
    quantity: recipe.quantity,
    category: recipe.category,
    maxCraft: typeof recipe.max_craft === 'number' ? recipe.max_craft : null,
    ingredients: Object.entries(recipe.ingredients).map(([item, qty]) => ({ id: nextCraftingId('ing'), item, qty })),
    condition: conditionToNode(recipe.unlock_condition),
  })),
});

/**
 * Collapse the editor draft back into the persisted config shape.
 *  - category / recipe rows with an empty key are dropped;
 *  - ingredient rows with an empty item are dropped;
 *  - on a duplicate recipe/ingredient/category key, the last one wins;
 *  - `max_craft` is emitted only when a cap is set;
 *  - `unlock_condition` is serialized faithfully (only known keys, empty optional
 *    pokemon sub-fields dropped).
 */
export const configFromDraft = (draft: CraftingDraft): CraftingConfig => {
  const categories: Record<string, number>[] = [];
  draft.categories.forEach((row) => {
    const key = row.key.trim();
    if (!key) return;
    categories.push({ [key]: Math.trunc(row.icon) || 0 });
  });

  const data: Record<string, CraftingRecipe> = {};
  draft.recipes.forEach((row) => {
    const key = row.key.trim();
    if (!key) return;
    const ingredients: Record<string, number> = {};
    row.ingredients.forEach((ing) => {
      const item = ing.item.trim();
      if (!item) return;
      ingredients[item] = Math.trunc(ing.qty) || 0;
    });
    const recipe: CraftingRecipe = {
      ingredients,
      result: row.result,
      quantity: Math.trunc(row.quantity) || 0,
      category: row.category,
      unlock_condition: nodeToCondition(row.condition),
    };
    if (row.maxCraft !== null) recipe.max_craft = Math.trunc(row.maxCraft) || 0;
    data[key] = recipe;
  });

  return { categories, data };
};
