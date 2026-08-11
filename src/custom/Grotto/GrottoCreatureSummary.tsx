import React from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';

import { Tag } from '@components/Tag';
import { TypeCategoryPokemonBattler } from '@components/categories';
import { DeleteButtonOnlyIcon } from '@components/buttons';
import { ResourceImage } from '@components/ResourceImage';
import { useProjectAbilities, useProjectMoves, useProjectNatures, useProjectPokemon } from '@hooks/useProjectData';
import { useGetEntityNameText, useGetEntityNameTextUsingTextId } from '@utils/ReadingProjectText';
import { pokemonIconPath } from '@utils/path';

import { GrottoWeightInput } from './GrottoWeightInput';
import type { GrottoCreatureHash } from './types';

/**
 * Read-only summary of a grotto creature, styled like a trainer-party member:
 * sprite, name, level, and only the fields that differ from a plain roll
 * (nature, ability slot, gender, shiny, form, moves, IVs). Clicking the card
 * opens the full editor. The pick odds live here (not in the editor) and edit
 * inline; the trashcan removes the entry. Both stop propagation so they don't
 * also open the editor.
 */

const Card = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  border: 1px solid ${({ theme }) => theme.colors.dark20};
  border-radius: 8px;
  padding: 14px 16px;
  background-color: ${({ theme }) => theme.colors.dark16};
  cursor: pointer;
  transition: border-color 120ms ease, background-color 120ms ease;

  &:hover {
    border-color: ${({ theme }) => theme.colors.dark24};
    background-color: ${({ theme }) => theme.colors.dark18};
  }

  & ${Tag} {
    background-color: ${({ theme }) => theme.colors.dark20};
  }
`;

const Header = styled.div`
  display: grid;
  grid-template-columns: 40px 1fr auto 32px;
  gap: 12px;
  align-items: center;
`;

const MonIcon = styled(ResourceImage)`
  width: 40px;
  height: 40px;
  object-fit: cover;
  object-position: 0 100%;
  image-rendering: pixelated;
`;

const Title = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;

  & h4 {
    ${({ theme }) => theme.fonts.normalMedium};
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  & span.sub {
    ${({ theme }) => theme.fonts.normalSmall};
    color: ${({ theme }) => theme.colors.text400};
  }
  & span.error {
    ${({ theme }) => theme.fonts.normalMedium};
    color: ${({ theme }) => theme.colors.dangerBase};
  }
`;

const Odds = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;

  & label {
    ${({ theme }) => theme.fonts.normalSmall};
    color: ${({ theme }) => theme.colors.text400};
    white-space: nowrap;
  }
  & input {
    width: 72px;
  }
`;

const ChancePill = styled.span`
  ${({ theme }) => theme.fonts.normalSmall};
  color: ${({ theme }) => theme.colors.primaryBase};
  background-color: ${({ theme }) => theme.colors.primarySoft}33;
  border-radius: 999px;
  padding: 3px 10px;
  white-space: nowrap;
`;

const Badges = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
`;

const ShinyBadge = styled(Tag)`
  background-color: ${({ theme }) => theme.colors.warningSoft} !important;
  color: ${({ theme }) => theme.colors.warningBase};
`;

const Moves = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
`;

const Muted = styled.span`
  ${({ theme }) => theme.fonts.normalSmall};
  color: ${({ theme }) => theme.colors.text400};
