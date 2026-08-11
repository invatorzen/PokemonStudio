import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';

import { Input, InputWithLeftLabelContainer, InputWithTopLabelContainer, Label, PaddedInputContainer, Toggle } from '@components/inputs';
import { StudioDropDown } from '@components/StudioDropDown';
import { SelectPokemon } from '@components/selects/SelectPokemon';
import { SelectPokemonForm } from '@components/selects/SelectPokemonForm';
import { SelectNature } from '@components/selects/SelectNature';
import { SelectMove } from '@components/selects/SelectMove';
import { ResourceImage } from '@components/ResourceImage';
import { useProjectPokemon } from '@hooks/useProjectData';
import { useGetEntityNameText } from '@utils/ReadingProjectText';
import { pokemonIconPath } from '@utils/path';

import { GrottoAbilitySelect } from './GrottoAbilitySelect';
import type { GrottoCreatureHash } from './types';

// A plain scrim — NOT the event-dialog Scrim, whose `backdrop-filter` creates a
// stacking context that ends up above StudioDropDown's body-portaled menus
// (z-index 6000), hiding them. This mirrors the Mystery-Gift CreaturesModal,
// which sits below 6000 so its dropdowns render in front.
const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 5000;
  background-color: rgba(10, 9, 11, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
`;

/**
 * Full editor for a single grotto creature (PSDK `generate_from_hash` shape),
 * opened from a summary card. Deliberately does NOT edit the pick weight — that
 * is the odds of this creature being drawn and belongs on the card, not among
 * the creature's own stats where "weight" reads like the mon's mass.
 *
 * Edits apply live to the config via `onChangeHash`; the footer just closes.
 */

const Dialog = styled.div`
  width: 720px;
  max-width: calc(100vw - 48px);
  max-height: calc(100vh - 48px);
  display: flex;
  flex-direction: column;
  background: ${({ theme }) => theme.colors.dark16};
  border: 1px solid ${({ theme }) => theme.colors.dark24};
  border-radius: 10px;
  overflow: hidden;
  ${({ theme }) => theme.fonts.normalRegular};
  color: ${({ theme }) => theme.colors.text100};

  & *::-webkit-scrollbar {
    width: 10px;
  }
  & *::-webkit-scrollbar-thumb {
    background: ${({ theme }) => theme.colors.dark24};
    border: 2px solid ${({ theme }) => theme.colors.dark16};
    border-radius: 6px;
  }
  & *::-webkit-scrollbar-track {
    background: transparent;
  }
  & input {
    box-sizing: border-box;
  }
`;

const TitleBar = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.dark20};

  & img.mon-icon {
    width: 32px;
    height: 32px;
    object-fit: cover;
    object-position: 0 100%;
    image-rendering: pixelated;
  }

  & h3 {
    ${({ theme }) => theme.fonts.titlesHeadline6};
    margin: 0;
  }
`;

const Body = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px;
`;

const FieldGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
`;

const IvGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
`;

const IvHint = styled.p`
  ${({ theme }) => theme.fonts.normalSmall};
  color: ${({ theme }) => theme.colors.text400};
  margin: -4px 0 4px;
`;

const Footer = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid ${({ theme }) => theme.colors.dark20};
`;

const FooterBtn = styled.button<{ $secondary?: boolean }>`
  padding: 8px 22px;
  border-radius: 8px;
  border: 1px solid ${({ theme, $secondary }) => ($secondary ? theme.colors.dark24 : theme.colors.primaryBase)};
  background: ${({ theme, $secondary }) => ($secondary ? 'transparent' : theme.colors.primaryBase)};
  color: ${({ theme }) => theme.colors.text100};
  ${({ theme }) => theme.fonts.normalMedium};
  cursor: pointer;
  &:hover {
    filter: brightness(1.1);
  }
  &:disabled {
    opacity: 0.4;
    cursor: default;
    filter: none;
  }
`;

type ShinyChoice = 'random' | 'true' | 'false';
const shinyToChoice = (shiny: boolean | undefined): ShinyChoice => (shiny === true ? 'true' : shiny === false ? 'false' : 'random');
const choiceToShiny = (choice: ShinyChoice): boolean | undefined => (choice === 'true' ? true : choice === 'false' ? false : undefined);

type GenderChoice = 'random' | '1' | '2';
const genderToChoice = (gender: number | undefined): GenderChoice => (gender === 1 ? '1' : gender === 2 ? '2' : 'random');
const choiceToGender = (choice: GenderChoice): number | undefined => (choice === '1' ? 1 : choice === '2' ? 2 : undefined);

// Studio's canonical stat order: [HP, Atk, Def, Speed, Sp. Atk, Sp. Def].
const IV_LABEL_KEYS = ['grotto_iv_hp', 'grotto_iv_atk', 'grotto_iv_def', 'grotto_iv_spd', 'grotto_iv_ats', 'grotto_iv_dfs'];

type Props = {
  initialHash: GrottoCreatureHash;
  mode: 'create' | 'edit';
  onCommit: (hash: GrottoCreatureHash) => void;
  onClose: () => void;
};

export const GrottoCreatureEditor = ({ initialHash, mode, onCommit, onClose }: Props) => {
  const { t } = useTranslation();
  const { projectDataValues: species } = useProjectPokemon();
  const getEntityName = useGetEntityNameText();

  // Edit a local draft; nothing touches the config until the user commits with
  // the footer button. So adding a Pokémon only sticks if they click "Add", and
  // cancelling (backdrop or Cancel) discards.
  const [draft, setDraft] = useState<GrottoCreatureHash>(initialHash);
  const hash = draft; // alias so the field reads below stay `hash.x`
  const onChangeHash = (patch: Partial<GrottoCreatureHash>) => setDraft((d) => ({ ...d, ...patch }));

  const specie = hash.id ? species[hash.id] : undefined;
  const female = hash.gender === 2;
  const iconKind = hash.shiny ? (female ? 'iconShinyF' : 'iconShiny') : female ? 'iconF' : 'icon';
  const specieForm = specie?.forms.find((f) => f.form === (hash.form ?? 0)) ?? specie?.forms[0];
  const speciesAbilities: string[] = specieForm?.abilities ?? [];

  const shinyOptions = [
    { value: 'random', label: t('grotto_shiny_random') },
    { value: 'true', label: t('grotto_shiny_always') },
    { value: 'false', label: t('grotto_shiny_never') },
  ];
  const genderOptions = [
    { value: 'random', label: t('grotto_gender_random') },
    { value: '1', label: t('grotto_gender_male') },
    { value: '2', label: t('grotto_gender_female') },
  ];

  const ivsEnabled = Array.isArray(hash.stats);
  // null at a slot = "randomize this IV"; a number fixes it. New IV blocks start
  // all-random so the user only pins the ones they care about.
  const ivs: (number | null)[] = Array.isArray(hash.stats) ? hash.stats : [null, null, null, null, null, null];
  const setIv = (statIndex: number, value: number | null) => {
    const next = [...ivs];
    next[statIndex] = value;
    onChangeHash({ stats: next });
  };

  const moves = hash.moves ?? ['', '', '', ''];

  // Portal to #dialogs (as the Mystery-Gift modals do) so the modal isn't
  // trapped inside the page's stacking context and the StudioDropDown menus
  // (portaled to body at z-index 6000) render above the Scrim (z-index 5000).
  // Close only when the backdrop itself is clicked. Crucially we do NOT
  // stopPropagation on the dialog: StudioDropDown opens/closes via a window
  // click listener, and swallowing clicks here left its menus stuck open.
  return createPortal(
    <Overlay onClick={(e) => e.target === e.currentTarget && onClose()}>
      <Dialog>
        <TitleBar>
          {specie ? (
            <ResourceImage
              className="mon-icon"
              imagePathInProject={pokemonIconPath(specie, hash.form ?? 0, iconKind)}
              fallback={hash.form ? pokemonIconPath(specie) : undefined}
            />
          ) : (
            <ResourceImage className="mon-icon" imagePathInProject="graphics/pokedex/pokeicon/000.png" />
          )}
          <h3>{specie ? getEntityName(specie) : t('grotto_creature_new')}</h3>
        </TitleBar>

        <Body>
          <PaddedInputContainer size="s">
            <InputWithTopLabelContainer>
              <Label required>{t('grotto_creature')}</Label>
              <SelectPokemon
                noLabel
                dbSymbol={hash.id || '__undef__'}
                onChange={(v) => onChangeHash({ id: v === '__undef__' ? '' : v, form: 0 })}
                undefValueOption={t('none_option')}
              />
            </InputWithTopLabelContainer>

            <FieldGrid>
              <InputWithTopLabelContainer>
                <Label required>{t('level')}</Label>
                <Input
                  type="number"
                  min="1"
                  max="100"
                  value={hash.level}
                  onChange={(e) => onChangeHash({ level: Math.max(1, Math.min(100, parseInt(e.target.value) || 1)) })}
                />
              </InputWithTopLabelContainer>

              <InputWithTopLabelContainer>
                <Label>{t('form')}</Label>
                {hash.id ? (
                  <SelectPokemonForm noLabel dbSymbol={hash.id} form={hash.form ?? 0} onChange={(v) => onChangeHash({ form: parseInt(v) || 0 })} />
                ) : (
                  <Input type="number" min="0" value={hash.form ?? 0} onChange={(e) => onChangeHash({ form: parseInt(e.target.value) || 0 })} />
                )}
              </InputWithTopLabelContainer>
            </FieldGrid>

            <FieldGrid>
              <InputWithTopLabelContainer>
                <Label>{t('nature')}</Label>
                <SelectNature
                  dbSymbol={hash.nature ?? '__undef__'}
                  onChange={(opt) => onChangeHash({ nature: opt.value === '__undef__' ? undefined : opt.value })}
                  noneValue
                  overwriteNoneValue={t('none_option')}
                />
              </InputWithTopLabelContainer>

              <InputWithTopLabelContainer>
                <Label>{t('ability')}</Label>
                <GrottoAbilitySelect
                  speciesAbilities={speciesAbilities}
                  value={hash.ability}
                  onChange={(dbSymbol, abilityIndex) => onChangeHash({ ability: dbSymbol, ability_index: abilityIndex })}
                />
              </InputWithTopLabelContainer>
            </FieldGrid>

            <FieldGrid>
              <InputWithTopLabelContainer>
                <Label>{t('shiny')}</Label>
                <StudioDropDown
                  value={shinyToChoice(hash.shiny)}
                  options={shinyOptions}
                  onChange={(v) => onChangeHash({ shiny: choiceToShiny(v as ShinyChoice) })}
                />
              </InputWithTopLabelContainer>

              <InputWithTopLabelContainer>
                <Label>{t('gender')}</Label>
                <StudioDropDown
                  value={genderToChoice(hash.gender)}
                  options={genderOptions}
                  onChange={(v) => onChangeHash({ gender: choiceToGender(v as GenderChoice) })}
                />
              </InputWithTopLabelContainer>
            </FieldGrid>

            <InputWithTopLabelContainer>
              <Label>{t('moves')}</Label>
              <FieldGrid>
                {[0, 1, 2, 3].map((mIdx) => (
                  <SelectMove
                    key={mIdx}
                    noLabel
                    dbSymbol={moves[mIdx] || '__undef__'}
                    onChange={(val) => {
                      const nextMoves = [...moves];
                      while (nextMoves.length < 4) nextMoves.push('');
                      nextMoves[mIdx] = val === '__undef__' ? '' : val;
                      onChangeHash({ moves: nextMoves });
                    }}
                    undefValueOption={t('none_option')}
                  />
                ))}
              </FieldGrid>
            </InputWithTopLabelContainer>

            <InputWithLeftLabelContainer>
              <Label>{t('grotto_iv_title')}</Label>
              <Toggle
                checked={ivsEnabled}
                onChange={(e) => onChangeHash({ stats: e.target.checked ? [null, null, null, null, null, null] : undefined })}
              />
            </InputWithLeftLabelContainer>
            {ivsEnabled && (
              <>
                <IvHint>{t('grotto_iv_hint')}</IvHint>
                <IvGrid>
                  {IV_LABEL_KEYS.map((key, statIndex) => (
                    <InputWithTopLabelContainer key={key}>
                      <Label>{t(key)}</Label>
                      <Input
                        type="number"
                        min="0"
                        max="31"
                        placeholder={t('grotto_iv_random')}
                        value={ivs[statIndex] ?? ''}
                        onChange={(e) =>
                          setIv(statIndex, e.target.value === '' ? null : Math.max(0, Math.min(31, parseInt(e.target.value) || 0)))
                        }
                      />
                    </InputWithTopLabelContainer>
                  ))}
                </IvGrid>
              </>
            )}
          </PaddedInputContainer>
        </Body>

        <Footer>
          <FooterBtn type="button" $secondary onClick={onClose}>
            {t('cancel')}
          </FooterBtn>
          <FooterBtn
            type="button"
            disabled={!draft.id}
            onClick={() => {
              onCommit(draft);
              onClose();
            }}
          >
            {mode === 'create' ? t('grotto_add_this') : t('grotto_done')}
          </FooterBtn>
        </Footer>
      </Dialog>
    </Overlay>,
    document.querySelector('#dialogs') || document.body
  );
};
