/**
 * Shared, renderer-safe types for the Easy Outfits feature.
 *
 * Mirrors the on-disk shape of the Easy Outfits plugin config at
 * `Data/configs/plugins/outfit_config.json`, registered in PSDK with
 * `Configs.register(:outfit_config, 'plugins/outfit_config', :json, …)`.
 * Imported with `import type` from both the backend task and the renderer so
 * there is one source of truth without pulling main-process code into the
 * renderer bundle.
 *
 * Studio only reads/writes this file; the plugin owns the runtime.
 */

/** PSDK-facing default bag pocket the outfit items live in. */
export const DEFAULT_OUTFIT_BAG_SLOT = 9;
/** PSDK-facing default pocket-icon index. */
export const DEFAULT_OUTFIT_ICON_SLOT = 6;

/**
 * One outfit's persisted value. `overworld` is a character graphic name (no
 * extension, under `graphics/characters/`); `back_sprite` is a battler graphic
 * name (no extension, under `graphics/battlers/`).
 *
 * `gender` is deliberately optional: `true` = female, `false` = male, and the
 * key is OMITTED entirely (never `null`) for "don't change the player's
 * gender". The Ruby distinguishes "absent" from "false", so this omission is
 * load-bearing.
 */
export type OutfitEntry = {
  overworld: string;
  back_sprite: string;
  gender?: boolean;
};

/**
 * The whole config as written to disk. `outfits` is a MAP keyed by the outfit
 * item's db_symbol (the bag item that triggers the outfit).
 */
export type OutfitConfig = {
  outfit_bag_slot: number;
  outfit_icon_slot: number;
  outfits: Record<string, OutfitEntry>;
};

/**
 * One row in the editor's ordered working list. `id` is a stable React key that
 * survives renaming the outfit (`key`), which the object form can't provide.
 */
export type OutfitDraftRow = {
  id: string;
  /** The outfit item's db_symbol — the map key. Empty while unset. */
  key: string;
  entry: OutfitEntry;
};

/**
 * The editor's in-memory draft. An ordered list keeps display order stable and
 * lets an in-progress (not-yet-keyed) row exist before an item is chosen — the
 * object form of {@link OutfitConfig} can't hold either.
 */
export type OutfitDraft = {
  outfit_bag_slot: number;
  outfit_icon_slot: number;
  rows: OutfitDraftRow[];
};

let rowIdCounter = 0;
/** Fresh stable id for a draft row. */
export const nextOutfitRowId = (): string => `outfit-row-${++rowIdCounter}`;

export const buildEmptyOutfitConfig = (): OutfitConfig => ({
  outfit_bag_slot: DEFAULT_OUTFIT_BAG_SLOT,
  outfit_icon_slot: DEFAULT_OUTFIT_ICON_SLOT,
  outfits: {},
});

export const buildEmptyOutfitDraft = (): OutfitDraft => ({
  outfit_bag_slot: DEFAULT_OUTFIT_BAG_SLOT,
  outfit_icon_slot: DEFAULT_OUTFIT_ICON_SLOT,
  rows: [],
});

/** Build the editor draft from a persisted config (preserving key order). */
export const draftFromConfig = (config: OutfitConfig): OutfitDraft => ({
  outfit_bag_slot: config.outfit_bag_slot,
  outfit_icon_slot: config.outfit_icon_slot,
  rows: Object.entries(config.outfits).map(([key, entry]) => ({
    id: nextOutfitRowId(),
    key,
    entry: {
      overworld: entry.overworld ?? '',
      back_sprite: entry.back_sprite ?? '',
      ...(typeof entry.gender === 'boolean' ? { gender: entry.gender } : {}),
    },
  })),
});

/**
 * Collapse the editor draft back into the persisted object shape.
 *  - rows with an empty key are dropped (an outfit with no triggering item is
 *    not meaningful);
 *  - on a duplicate key the last row wins;
 *  - `gender` is written only when it is a real boolean — never `null`, and the
 *    key is omitted entirely when unset, matching the Ruby's expectations.
 */
export const configFromDraft = (draft: OutfitDraft): OutfitConfig => {
  const outfits: Record<string, OutfitEntry> = {};
  draft.rows.forEach((row) => {
    const key = row.key.trim();
    if (!key) return;
    outfits[key] = {
      overworld: row.entry.overworld,
      back_sprite: row.entry.back_sprite,
      ...(typeof row.entry.gender === 'boolean' ? { gender: row.entry.gender } : {}),
    };
  });
  return {
    outfit_bag_slot: draft.outfit_bag_slot,
    outfit_icon_slot: draft.outfit_icon_slot,
    outfits,
  };
};
