import React from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';

import { DataBlockWithTitle } from '@components/database/dataBlocks';
import { ResourceImage } from '@components/ResourceImage';
import { useProjectPokemon } from '@hooks/useProjectData';
import { useGetEntityNameText } from '@utils/ReadingProjectText';
import { pokemonIconPath } from '@utils/path';
import { PokemonDataProps } from '@components/database/pokemon/PokemonDataPropsInterface';

import { useSosConfig } from './sosConfigStore';
import { isSosEnabled } from './types';

const AllyList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const AllyRow = styled.div`
  display: grid;
  grid-template-columns: 32px 1fr auto;
  gap: 10px;
  align-items: center;
`;

const AllyIcon = styled(ResourceImage)`
  width: 32px;
  height: 32px;
  object-fit: cover;
  object-position: 0 100%;
  image-rendering: pixelated;
`;

const AllyName = styled.span`
  ${({ theme }) => theme.fonts.normalMedium};
  color: ${({ theme }) => theme.colors.text100};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  &.error {
    color: ${({ theme }) => theme.colors.dangerBase};
  }
`;

const SharePill = styled.span`
  ${({ theme }) => theme.fonts.normalSmall};
  color: ${({ theme }) => theme.colors.primaryBase};
  background-color: ${({ theme }) => theme.colors.primarySoft}33;
  border-radius: 999px;
  padding: 3px 10px;
  white-space: nowrap;
`;

const CallRate = styled.span`
  ${({ theme }) => theme.fonts.normalSmall};
  color: ${({ theme }) => theme.colors.text400};
  margin-top: 4px;
`;

const Muted = styled.span`
  ${({ theme }) => theme.fonts.normalMedium};
  color: ${({ theme }) => theme.colors.text400};
`;

export const SosDataBlock = ({ pokemonWithForm, dialogsRef }: PokemonDataProps) => {
  const { species: creature } = pokemonWithForm;
  const { t } = useTranslation();
  const { projectDataValues: species } = useProjectPokemon();
  const getEntityName = useGetEntityNameText();
  const { getEntry } = useSosConfig();

  const entry = getEntry(creature.dbSymbol);
  const enabled = isSosEnabled(entry);
  const allies = entry?.allies ?? [];
  const weighted = allies.some((ally) => ally.weight !== undefined);
  const total = allies.reduce((sum, ally) => sum + ((ally.weight ?? 1) > 0 ? ally.weight ?? 1 : 0), 0);

  const rateLabel =
    entry?.call_rate !== undefined ? t('sos_call_rate_summary', { rate: entry.call_rate }) : t('sos_call_rate_global');

  return (
    <DataBlockWithTitle size="fourth" title={t('sos_section')} onClick={() => dialogsRef.current?.openDialog('sos')}>
      {!enabled ? (
        <Muted>{t('sos_disabled')}</Muted>
      ) : allies.length === 0 ? (
        <>
          <Muted>{t('sos_fallback')}</Muted>
          <CallRate>{rateLabel}</CallRate>
        </>
      ) : (
        <>
          <AllyList>
            {allies.map((ally, index) => {
              const specie = species[ally.species];
              const pct = weighted && total > 0 && (ally.weight ?? 1) > 0 ? Math.round(((ally.weight ?? 1) / total) * 100) : 0;
              return (
                <AllyRow key={`${index}-${ally.species}-${ally.form}`}>
                  {specie ? (
                    <AllyIcon imagePathInProject={pokemonIconPath(specie, ally.form, 'icon')} />
                  ) : (
                    <AllyIcon imagePathInProject="graphics/pokedex/pokeicon/000.png" />
                  )}
                  <AllyName className={specie ? undefined : 'error'}>{specie ? getEntityName(specie) : t('creature_deleted')}</AllyName>
                  {weighted && <SharePill>{`${pct}%`}</SharePill>}
                </AllyRow>
              );
            })}
          </AllyList>
          <CallRate>{rateLabel}</CallRate>
        </>
      )}
    </DataBlockWithTitle>
  );
};
