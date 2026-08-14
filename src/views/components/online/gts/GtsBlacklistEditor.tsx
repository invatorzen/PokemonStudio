import React, { useState } from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';

import { SelectPokemon } from '@components/selects/SelectPokemon';
import { SecondaryButtonWithPlusIcon, DeleteButtonOnlyIcon } from '@components/buttons';
import { ResourceImage } from '@components/ResourceImage';
import { useProjectPokemon } from '@hooks/useProjectData';
import { useGetEntityNameText } from '@utils/ReadingProjectText';
import { pokemonIconPath } from '@utils/path';
import type { GtsBlacklist } from '@utils/onlineApi';

/**
 * Controlled editor for the GTS species blacklist. `envSpecies` (the
 * ENV.GTS_SPECIES_BLACKLIST baseline) are shown read-only; `customSpecies` are
 * the runtime, DB-backed entries the admin can add/remove. The page owns the
 * server calls + refetch, so this stays a pure presentation component.
 */

const AddRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;

  & > *:first-child {
    flex: 1;
    min-width: 0;
  }
`;

const Group = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 12px;

  & > .label {
    ${({ theme }) => theme.fonts.normalSmall};
    color: ${({ theme }) => theme.colors.text400};
  }
`;

const Chips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const Chip = styled.div<{ $muted?: boolean }>`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px 4px 8px;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.dark24};
  background-color: ${({ theme }) => theme.colors.dark16};
  ${({ theme }) => theme.fonts.normalSmall};
  color: ${({ theme, $muted }) => ($muted ? theme.colors.text400 : theme.colors.text100)};

  & img {
    width: 20px;
    height: 20px;
    object-fit: cover;
    object-position: 0 100%;
  }
`;

const Empty = styled.span`
  ${({ theme }) => theme.fonts.normalSmall};
  color: ${({ theme }) => theme.colors.text400};
`;

type Props = {
  blacklist: GtsBlacklist;
  busy: boolean;
  onAdd: (speciesId: string) => void;
  onRemove: (speciesId: string) => void;
};

const SpeciesChip = ({ speciesId, children }: { speciesId: string; children?: React.ReactNode }) => {
  const { projectDataValues: species } = useProjectPokemon();
  const getEntityName = useGetEntityNameText();
  const specie = species[speciesId];
  return (
    <Chip $muted={!children}>
      <ResourceImage imagePathInProject={specie ? pokemonIconPath(specie, 0, 'icon') : 'graphics/pokedex/pokeicon/000.png'} />
      <span>{specie ? getEntityName(specie) : speciesId}</span>
      {children}
    </Chip>
  );
};

export const GtsBlacklistEditor = ({ blacklist, busy, onAdd, onRemove }: Props) => {
  const { t } = useTranslation();
  const [picked, setPicked] = useState('__undef__');

  const customIds = new Set(blacklist.customSpecies.map((s) => s.speciesId));

  const handleAdd = () => {
    if (picked && picked !== '__undef__') {
      onAdd(picked);
      setPicked('__undef__');
    }
  };

  return (
    <div>
      <AddRow>
        <SelectPokemon dbSymbol={picked} noLabel undefValueOption={t('gts_choose_species')} onChange={setPicked} />
        <SecondaryButtonWithPlusIcon onClick={handleAdd} disabled={busy || picked === '__undef__' || customIds.has(picked)}>
          {t('gts_blacklist_add')}
        </SecondaryButtonWithPlusIcon>
      </AddRow>

      <Group>
        <span className="label">{t('gts_blacklist_custom')}</span>
        {blacklist.customSpecies.length === 0 ? (
          <Empty>{t('gts_blacklist_custom_empty')}</Empty>
        ) : (
          <Chips>
            {blacklist.customSpecies.map((s) => (
              <SpeciesChip key={s.speciesId} speciesId={s.speciesId}>
                <DeleteButtonOnlyIcon size="s" onClick={() => !busy && onRemove(s.speciesId)} />
              </SpeciesChip>
            ))}
          </Chips>
        )}
      </Group>

      {blacklist.envSpecies.length > 0 && (
        <Group>
          <span className="label">{t('gts_blacklist_env')}</span>
          <Chips>
            {blacklist.envSpecies.map((id) => (
              <SpeciesChip key={id} speciesId={id} />
            ))}
          </Chips>
        </Group>
      )}
    </div>
  );
};
