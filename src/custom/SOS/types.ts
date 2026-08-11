/**
 * Shared, renderer-safe types for the SOS-battle feature.
 *
 * Mirrors the on-disk shape of the cc-sos-battles bridge config at
 * `Data/configs/plugins/sos_battles.json` (klass
 * `Configs::Project::SosBattlesConfig`), the JSON our Ruby StudioBridge feeds
 * into Zozo's SOSBattles plugin. Imported with `import type` from both the
 * backend task and the renderer so there is a single source of truth without
 * pulling main-process code into the renderer bundle.
 *
 * Studio only reads/writes this file; the plugin + bridge own the runtime.
 */

/**
 * A single ally the caller can bring in. `form` selects which form answers
 * (0 for the base form). `weight` is optional relative odds: when every ally in
 * a pool omits it the draw is uniform, matching the bridge's WeightedDraw patch.
 */
export type SosAlly = {
  /** dbSymbol of the creature that may answer the SOS call. */
  species: string;
  /** Form index of the answering creature (0 = base form). */
  form: number;
  /** Optional positive integer weight — relative odds against the pool's sum. Absent = uniform. */
  weight?: number;
};

/**
 * One caller's SOS configuration.
 *  - `enabled`: absent or true means the species may call for help; `false`
 *    keeps the row's data but silences it (mirrors the bridge's
 *    `enabled != false` gate). SOS is opt-in — a caller with no entry never calls.
 *  - `call_rate`: optional per-species base call rate, still scaled by HP,
 *    context and Adrenaline Orb. Absent = the global `settings.base_call_rate`.
 *  - `allies`: the call pool. May be empty for an enabled caller, in which case
 *    the plugin falls back to its own kin/family/group logic.
 */
export type SosEntry = {
  enabled?: boolean;
  call_rate?: number;
  allies: SosAlly[];
};

/**
 * The full config object.
 *  - `species` is keyed by the CALLER creature's dbSymbol.
 *  - `settings` is the global SOSBattles::Settings block, authored on the
 *    "SOS Settings" page; the per-creature editor never touches it but must
 *    round-trip it untouched.
 *  - The index signature lets any other future key round-trip verbatim through
 *    read → edit → write, exactly like the grotto backend preserves unknown keys.
 */
export type SosConfig = {
  klass: string;
  species: Record<string, SosEntry>;
  settings?: Record<string, unknown>;
  // Any other unknown key is preserved verbatim on write.
  [key: string]: unknown;
};

/**
 * Answer-roll multipliers, one per flag SOSBattles::AnswerContext builds. Fixed
 * keys — the plugin's setter rejects an unknown flag, so the editor exposes
 * exactly these four.
 */
export type SosAnswerMultipliers = {
  answered_last_turn: number;
  previous_call_unanswered: number;
  hit_super_effective: number;
  pressuring_lead: number;
};

/**
 * The global SOSBattles::Settings block. Scalars are call-rate/odds knobs; the
 * three tables mirror the plugin's validated shapes:
 *  - `hp_multipliers`: rows of [ratio below which it applies, multiplier].
 *  - `chain_thresholds`: rows of [chain, perfect IVs, hidden ability %, shiny rolls].
 *  - `answer_multipliers`: the fixed-key hash above.
 */
export type SosSettings = {
  base_call_rate: number;
  family_branch_rate: number;
  family_branch_allows_evolution: boolean;
  group_fallback_rate: number;
  chain_shiny_multiplier: number;
  grace_turns: number;
  trainer_distress_percent: number;
  adrenaline_orb_multiplier: number;
  answer_rate_factor: number;
  hp_multipliers: [number, number][];
  answer_multipliers: SosAnswerMultipliers;
  chain_thresholds: [number, number, number, number][];
};

/** The plugin's own defaults (mirrors SOSBattles::Settings' initial values). */
export const DEFAULT_SOS_SETTINGS: SosSettings = {
  base_call_rate: 10,
  family_branch_rate: 15,
  family_branch_allows_evolution: false,
  group_fallback_rate: 0,
  chain_shiny_multiplier: 1,
  grace_turns: 1,
  trainer_distress_percent: 50,
  adrenaline_orb_multiplier: 2,
  answer_rate_factor: 4,
  hp_multipliers: [
    [0.2, 5],
    [0.5, 3],
  ],
  answer_multipliers: {
    answered_last_turn: 1.5,
    previous_call_unanswered: 3,
    hit_super_effective: 2,
    pressuring_lead: 1.2,
  },
  chain_thresholds: [
    [5, 1, 0, 1],
    [10, 2, 5, 1],
    [11, 2, 5, 5],
    [20, 3, 10, 5],
    [21, 3, 10, 9],
    [30, 4, 15, 9],
    [31, 4, 15, 13],
  ],
};

/** The four answer-multiplier flags, in the order the editor shows them. */
export const SOS_ANSWER_FLAGS: (keyof SosAnswerMultipliers)[] = [
  'answered_last_turn',
  'previous_call_unanswered',
  'hit_super_effective',
  'pressuring_lead',
];

/**
 * Merge the stored settings over the plugin defaults so the editor always has a
 * complete, valid block to show even when the file omits a key (or has none).
 * Table/hash values are taken whole from the stored block when present.
 */
export const effectiveSosSettings = (stored: Record<string, unknown> | undefined): SosSettings => {
  const s = (stored ?? {}) as Partial<SosSettings>;
  return {
    ...DEFAULT_SOS_SETTINGS,
    ...s,
    answer_multipliers: { ...DEFAULT_SOS_SETTINGS.answer_multipliers, ...(s.answer_multipliers ?? {}) },
    hp_multipliers: Array.isArray(s.hp_multipliers) ? s.hp_multipliers : DEFAULT_SOS_SETTINGS.hp_multipliers,
    chain_thresholds: Array.isArray(s.chain_thresholds) ? s.chain_thresholds : DEFAULT_SOS_SETTINGS.chain_thresholds,
  };
};

export const SOS_BATTLES_KLASS = 'Configs::Project::SosBattlesConfig';

/** A sensible empty config, used when the file does not exist yet. */
export const buildEmptySosConfig = (): SosConfig => ({
  klass: SOS_BATTLES_KLASS,
  species: {},
});

/**
 * Whether a caller may call for help. SOS is opt-out: a species is enabled unless
 * it has an entry that explicitly sets `enabled: false`. So no entry — or an
 * entry that only customizes allies/rate — still counts as enabled.
 */
export const isSosEnabled = (entry: SosEntry | undefined): boolean => !entry || entry.enabled !== false;
