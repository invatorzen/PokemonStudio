import React, { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';

import {
  MessageBoxActionContainer,
  MessageBoxCancelLink,
  MessageBoxContainer,
  MessageBoxIconContainer,
  MessageBoxTextContainer,
  MessageBoxTitleIconContainer,
} from '@components/MessageBoxContainer';
import { PrimaryButton } from '@components/buttons';
import EditIcon from '@assets/icons/global/edit-icon.svg';
import { EditorHandlingClose, useEditorHandlingClose } from '@components/editor/useHandleCloseEditor';

type Props = {
  closeDialog: () => void;
  onConfirm: () => void;
  currentKey: string;
  nextKey: string;
};

/**
 * Native confirmation shown when the user picks a result item while the recipe
 * already has a hand-typed key: replacing it with the result's db_symbol would
 * lose their key, so we ask first (rather than a browser `confirm()`). Picking a
 * result while the key is still empty auto-fills it silently — no dialog.
 */
export const RecipeKeyOverwriteWarning = forwardRef<EditorHandlingClose, Props>(({ closeDialog, onConfirm, currentKey, nextKey }, ref) => {
  const { t } = useTranslation();
  useEditorHandlingClose(ref);

  const handleConfirm = () => {
    closeDialog();
    onConfirm();
  };

  return (
    <MessageBoxContainer>
      <MessageBoxTitleIconContainer>
        <MessageBoxIconContainer>
          <EditIcon width="24" height="24" />
        </MessageBoxIconContainer>
        <h3>{t('crafting_overwrite_key_title')}</h3>
      </MessageBoxTitleIconContainer>
      <MessageBoxTextContainer>
        <p>{t('crafting_overwrite_key_body', { currentKey, nextKey })}</p>
      </MessageBoxTextContainer>
      <MessageBoxActionContainer>
        <MessageBoxCancelLink onClick={closeDialog}>{t('crafting_overwrite_key_keep')}</MessageBoxCancelLink>
        <PrimaryButton onClick={handleConfirm}>{t('crafting_overwrite_key_replace')}</PrimaryButton>
      </MessageBoxActionContainer>
    </MessageBoxContainer>
  );
});

RecipeKeyOverwriteWarning.displayName = 'RecipeKeyOverwriteWarning';
