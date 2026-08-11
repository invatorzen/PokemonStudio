/**
 * Renderer-side constants for the Data Packs feature. The generation → versions
 * map mirrors the GENERATIONS table hard-coded in `apply_data_pack.rb` so the
 * wizard can render menus without shelling out; the script remains the source of
 * truth and validates whatever is passed.
 */

export const DATA_PACK_GENERATIONS: Record<number, string[]> = {
  1: ['red-green-blue-yellow'],
  2: ['gold-silver', 'crystal'],
  3: ['ruby-sapphire', 'firered-leafgreen', 'emerald'],
  4: ['diamond-pearl', 'platinum', 'heartgold-soulsilver'],
  5: ['black-white', 'black-2-white-2'],
  6: ['x-y', 'omega-ruby-alpha-sapphire'],
  7: ['sun-moon', 'ultra-sun-ultra-moon'],
  8: ['sword-shield'],
  9: ['scarlet-violet', 'Legends Z-A'],
};

export const DATA_PACK_GENS: number[] = Object.keys(DATA_PACK_GENERATIONS).map(Number);

/** The data categories the installer can scope to (matches the script's CATEGORIES). */
export const DATA_PACK_CATEGORIES = ['pokemon', 'moves', 'items', 'abilities', 'types'] as const;
export type DataPackCategory = (typeof DATA_PACK_CATEGORIES)[number];

export type DataPackStrategy = 'overwrite' | 'switch';
export type DataPackSourceMode = 'local' | 'remote';
