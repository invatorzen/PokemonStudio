import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';

import { ResourceWrapper, SpriteResource } from '@components/resources';
import { SelectItem } from '@components/selects';
import { StudioDropDown } from '@components/StudioDropDown';
import { DeleteButtonOnlyIcon } from '@components/buttons';
import { Label } from '@components/inputs';
import { basename } from '@utils/path';

import type { OutfitDraftRow, OutfitEntry } from './types';

const Card = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 20px;
  background-color: ${({ theme }) => theme.colors.dark14};
  border: 1px solid ${({ theme }) => theme.colors.dark20};
  border-radius: 8px;
`;

const CardHeader = styled.div`
  display: flex;
  align-items: flex-end;
  gap: 12px;

  & > div:first-child {
    flex: 1;
    min-width: 0;
  }
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const SpritesRow = styled.div`
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
`;

// The gender selector's three states, mapped to the persisted `gender` key:
// 'unset' omits the key, 'male' = false, 'female' = true.
type GenderChoice = 'unset' | 'male' | 'female';

const genderToChoice = (gender: boolean | undefined): GenderChoice => (gender === undefined ? 'unset' : gender ? 'female' : 'male');
const choiceToGender = (choice: GenderChoice): boolean | undefined => (choice === 'unset' ? undefined : choice === 'female');

type OutfitCardProps = {
  row: OutfitDraftRow;
  onChangeKey: (id: string, key: string) => void;
  onChangeEntry: (id: string, entry: OutfitEntry) => void;
  onDelete: (id: string) => void;
};

export const OutfitCard = ({ row, onChangeKey, onChangeEntry, onDelete }: OutfitCardProps) => {
  const { t } = useTranslation();
  const { entry } = row;

  // Built inside the component so the labels resolve through t() — StudioDropDown
  // renders option.label verbatim.
  const genderOptions = useMemo(
    () => [
      { value: 'unset', label: t('outfits_gender_unset') },
      { value: 'male', label: t('outfits_gender_male') },
      { value: 'female', label: t('outfits_gender_female') },
    ],
    [t]
  );

  // `overworld` stores the *base* character name (e.g. `hero_01_cindy`): PSDK's
  // set_appearance_set appends `_walk`/`_run`/… itself. The actual file the user
  // picks is the walk charset `<base>_walk.png`, so we preview `<base>_walk` and
  // strip the `_walk` suffix back off when storing.
  const overworldPath = `graphics/characters/${entry.overworld ? `${entry.overworld}_walk` : ''}`;
  const backPath = `graphics/battlers/${entry.back_sprite}`;

  return (
    <Card>
      <CardHeader>
        <Field>
          <Label>{t('outfits_item')}</Label>
          {/* The map key = the outfit item's db_symbol. '' → '__undef__' so the
              select reads "None" instead of "Item deleted". */}
          <SelectItem
            dbSymbol={row.key || '__undef__'}
            onChange={(dbSymbol) => onChangeKey(row.id, dbSymbol === '__undef__' ? '' : dbSymbol)}
            undefValueOption={t('outfits_item_none')}
            noLabel
          />
        </Field>
        <DeleteButtonOnlyIcon onClick={() => onDelete(row.id)} />
      </CardHeader>

      <SpritesRow>
        <Field>
          <Label>{t('outfits_overworld')}</Label>
          <ResourceWrapper size="fourth">
            <SpriteResource
              type="character"
              title={t('outfits_overworld')}
              resourcePath={overworldPath}
              extensions={['png']}
              onResourceChoosen={(resourcePath) => onChangeEntry(row.id, { ...entry, overworld: basename(resourcePath, '.png').replace(/_walk$/i, '') })}
              onResourceClean={() => onChangeEntry(row.id, { ...entry, overworld: '' })}
            />
          </ResourceWrapper>
        </Field>

        <Field>
          <Label>{t('outfits_back_sprite')}</Label>
          <ResourceWrapper size="fourth">
            <SpriteResource
              type="battleSprite"
              title={t('outfits_back_sprite')}
              resourcePath={backPath}
              extensions={['png', 'gif']}
              onResourceChoosen={(resourcePath) =>
                onChangeEntry(row.id, { ...entry, back_sprite: basename(resourcePath, '.png').replace(/\.gif$/i, '') })
              }
              onResourceClean={() => onChangeEntry(row.id, { ...entry, back_sprite: '' })}
            />
          </ResourceWrapper>
        </Field>
      </SpritesRow>

      <Field>
        <Label>{t('outfits_gender')}</Label>
        <StudioDropDown
          value={genderToChoice(entry.gender)}
          options={genderOptions}
          onChange={(value) => {
            const nextGender = choiceToGender(value as GenderChoice);
            // Rebuild the entry so the key is truly absent (not `undefined`
            // sitting on the object) when "don't change" is picked.
            const nextEntry: OutfitEntry = { overworld: entry.overworld, back_sprite: entry.back_sprite };
            if (typeof nextGender === 'boolean') nextEntry.gender = nextGender;
            onChangeEntry(row.id, nextEntry);
          }}
        />
      </Field>
    </Card>
  );
};
