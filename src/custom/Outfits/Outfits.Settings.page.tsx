import React from 'react';
import { useTranslation } from 'react-i18next';

import { PageEditor, PageTemplate } from '@components/pages';
import { Input, InputWithTopLabelContainer, Label } from '@components/inputs';

import { EmptyState, HelpText } from './outfitStyles';
import { useOutfitDraft } from './useOutfitDraft';

export const OutfitsSettingsPage = () => {
  const { t } = useTranslation();
  const { projectPath, loadState, draft, updateSlot } = useOutfitDraft();
  const ready = loadState.status === 'ready';

  return (
    <PageTemplate title={t('outfits_settings')} size="default">
      {!projectPath && <EmptyState>{t('outfits_no_project')}</EmptyState>}
      {loadState.status === 'loading' && <EmptyState>{t('outfits_loading')}</EmptyState>}
      {loadState.status === 'error' && <EmptyState>{t('outfits_load_error', { error: loadState.message })}</EmptyState>}

      {ready && (
        <PageEditor title={t('outfits_settings')} editorTitle={t('outfits_config')} canCollapse>
          <InputWithTopLabelContainer>
            <Label>{t('outfits_bag_slot')}</Label>
            <Input type="number" min="0" value={draft.outfit_bag_slot} onChange={updateSlot('outfit_bag_slot')} />
            <HelpText>{t('outfits_bag_slot_help')}</HelpText>
          </InputWithTopLabelContainer>
          <InputWithTopLabelContainer>
            <Label>{t('outfits_icon_slot')}</Label>
            <Input type="number" min="0" value={draft.outfit_icon_slot} onChange={updateSlot('outfit_icon_slot')} />
            <HelpText>{t('outfits_icon_slot_help')}</HelpText>
          </InputWithTopLabelContainer>
        </PageEditor>
      )}
    </PageTemplate>
  );
};