`;

const IV_SHORT = ['HP', 'Atk', 'Def', 'Spe', 'SpA', 'SpD'] as const;

type Props = {
  index: number;
  weight: number;
  hash: GrottoCreatureHash;
  percent: string;
  onChangeWeight: (weight: number) => void;
  onEdit: () => void;
  onRemove: () => void;
};

const stop = (e: React.MouseEvent) => e.stopPropagation();

export const GrottoCreatureSummary = ({ index, weight, hash, percent, onChangeWeight, onEdit, onRemove }: Props) => {
  const { t } = useTranslation();
  const { projectDataValues: species } = useProjectPokemon();
  const { projectDataValues: natures } = useProjectNatures();
  const { projectDataValues: moves } = useProjectMoves();
  const { projectDataValues: abilities } = useProjectAbilities();
  const getEntityName = useGetEntityNameText();
  const getAbilityName = useGetEntityNameTextUsingTextId();

  const specie = hash.id ? species[hash.id] : undefined;
  const female = hash.gender === 2;
  const iconKind = hash.shiny ? (female ? 'iconShinyF' : 'iconShiny') : female ? 'iconF' : 'icon';
  const nature = hash.nature ? natures[hash.nature] : undefined;

  // Prefer the stored ability dbSymbol; fall back to resolving a legacy slot
  // index against the species' form abilities so old configs still read well.
  const specieForm = specie?.forms.find((f) => f.form === (hash.form ?? 0)) ?? specie?.forms[0];
  const abilitySym = hash.ability ?? (hash.ability_index !== undefined ? specieForm?.abilities?.[hash.ability_index] : undefined);
  const abilityEntity = abilitySym ? abilities[abilitySym] : undefined;
  const abilityMark = hash.ability_index !== undefined && hash.ability_index >= 0 && hash.ability_index <= 2 ? ` ${['(1)', '(2)', '(H)'][hash.ability_index]}` : '';
  const abilityLabel = abilityEntity ? `${getAbilityName(abilityEntity)}${abilityMark}` : undefined;

  const moveList = (hash.moves ?? []).filter((m) => typeof m === 'string' && m.length > 0 && m !== '__undef__');
  const ivs = Array.isArray(hash.stats) ? hash.stats : undefined;
  const hasSetIvs = !!ivs && ivs.some((n) => n != null); // null = randomized, not a "modification"

  const hasBadges =
    hash.shiny === true || (hash.form !== undefined && hash.form !== 0) || hash.gender !== undefined || !!nature || !!abilityLabel;
  const hasAnyMods = hasBadges || moveList.length > 0 || hasSetIvs;

  return (
    <Card onClick={onEdit}>
      <Header>
        {specie ? (
          <MonIcon
            imagePathInProject={pokemonIconPath(specie, hash.form ?? 0, iconKind)}
            fallback={hash.form ? pokemonIconPath(specie) : undefined}
          />
        ) : (
          <MonIcon imagePathInProject="graphics/pokedex/pokeicon/000.png" />
        )}
        <Title>
          {specie ? (
            <h4>{getEntityName(specie)}</h4>
          ) : hash.id ? (
            <span className="error">{t('creature_deleted')}</span>
          ) : (
            <h4>{t('grotto_creature_new')}</h4>
          )}
          <span className="sub">
            #{index + 1} · {t('level_value', { level: hash.level })}
          </span>
        </Title>
        <Odds onClick={stop}>
          <label>{t('grotto_odds')}</label>
          <GrottoWeightInput value={weight} onChange={onChangeWeight} />
          <ChancePill>{t('grotto_chance', { percent })}</ChancePill>
        </Odds>
        <DeleteButtonOnlyIcon
          size="s"
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            onRemove();
          }}
        />
      </Header>

      {hasBadges && (
        <Badges>
          {hash.shiny === true && <ShinyBadge>✨ {t('shiny')}</ShinyBadge>}
          {hash.form !== undefined && hash.form !== 0 && <Tag>{t('form')} {hash.form}</Tag>}
          {hash.gender !== undefined && <Tag>{female ? '♀' : hash.gender === 1 ? '♂' : '⚲'}</Tag>}
          {nature && <Tag>{getEntityName(nature)}</Tag>}
          {abilityLabel && <Tag>{abilityLabel}</Tag>}
        </Badges>
      )}

      {moveList.length > 0 && (
        <Moves>
          {moveList.map((moveSymbol, i) =>
            moves[moveSymbol] ? (
              <TypeCategoryPokemonBattler key={`${i}-${moveSymbol}`} type={moves[moveSymbol].type} isClickable={false} shortcutNavigation={() => undefined}>
                {getEntityName(moves[moveSymbol])}
              </TypeCategoryPokemonBattler>
            ) : (
              <Muted key={`${i}-${moveSymbol}`}>{moveSymbol}</Muted>
            )
          )}
        </Moves>
      )}

      {hasSetIvs && ivs && (
        <Badges>
          <Muted>{t('grotto_iv_title')}:</Muted>
          {ivs.map((n, i) => (n == null ? null : <Tag key={`${i}-${IV_SHORT[i]}`}>{`${n} ${IV_SHORT[i]}`}</Tag>))}
        </Badges>
      )}

      {!hasAnyMods && <Muted>{t('grotto_creature_default')}</Muted>}
    </Card>
  );
};
