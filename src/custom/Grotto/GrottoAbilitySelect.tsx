import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { StudioDropDown } from '@components/StudioDropDown';
import { useProjectAbilities } from '@hooks/useProjectData';
import { useGetEntityNameTextUsingTextId } from '@utils/ReadingProjectText';

/**
 * Ability picker for a grotto creature. PSDK's `generate_from_hash` accepts any
 * ability by symbol, so this offers every ability — but pins the selected
 * species' three slots at the top, each tagged (1)/(2)/(H), since those are what
 * a user almost always wants. Value is the ability dbSymbol (or undefined for a
 * default/random roll).
 */

const SLOT_MARK = ['(1)', '(2)', '(H)'];

type Props = {
  /** The selected species/form's [slot1, slot2, hidden] ability dbSymbols. */
  speciesAbilities: string[];
  value: string | undefined;
  /**
   * Reports the picked ability dbSymbol and, when it matches one of the species'
   * slots, that slot index (0/1/2) so the creature's `ability_index` can be set
   * too. A non-slot ability reports `undefined` for the index.
   */
  onChange: (dbSymbol: string | undefined, abilityIndex: number | undefined) => void;
};

export const GrottoAbilitySelect = ({ speciesAbilities, value, onChange }: Props) => {
  const { t } = useTranslation();
  const { projectDataValues: abilities } = useProjectAbilities();
  const getAbilityName = useGetEntityNameTextUsingTextId();

  const options = useMemo(() => {
    const nameOf = (sym: string) => (abilities[sym] ? getAbilityName(abilities[sym]) : sym);
    // Pin the species slots first, deduped (a species can repeat an ability
    // across slots) with their markers concatenated, e.g. "Chlorophyll (1)(2)".
    const slotMap = new Map<string, string>();
    speciesAbilities.forEach((sym, i) => {
      if (!sym || i > 2) return;
      slotMap.set(sym, (slotMap.get(sym) ?? '') + SLOT_MARK[i]);
    });
    const slotOptions = [...slotMap.entries()].map(([sym, mark]) => ({ value: sym, label: `${nameOf(sym)} ${mark}` }));
    const others = Object.values(abilities)
      .filter((a) => !slotMap.has(a.dbSymbol))
      .map((a) => ({ value: a.dbSymbol as string, label: getAbilityName(a) }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return [{ value: '__undef__', label: t('grotto_ability_default') }, ...slotOptions, ...others];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abilities, speciesAbilities, t]);

  const handleChange = (v: string) => {
    if (v === '__undef__') return onChange(undefined, undefined);
    // The first matching slot wins (a species can repeat an ability across
    // slots); a value not in the slots is an arbitrary ability, no index.
    const slot = speciesAbilities.slice(0, 3).indexOf(v);
    onChange(v, slot >= 0 ? slot : undefined);
  };

  return (
    <StudioDropDown
      value={value || '__undef__'}
      options={options}
      onChange={handleChange}
      optionals={{ deletedOption: t('ability_deleted') }}
    />
  );
};
