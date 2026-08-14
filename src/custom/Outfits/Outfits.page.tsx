import React from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';

import { PageEditor, PageTemplate } from '@components/pages';
import { SecondaryButtonWithPlusIcon } from '@components/buttons';

import { OutfitCard } from './OutfitCard';
import { EmptyState, HelpText } from './outfitStyles';
import { useOutfitDraft } from './useOutfitDraft';

const OutfitsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const AddBar = styled.div`
  display: flex;
`;

export const OutfitsPage = () => {
  const { t } = useTranslation();
  const { projectPath, loadState, draft, addOutfit, changeKey, changeEntry, deleteRow } = useOutfitDraft();
  const ready = loadState.status === 'ready';

  return (
    <PageTemplate title={t('outfits_list')} size="default">
      {!projectPath && <EmptyState>{t('outfits_no_project')}</EmptyState>}
      {loadState.status === 'loading' && <EmptyState>{t('outfits_loading')}</EmptyState>}
      {loadState.status === 'error' && <EmptyState>{t('outfits_load_error', { error: loadState.message })}</EmptyState>}

      {ready && (
        <PageEditor title={t('outfits_list')} editorTitle={t('outfits_config')}>
          <HelpText>{t('outfits_list_help')}</HelpText>
          {draft.rows.length === 0 ? (
            <EmptyState>{t('outfits_empty')}</EmptyState>
          ) : (
            <OutfitsList>
              {draft.rows.map((row) => (
                <OutfitCard key={row.id} row={row} onChangeKey={changeKey} onChangeEntry={changeEntry} onDelete={deleteRow} />
              ))}
            </OutfitsList>
          )}
          <AddBar>
            <SecondaryButtonWithPlusIcon onClick={addOutfit}>{t('outfits_add')}</SecondaryButtonWithPlusIcon>
          </AddBar>
        </PageEditor>
      )}
    </PageTemplate>
  );
};
