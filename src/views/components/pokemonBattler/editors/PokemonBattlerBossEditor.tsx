import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { TFunction } from 'i18next';
import { InputGroupCollapse } from '@components/inputs/InputContainerCollapse';
import { Input, InputWithLeftLabelContainer, InputWithTopLabelContainer, Label, PaddedInputContainer, Toggle } from '@components/inputs';
import { SelectCustomSimple } from '@components/SelectCustom';
import { SelectType } from '@components/selects';
import { StudioBossSetup } from '@modelEntities/groupEncounter';
import { BOSS_EFFECTS } from '@src/custom/MapEditor/events/dialog/commandModel';
import { cloneEntity } from '@utils/cloneEntity';
import { InputNumber } from './InputNumber';
import { RecordExpandPokemonSetup } from './usePokemonBattler';

const DEFAULT_BOSS: StudioBossSetup = { bars: 1, aura: 'none', effects: [] };

/** Aura is a small three-way mode; only the "type" mode carries a db_symbol. */
type AuraMode = 'none' | 'default' | 'type';
const AURA_MODES: readonly AuraMode[] = ['none', 'default', 'type'] as const;
const auraModeOf = (aura: string): AuraMode => (aura === 'none' ? 'none' : aura === 'default' ? 'default' : 'type');
const auraModeEntries = (t: TFunction) => AURA_MODES.map((mode) => ({ value: mode, label: t(`boss_aura_${mode}`) }));

type PokemonBattlerBossEditorProps = {
  expandPokemonSetup: RecordExpandPokemonSetup;
  updateExpandPokemonSetup: (updates: Partial<RecordExpandPokemonSetup>) => void;
  collapseByDefault: boolean;
};

export const PokemonBattlerBossEditor = ({ expandPokemonSetup, updateExpandPokemonSetup, collapseByDefault }: PokemonBattlerBossEditorProps) => {
  const { t } = useTranslation();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const auraOptions = useMemo(() => auraModeEntries(t), []);
  const boss = expandPokemonSetup.boss as StudioBossSetup | undefined;
  const enabled = boss !== undefined;
  const auraMode = boss ? auraModeOf(boss.aura) : 'none';
  // Effects the game registered beyond the nine built-ins (custom boss effects
  // are an open registry: `register(:my_effect, MyEffect)`), edited as free text.
  const customEffects = boss ? boss.effects.filter((effect) => !(BOSS_EFFECTS as readonly string[]).includes(effect)) : [];

  const updateBoss = (updates: Partial<StudioBossSetup>) => {
    if (!boss) return;
    updateExpandPokemonSetup({ boss: { ...cloneEntity(boss), ...updates } });
  };

  const onChangeAuraMode = (mode: AuraMode) => {
    if (mode === 'none') return updateBoss({ aura: 'none' });
    if (mode === 'default') return updateBoss({ aura: 'default' });
    // Keep the picked type when re-selecting "type"; otherwise start unselected.
    updateBoss({ aura: auraMode === 'type' && boss ? boss.aura : '__undef__' });
  };

  return (
    <InputGroupCollapse title={t('boss_title')} gap="16px" collapseByDefault={collapseByDefault || undefined}>
      <PaddedInputContainer size="s">
        <InputWithLeftLabelContainer>
          <Label htmlFor="boss-enabled">{t('boss_is_boss')}</Label>
          <Toggle
            name="boss-enabled"
            checked={enabled}
            onChange={(event) => updateExpandPokemonSetup({ boss: event.target.checked ? cloneEntity(DEFAULT_BOSS) : undefined })}
          />
        </InputWithLeftLabelContainer>
        {boss && (
          <>
            <InputWithLeftLabelContainer>
              <Label htmlFor="boss-bars">{t('boss_bars')}</Label>
              <InputNumber name="boss-bars" min="0" max="5" defaultValue={boss.bars} onChange={(bars) => updateBoss({ bars })} />
            </InputWithLeftLabelContainer>
            <InputWithTopLabelContainer>
              <Label htmlFor="boss-aura">{t('boss_aura')}</Label>
              <SelectCustomSimple
                id="boss-aura"
                options={auraOptions}
                value={auraMode}
                onChange={(selected) => onChangeAuraMode(selected as AuraMode)}
                noTooltip
              />
            </InputWithTopLabelContainer>
            {auraMode === 'type' && (
              <InputWithTopLabelContainer>
                <Label htmlFor="boss-aura-type">{t('boss_aura_type')}</Label>
                <SelectType dbSymbol={boss.aura} onChange={(aura) => updateBoss({ aura })} noneValue noLabel />
              </InputWithTopLabelContainer>
            )}
            <InputWithTopLabelContainer>
              <Label>{t('boss_effects')}</Label>
            </InputWithTopLabelContainer>
            {BOSS_EFFECTS.map((effect) => (
              <InputWithLeftLabelContainer key={effect}>
                <Label htmlFor={`boss-effect-${effect}`}>{t(`boss_effect_${effect}`)}</Label>
                <Toggle
                  name={`boss-effect-${effect}`}
                  checked={boss.effects.includes(effect)}
                  onChange={(event) =>
                    updateBoss({
                      effects: event.target.checked ? [...boss.effects, effect] : boss.effects.filter((e) => e !== effect),
                    })
                  }
                />
              </InputWithLeftLabelContainer>
            ))}
            <InputWithTopLabelContainer>
              <Label htmlFor="boss-effects-custom">{t('boss_effects_custom')}</Label>
              <Input
                name="boss-effects-custom"
                type="text"
                value={customEffects.join(', ')}
                placeholder={t('boss_effects_custom_ph')}
                onChange={(event) => {
                  const parsed = event.target.value
                    .split(',')
                    .map((entry) => entry.trim())
                    .filter(Boolean);
                  const known = boss.effects.filter((effect) => (BOSS_EFFECTS as readonly string[]).includes(effect));
                  updateBoss({ effects: [...known, ...parsed] });
                }}
              />
            </InputWithTopLabelContainer>
          </>
        )}
      </PaddedInputContainer>
    </InputGroupCollapse>
  );
};
