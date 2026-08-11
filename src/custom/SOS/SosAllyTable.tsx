import React from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';

import { DeleteButtonOnlyIcon } from '@components/buttons';
import { SelectPokemon } from '@components/selects/SelectPokemon';
import { SelectPokemonForm } from '@components/selects/SelectPokemonForm';
import { ResourceImage } from '@components/ResourceImage';
import { useProjectPokemon } from '@hooks/useProjectData';
import { pokemonIconPath } from '@utils/path';
import PlusIcon from '@assets/icons/global/plus-icon.svg';

import { SosRateInput } from './SosRateInput';
import type { SosAlly } from './types';

const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

// Each ally is a small stacked card: the creature select on its own line, the
// form select on the next, then the sprite + weight + share + delete beneath.
// This fits the narrow, right-docked editor panel — a horizontal row can't (the
// select alone wants 240px).
const Row = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border-radius: 10px;
  border: 1px solid ${({ theme }) => theme.colors.dark20};
  background-color: ${({ theme }) => theme.colors.dark14};
  transition: border-color 120ms ease, background-color 120ms ease;

  &:hover {
    border-color: ${({ theme }) => theme.colors.dark24};
    background-color: ${({ theme }) => theme.colors.dark16};
  }
`;

// The creature/form selects' own 240px min-width overflows a narrow editor, so
// force them (and the inner search input) to shrink to the card. The opened
// dropdown menu is still full-width — it portals to the viewport and is clamped.
const SelectLine = styled.div`
  min-width: 0;

  & > * {
    min-width: 0 !important;
    width: 100%;
  }
  & input {
    min-width: 0 !important;
  }
`;

const ControlsLine = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
`;

const IconCell = styled.div`
  width: 32px;
  height: 32px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;

  & img {
    width: 32px;
    height: 32px;
    image-rendering: pixelated;
    object-fit: cover;
    object-position: 0 100%;
  }
`;

const RateCell = styled.div`
  flex: none;

  & input {
    width: 60px;
  }
`;

const Pct = styled.span`
  flex: 1;
  min-width: 0;
  text-align: right;
  white-space: nowrap;
  ${({ theme }) => theme.fonts.normalSmall};
  color: ${({ theme }) => theme.colors.text400};
`;

const Spacer = styled.span`
  flex: 1;
  min-width: 0;
`;

const EmptyState = styled.span`
  ${({ theme }) => theme.fonts.normalMedium};
  color: ${({ theme }) => theme.colors.text400};
`;

const AddButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 10px;
  border-radius: 10px;
  border: 1px dashed ${({ theme }) => theme.colors.dark24};
  background-color: transparent;
  color: ${({ theme }) => theme.colors.text400};
  ${({ theme }) => theme.fonts.normalMedium};
  cursor: pointer;
  transition: border-color 120ms ease, color 120ms ease, background-color 120ms ease;

  & svg {
    width: 12px;
    height: 12px;
  }
  & svg path {
    fill: currentColor;
  }

  &:hover {
    border-color: ${({ theme }) => theme.colors.primaryBase};
    color: ${({ theme }) => theme.colors.primaryBase};
    background-color: ${({ theme }) => theme.colors.primarySoft}18;
  }
`;

type Props = {
  allies: SosAlly[];
  weighted: boolean;
  onChange: (allies: SosAlly[]) => void;
};

/**
 * A list of `{ species, form, weight? }` allies. Picks a creature and its form
 * (with a live icon). When `weighted` is on, each row also carries a weight and
 * shows its live share of the pool — drawn against the sum of weights of rows
 * that actually name a species, so half-filled in-progress rows don't skew it.
 * When off, the pool is uniform and no weight is stored.
 */
export const SosAllyTable = ({ allies, weighted, onChange }: Props) => {
  const { t } = useTranslation();
  const { projectDataValues: species } = useProjectPokemon();
  const total = allies.reduce((sum, ally) => sum + (ally.species && (ally.weight ?? 1) > 0 ? ally.weight ?? 1 : 0), 0);

  const updateAlly = (index: number, next: SosAlly) => onChange(allies.map((ally, i) => (i === index ? next : ally)));
  const removeAlly = (index: number) => onChange(allies.filter((_, i) => i !== index));
  const addAlly = () => onChange([...allies, weighted ? { species: '', form: 0, weight: 1 } : { species: '', form: 0 }]);

  return (
    <List>
      {allies.length === 0 && <EmptyState>{t('sos_no_allies')}</EmptyState>}
      {allies.map((ally, index) => {
        const weight = ally.weight ?? 1;
        const pct = weighted && total > 0 && ally.species && weight > 0 ? (weight / total) * 100 : 0;
        const specie = ally.species ? species[ally.species] : undefined;
        return (
          <Row key={index}>
            <SelectLine>
              <SelectPokemon
                noLabel
                dbSymbol={ally.species || '__undef__'}
                onChange={(value) => updateAlly(index, { ...ally, species: value === '__undef__' ? '' : value, form: 0 })}
                undefValueOption={t('none_option')}
              />
            </SelectLine>
            {ally.species && (
              <SelectLine>
                <SelectPokemonForm
                  noLabel
                  dbSymbol={ally.species}
                  form={ally.form}
                  onChange={(value) => updateAlly(index, { ...ally, form: parseInt(value, 10) || 0 })}
                />
              </SelectLine>
            )}
            <ControlsLine>
              <IconCell>
                <ResourceImage imagePathInProject={specie ? pokemonIconPath(specie, ally.form, 'icon') : 'graphics/pokedex/pokeicon/000.png'} />
              </IconCell>
              {weighted ? (
                <>
                  <RateCell>
                    <SosRateInput value={weight} onChange={(w) => updateAlly(index, { ...ally, weight: w })} />
                  </RateCell>
                  <Pct>{`${Math.round(pct)}%`}</Pct>
                </>
              ) : (
                <Spacer />
              )}
              <DeleteButtonOnlyIcon size="s" onClick={() => removeAlly(index)} />
            </ControlsLine>
          </Row>
        );
      })}
      <AddButton type="button" onClick={addAlly}>
        <PlusIcon />
        {t('sos_add_ally')}
      </AddButton>
    </List>
  );
};
