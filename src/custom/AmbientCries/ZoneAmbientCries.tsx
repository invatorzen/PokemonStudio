import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';

import { PageEditor } from '@components/pages';
import { InputWithLeftLabelContainer, Label, Toggle } from '@components/inputs';
import { SelectCustomSimple } from '@components/SelectCustom';
import { ResourceImage } from '@components/ResourceImage';
import { useProjectPokemon } from '@hooks/useProjectData';
import { useGetEntityNameText } from '@utils/ReadingProjectText';
import { pokemonIconPath } from '@utils/path';
import type { ProjectData } from '@src/GlobalStateProvider';
import type { StudioZone } from '@modelEntities/zone';

import { useAmbientCriesConfig } from './ambientCriesConfigStore';
import {
  buildDefaultAmbientCriesZone,
  buildDefaultZoneTiming,
  environmentForSystemTag,
  sparseSpeciesEntry,
  type AmbientCriesSpeciesEntry,
  type AmbientCriesTimingMode,
  type AmbientCriesZone,
  type AmbientEnvironment,
} from './types';
import { Hint, NarrowInput, NumberField, PairRow } from './ambientCriesUi';

const SpeciesTable = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const SPECIES_GRID_COLUMNS = '1fr 72px 96px 160px';

const SpeciesHeadRow = styled.div`
  display: grid;
  grid-template-columns: ${SPECIES_GRID_COLUMNS};
  gap: 8px;
  align-items: center;
  padding: 0 4px;
  ${({ theme }) => theme.fonts.normalSmall};
  color: ${({ theme }) => theme.colors.text400};
`;

const SpeciesRow = styled.div`
  display: grid;
  grid-template-columns: ${SPECIES_GRID_COLUMNS};
  gap: 8px;
  align-items: center;
  padding: 6px 4px;
  border-radius: 8px;

  &:hover {
    background-color: ${({ theme }) => theme.colors.dark18};
  }

  & div.creature {
    display: flex;
    align-items: center;
    gap: 8px;
    ${({ theme }) => theme.fonts.normalMedium};

    & img {
      width: 32px;
      height: 32px;
      object-fit: cover;
      object-position: 0 100%;
    }

    & span.error {
      color: ${({ theme }) => theme.colors.dangerBase};
    }
  }

  & div.cell {
    display: flex;
    justify-content: center;
  }
`;

// A titled pool (Ground / Water), with a little breathing room from the previous.
const PoolSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 12px;
`;

// Live "% chance" bar, mirroring the Grotto weighted-item table so it reads identically.
const Share = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const ShareBar = styled.div`
  height: 6px;
  border-radius: 999px;
  background-color: ${({ theme }) => theme.colors.dark20};
  overflow: hidden;
`;

const ShareFill = styled.div<{ $pct: number }>`
  height: 100%;
  width: ${({ $pct }) => Math.max(0, Math.min(100, $pct))}%;
  border-radius: 999px;
  background-color: ${({ theme }) => theme.colors.primaryBase};
  transition: width 160ms ease;
`;

const ShareLabel = styled.span`
  ${({ theme }) => theme.fonts.normalSmall};
  color: ${({ theme }) => theme.colors.text400};
