import React from 'react';
import { defineEditorOverlay } from '@components/editor/EditorOverlayV2';
import { assertUnreachable } from '@utils/assertUnreachable';
import { DialogRefData } from '@hooks/useDialogsRef';
import { RecipeKeyOverwriteWarning } from './RecipeKeyOverwriteWarning';

export type RecipeKeyOverwriteKeys = 'overwrite_key';
export type RecipeKeyOverwriteDialogsRef = React.RefObject<DialogRefData<RecipeKeyOverwriteKeys> | null>;

type Props = {
  onConfirm: () => void;
  currentKey: string;
  nextKey: string;
};

export const RecipeKeyOverwriteOverlay = defineEditorOverlay<RecipeKeyOverwriteKeys, Props>(
  'RecipeKeyOverwriteOverlay',
  (dialogToShow, handleCloseRef, closeDialog, { onConfirm, currentKey, nextKey }) => {
    switch (dialogToShow) {
      case 'overwrite_key':
        return <RecipeKeyOverwriteWarning ref={handleCloseRef} closeDialog={closeDialog} onConfirm={onConfirm} currentKey={currentKey} nextKey={nextKey} />;
      default:
        return assertUnreachable(dialogToShow);
    }
  }
);
