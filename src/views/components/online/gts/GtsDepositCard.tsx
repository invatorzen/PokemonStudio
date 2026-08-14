import React, { useState } from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';

import { ResourceImage } from '@components/ResourceImage';
import { useProjectPokemon } from '@hooks/useProjectData';
import { useGetEntityNameText } from '@utils/ReadingProjectText';
import { pokemonIconPath } from '@utils/path';
import { GiftCreatureCard } from '@components/online/mysteryGift/GiftCreatureCard';
import type { GiftCreature, GtsDepositAdmin } from '@utils/onlineApi';

/**
 * Renders one GTS deposit for the admin panel: who deposited, what they offered,
 * what they want in return, and expiry. The offered creature can be inspected
 * with the same card the Mystery Gift detail uses (best-effort mapping of the
 * opaque PSDK blob), plus a raw-JSON view so nothing is hidden when checking a
 * suspicious (cloned/hacked) mon.
 */

const Card = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  border: 1px solid ${({ theme }) => theme.colors.dark20};
  border-radius: 8px;
  padding: 16px;
  background-color: ${({ theme }) => theme.colors.dark16};
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;

  & img {
    width: 32px;
    height: 32px;
    object-fit: cover;
    object-position: 0 100%;
  }
`;

const Title = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;

  & .species {
    ${({ theme }) => theme.fonts.normalMedium};
    color: ${({ theme }) => theme.colors.text100};
  }
  & .by {
    ${({ theme }) => theme.fonts.normalSmall};
    color: ${({ theme }) => theme.colors.text400};
  }
`;

const Facts = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 4px 16px;

  & span {
    ${({ theme }) => theme.fonts.normalSmall};
    color: ${({ theme }) => theme.colors.text400};
  }
  & strong {
    color: ${({ theme }) => theme.colors.text100};
    font-weight: 500;
  }
`;

const Actions = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
`;

const LinkButton = styled.button`
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.primaryBase};
  ${({ theme }) => theme.fonts.normalSmall};
`;

const RawJson = styled.pre`
  ${({ theme }) => theme.fonts.codeRegular};
  color: ${({ theme }) => theme.colors.text100};
  background-color: ${({ theme }) => theme.colors.dark12};
  border: 1px solid ${({ theme }) => theme.colors.dark20};
  border-radius: 8px;
  padding: 10px;
  max-height: 260px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
`;

/** Best-effort map of the PSDK creature blob onto the GiftCreature card shape. */
const gtsCreatureToGift = (c: Record<string, unknown>): GiftCreature => {
  const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
  const num = (v: unknown) => (typeof v === 'number' ? v : undefined);
  return {
    id: String((c.speciesId ?? c.id ?? '') as string | number),
    level: Number(c.level ?? 1),
    shiny: typeof c.shiny === 'boolean' ? c.shiny : undefined,
    form: num(c.form),
    gender: num(c.gender),
    nature: c.nature as GiftCreature['nature'],
    ability: c.ability as GiftCreature['ability'],
    item: c.item as GiftCreature['item'],
    stats: c.stats as GiftCreature['stats'],
    bonus: Array.isArray(c.bonus) ? (c.bonus as number[]) : undefined,
    moves: Array.isArray(c.moves) ? (c.moves as string[]) : undefined,
    given_name: str(c.given_name) ?? str(c.nickname),
    loyalty: num(c.loyalty),
    trainer_name: (str(c.trainerName) ?? str(c.trainer_name)) as string | undefined,
    trainer_id: num(c.trainer_id),
  };
};

const GENDER_SYMBOL: Record<number, string> = { 0: '⚲', 1: '♂', 2: '♀' };

type Props = { deposit: GtsDepositAdmin; actions: React.ReactNode };

export const GtsDepositCard = ({ deposit, actions }: Props) => {
  const { t } = useTranslation();
  const { projectDataValues: species } = useProjectPokemon();
  const getEntityName = useGetEntityNameText();
  const [showRaw, setShowRaw] = useState(false);
  const [showCreature, setShowCreature] = useState(false);

  const gift = gtsCreatureToGift(deposit.creature);
  const offered = gift.id ? species[gift.id] : undefined;
  const wanted = deposit.wantedSpeciesId ? species[deposit.wantedSpeciesId] : undefined;

  const wantedLevel =
    deposit.wantedMinLevel === deposit.wantedMaxLevel
      ? `${deposit.wantedMinLevel}`
      : `${deposit.wantedMinLevel}–${deposit.wantedMaxLevel}`;
  const wantedGender = deposit.wantedGender === -1 ? t('gts_any') : GENDER_SYMBOL[deposit.wantedGender] ?? String(deposit.wantedGender);

  return (
    <Card>
      <Header>
        {offered ? (
          <ResourceImage imagePathInProject={pokemonIconPath(offered, gift.form ?? 0, gift.shiny ? 'iconShiny' : 'icon')} />
        ) : (
          <ResourceImage imagePathInProject="graphics/pokedex/pokeicon/000.png" />
        )}
        <Title>
          <span className="species">{offered ? getEntityName(offered) : gift.id || t('creature_deleted')}</span>
          <span className="by">{t('gts_deposited_by', { name: deposit.depositorName })}</span>
        </Title>
        <Actions>{actions}</Actions>
      </Header>

      <Facts>
        <span>
          <strong>{t('gts_wants')}:</strong> {wanted ? getEntityName(wanted) : deposit.wantedSpeciesId}
        </span>
        <span>
          <strong>{t('gts_level')}:</strong> {wantedLevel}
        </span>
        <span>
          <strong>{t('gts_gender')}:</strong> {wantedGender}
        </span>
        <span>
          <strong>{t('gts_expires')}:</strong> {new Date(deposit.expiresAt).toLocaleString()}
        </span>
      </Facts>

      <Actions>
        <LinkButton onClick={() => setShowCreature((v) => !v)}>{showCreature ? t('gts_hide_creature') : t('gts_inspect_creature')}</LinkButton>
        <LinkButton onClick={() => setShowRaw((v) => !v)}>{showRaw ? t('gts_hide_raw') : t('gts_view_raw')}</LinkButton>
      </Actions>

      {showCreature && <GiftCreatureCard c={gift} index={0} />}
      {showRaw && <RawJson>{JSON.stringify(deposit.creature, null, 2)}</RawJson>}
    </Card>
  );
};