`;

type WeightInputProps = {
  weight: number | undefined;
  placeholder: number;
  onChange: (weight: number | undefined) => void;
};

/**
 * Weight input that shows empty (with the encounter-rate default as placeholder)
 * when the species has no custom weight, and pushes `undefined` up when cleared —
 * so "back to default" removes the stored weight entirely.
 */
const WeightInput = ({ weight, placeholder, onChange }: WeightInputProps) => {
  const [text, setText] = useState(weight === undefined ? '' : String(weight));
  const [focused, setFocused] = useState(false);
  const display = focused ? text : weight === undefined ? '' : String(weight);

  return (
    <NarrowInput
      type="number"
      min={0}
      placeholder={String(placeholder)}
      value={display}
      onFocus={() => {
        setText(weight === undefined ? '' : String(weight));
        setFocused(true);
      }}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        setText(e.target.value);
        const raw = e.target.value.trim();
        if (raw === '') return onChange(undefined);
        const n = parseInt(raw, 10);
        if (Number.isFinite(n)) onChange(Math.max(0, n));
      }}
    />
  );
};

type SpeciesRowData = { specie: string; form: number; defaultWeight: number };

type SpeciesPoolProps = {
  title: string;
  rows: SpeciesRowData[];
  overrides: Record<string, AmbientCriesSpeciesEntry>;
  onSet: (specie: string, included: boolean, weight: number | undefined) => void;
};

/**
 * One environment's species pool (Ground or Water): a header, then a row per
 * species with an include toggle, a weight override, and a live % bar. The bar's
 * denominator is the summed effective weight of the INCLUDED species in THIS
 * pool only, so excluding one re-normalizes the rest. Display-only — no writes.
 */
const SpeciesPool = ({ title, rows, overrides, onSet }: SpeciesPoolProps) => {
  const { t } = useTranslation();
  const { projectDataValues: species } = useProjectPokemon();
  const getEntityName = useGetEntityNameText();

  const totalIncludedWeight = rows.reduce((sum, row) => {
    const entry = overrides[row.specie];
    if (entry?.included === false) return sum;
    const effectiveWeight = entry?.weight ?? row.defaultWeight;
    return effectiveWeight > 0 ? sum + effectiveWeight : sum;
  }, 0);

  return (
    <PoolSection>
      <Label>{title}</Label>
      <SpeciesTable>
        <SpeciesHeadRow>
          <span>{t('ac_zone_species_col_creature')}</span>
          <span style={{ textAlign: 'center' }}>{t('ac_zone_species_col_included')}</span>
          <span style={{ textAlign: 'center' }}>{t('ac_zone_species_col_weight')}</span>
          <span>{t('ac_zone_species_col_chance')}</span>
        </SpeciesHeadRow>
        {rows.map((row) => {
          const specie = species[row.specie];
          const entry = overrides[row.specie];
          const included = entry?.included !== false;
          const weight = entry?.weight;
          const effectiveWeight = weight ?? row.defaultWeight;
          const pct = included && effectiveWeight > 0 && totalIncludedWeight > 0 ? (effectiveWeight / totalIncludedWeight) * 100 : 0;
          return (
            <SpeciesRow key={row.specie}>
              <div className="creature">
                {specie ? (
                  <ResourceImage imagePathInProject={pokemonIconPath(specie, row.form)} fallback={pokemonIconPath(specie)} />
                ) : (
                  <ResourceImage imagePathInProject="graphics/pokedex/pokeicon/000.png" />
                )}
                {specie ? <span>{getEntityName(specie)}</span> : <span className="error">{t('ac_zone_species_deleted')}</span>}
              </div>
              <div className="cell">
                <Toggle checked={included} onChange={(e) => onSet(row.specie, e.target.checked, weight)} />
              </div>
              <div className="cell">
                <WeightInput weight={weight} placeholder={row.defaultWeight} onChange={(w) => onSet(row.specie, included, w)} />
              </div>
              <Share>
                <ShareBar>
                  <ShareFill $pct={pct} />
                </ShareBar>
                <ShareLabel>{t('ac_chance', { percent: pct.toFixed(1) })}</ShareLabel>
              </Share>
            </SpeciesRow>
          );
        })}
      </SpeciesTable>
    </PoolSection>
  );
};

type ZoneAmbientCriesProps = {
  zone: StudioZone;
  groups: ProjectData['groups'];
};

/**
 * The per-zone Ambient Cries block on the Zone page. Edits
 * `config.zones[zone.dbSymbol]` through the shared store (parked for the
 * bottom-left Save button, no auto-save).
 *
 * The species lists are DERIVED, not free-pick: each is the deduped set of
 * species in the zone's wild groups, split into a GROUND pool (played while
 * walking) and a WATER pool (played while surfing) by matching each group's
 * `systemTag` against the project config's ground/water system tags — a group
 * tagged as water (a Pond/Ocean group) only feeds the water pool. Each row
 * defaults to included, weight = its encounter rate; a row is stored only when
 * excluded or re-weighted.
 */
export const ZoneAmbientCries = ({ zone, groups }: ZoneAmbientCriesProps) => {
  const { t } = useTranslation();
  const { status, config, getZone, setZone } = useAmbientCriesConfig();

  // Deduped species per environment; default weight = summed encounter rate.
  const { groundRows, waterRows } = useMemo(() => {
    const pools: Record<AmbientEnvironment, Map<string, SpeciesRowData>> = { ground: new Map(), water: new Map() };
    zone.wildGroups.forEach((groupSym) => {
      const group = groups[groupSym];
      if (!group) return;
      const env = environmentForSystemTag(group.systemTag, config.ground_system_tags, config.water_system_tags);
      if (!env) return;
      const target = pools[env];
      group.encounters.forEach((enc) => {
        const existing = target.get(enc.specie);
        if (existing) {
          existing.defaultWeight += enc.randomEncounterChance;
        } else {
          target.set(enc.specie, { specie: enc.specie, form: enc.form < 0 ? 0 : enc.form, defaultWeight: enc.randomEncounterChance });
        }
      });
    });
    return { groundRows: Array.from(pools.ground.values()), waterRows: Array.from(pools.water.values()) };
  }, [zone.wildGroups, groups, config.ground_system_tags, config.water_system_tags]);

  const zoneCfg = getZone(zone.dbSymbol) ?? buildDefaultAmbientCriesZone();
  // A stored/collapsed inherit zone has no `timing` key; fall back so the fields
  // keep sensible values when the user switches to a real mode.
  const timing = zoneCfg.timing ?? buildDefaultZoneTiming();

  const modeOptions = useMemo(
    () => [
      { value: 'inherit', label: t('ac_timing_inherit') },
      { value: 'fixed', label: t('ac_timing_fixed') },
      { value: 'random', label: t('ac_timing_random') },
      { value: 'range', label: t('ac_timing_range') },
    ],
    [t]
  );

  const updateZone = (next: AmbientCriesZone) => setZone(zone.dbSymbol, next);

  const setSpecies = (env: AmbientEnvironment, specieSym: string, included: boolean, weight: number | undefined) => {
    const nextMap = { ...zoneCfg[env] };
    const entry = sparseSpeciesEntry(included, weight);
    if (entry) nextMap[specieSym] = entry;
    else delete nextMap[specieSym];
    updateZone({ ...zoneCfg, [env]: nextMap });
  };

  // Hold off rendering the editable body until the config has been read, so an
  // edit can't land on defaults before the real config arrives.
  if (status === 'loading' || status === 'idle') {
    return (
      <PageEditor editorTitle={t('ac_section')} title={t('ac_zone_title')} size="full" canCollapse>
        <Hint>{t('ac_loading')}</Hint>
      </PageEditor>
    );
  }

  return (
    <PageEditor editorTitle={t('ac_section')} title={t('ac_zone_title')} size="full" canCollapse>
      <InputWithLeftLabelContainer>
        <Label>{t('ac_zone_enabled')}</Label>
        <Toggle checked={zoneCfg.enabled} onChange={(e) => updateZone({ ...zoneCfg, enabled: e.target.checked })} />
      </InputWithLeftLabelContainer>

      <InputWithLeftLabelContainer>
        <Label>{t('ac_zone_timing_mode')}</Label>
        <SelectCustomSimple
          id="ac-zone-timing-mode"
          value={timing.mode}
          options={modeOptions}
          noTooltip
          onChange={(value) => updateZone({ ...zoneCfg, timing: { ...timing, mode: value as AmbientCriesTimingMode } })}
        />
      </InputWithLeftLabelContainer>

      {timing.mode === 'fixed' && (
        <InputWithLeftLabelContainer>
          <Label>{t('ac_zone_timing_value_fixed')}</Label>
          <NumberField value={timing.value} min={0} integer narrow onChange={(v) => updateZone({ ...zoneCfg, timing: { ...timing, value: v } })} />
        </InputWithLeftLabelContainer>
      )}
      {timing.mode === 'random' && (
        <InputWithLeftLabelContainer>
          <Label>{t('ac_zone_timing_value_random')}</Label>
          <NumberField value={timing.value} min={0} integer narrow onChange={(v) => updateZone({ ...zoneCfg, timing: { ...timing, value: v } })} />
        </InputWithLeftLabelContainer>
      )}
      {timing.mode === 'range' && (
        <InputWithLeftLabelContainer>
          <Label>{t('ac_zone_timing_value_range')}</Label>
          <PairRow>
            <NumberField value={timing.min} min={0} integer narrow onChange={(v) => updateZone({ ...zoneCfg, timing: { ...timing, min: v } })} />
            <span className="sep">{t('ac_range_to')}</span>
            <NumberField value={timing.max} min={0} integer narrow onChange={(v) => updateZone({ ...zoneCfg, timing: { ...timing, max: v } })} />
          </PairRow>
        </InputWithLeftLabelContainer>
      )}

      <div>
        {groundRows.length === 0 && waterRows.length === 0 ? (
          <>
            <Label>{t('ac_zone_species')}</Label>
            <Hint>{t('ac_zone_no_groups')}</Hint>
          </>
        ) : (
          <>
            <Hint>{t('ac_zone_species_hint')}</Hint>
            {groundRows.length > 0 && (
              <SpeciesPool title={t('ac_zone_ground_cries')} rows={groundRows} overrides={zoneCfg.ground} onSet={(s, i, w) => setSpecies('ground', s, i, w)} />
            )}
            {waterRows.length > 0 && (
              <SpeciesPool title={t('ac_zone_water_cries')} rows={waterRows} overrides={zoneCfg.water} onSet={(s, i, w) => setSpecies('water', s, i, w)} />
            )}
          </>
        )}
      </div>
    </PageEditor>
  );
};
