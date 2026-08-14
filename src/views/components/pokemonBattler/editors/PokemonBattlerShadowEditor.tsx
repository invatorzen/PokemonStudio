import React, { useMemo } from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import { InputGroupCollapse } from '@components/inputs/InputContainerCollapse';
import { InputWithLeftLabelContainer, InputWithTopLabelContainer, Label, PaddedInputContainer, Toggle } from '@components/inputs';
import { StudioDropDown } from '@components/StudioDropDown';
import { DarkButtonWithPlusIcon, DeleteButtonOnlyIcon } from '@components/buttons';
import { StudioShadowSetup } from '@modelEntities/groupEncounter';
import { DbSymbol } from '@modelEntities/dbSymbol';
import { useProjectDataReadonly } from '@hooks/useProjectData';
import { useSelectOptions } from '@hooks/useSelectOptions';
import { cloneEntity } from '@utils/cloneEntity';
import { InputNumber } from './InputNumber';
import { RecordExpandPokemonSetup } from './usePokemonBattler';

const DEFAULT_SHADOW: StudioShadowSetup = { heartGauge: 0, temper: 0, moves: [] };
/** db_symbol of the Shadow type shipped by cc-shadow-pokemon-system. */
const SHADOW_TYPE = 'shadow' as DbSymbol;

const ShadowMoveRowHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

type PokemonBattlerShadowEditorProps = {
  expandPokemonSetup: RecordExpandPokemonSetup;
  updateExpandPokemonSetup: (updates: Partial<RecordExpandPokemonSetup>) => void;
  collapseByDefault: boolean;
};

export const PokemonBattlerShadowEditor = ({ expandPokemonSetup, updateExpandPokemonSetup, collapseByDefault }: PokemonBattlerShadowEditorProps) => {
  const { t } = useTranslation();
  const { projectDataValues: moves } = useProjectDataReadonly('moves', 'move');
  const allMoveOptions = useSelectOptions('moves');
  const shadow = expandPokemonSetup.shadow as StudioShadowSetup | undefined;
  const enabled = shadow !== undefined;

  // Only Shadow-type moves are valid shadow moves (Pokémon XD behaviour): the
  // plugin ships them as `:shadow`-type, and custom ones follow suit.
  const shadowMoveOptions = useMemo(
    () => [
      { value: '__undef__', label: t('shadow_none_move') },
      ...allMoveOptions.filter((option) => moves[option.value as DbSymbol]?.type === SHADOW_TYPE),
    ],
    [allMoveOptions, moves, t]
  );
  const moveOptionals = useMemo(() => ({ deletedOption: t('shadow_none_move'), noOptionLabel: t('shadow_no_move_found') }), [t]);

  const updateShadow = (updates: Partial<StudioShadowSetup>) => {
    if (!shadow) return;
    updateExpandPokemonSetup({ shadow: { ...cloneEntity(shadow), ...updates } });
  };

  const updateMove = (index: number, dbSymbol: string) => {
    if (!shadow) return;
    const moves = cloneEntity(shadow.moves);
    moves[index] = dbSymbol;
    updateShadow({ moves });
  };

  return (
    <InputGroupCollapse title={t('shadow_title')} gap="16px" collapseByDefault={collapseByDefault || undefined}>
      <PaddedInputContainer size="s">
        <InputWithLeftLabelContainer>
          <Label htmlFor="shadow-enabled">{t('shadow_is_shadow')}</Label>
          <Toggle
            name="shadow-enabled"
            checked={enabled}
            onChange={(event) => updateExpandPokemonSetup({ shadow: event.target.checked ? cloneEntity(DEFAULT_SHADOW) : undefined })}
          />
        </InputWithLeftLabelContainer>
        {shadow && (
          <>
            <InputWithLeftLabelContainer>
              <Label htmlFor="shadow-heart-gauge">{t('shadow_heart_gauge')}</Label>
              <InputNumber
                name="shadow-heart-gauge"
                min="0"
                max="99999"
                defaultValue={shadow.heartGauge}
                onChange={(heartGauge) => updateShadow({ heartGauge })}
              />
            </InputWithLeftLabelContainer>
            <InputWithLeftLabelContainer>
              <Label htmlFor="shadow-temper">{t('shadow_temper')}</Label>
              <InputNumber name="shadow-temper" min="0" max="99999" defaultValue={shadow.temper} onChange={(temper) => updateShadow({ temper })} />
            </InputWithLeftLabelContainer>
            <InputWithTopLabelContainer>
              <Label>{t('shadow_moves')}</Label>
              {shadow.moves.map((move, index) => (
                <InputWithTopLabelContainer key={`shadow-move-${index}`}>
                  <ShadowMoveRowHeader>
                    <Label>{t('shadow_move_index', { id: index + 1 })}</Label>
                    <DeleteButtonOnlyIcon size="s" onClick={() => updateShadow({ moves: shadow.moves.filter((_, i) => i !== index) })} />
                  </ShadowMoveRowHeader>
                  <StudioDropDown
                    value={move || '__undef__'}
                    options={shadowMoveOptions}
                    onChange={(dbSymbol) => updateMove(index, dbSymbol)}
                    optionals={moveOptionals}
                  />
                </InputWithTopLabelContainer>
              ))}
              <DarkButtonWithPlusIcon onClick={() => updateShadow({ moves: [...shadow.moves, '__undef__'] })}>
                {t('shadow_add_move')}
              </DarkButtonWithPlusIcon>
            </InputWithTopLabelContainer>
          </>
        )}
      </PaddedInputContainer>
    </InputGroupCollapse>
  );
};
