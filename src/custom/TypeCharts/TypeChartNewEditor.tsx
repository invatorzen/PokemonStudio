import React, { forwardRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';

import { Editor } from '@components/editor';
import { Input, InputContainer, InputWithTopLabelContainer, Label } from '@components/inputs';
import { DarkButton, PrimaryButton } from '@components/buttons';
import { EditorHandlingClose, useEditorHandlingClose } from '@components/editor/useHandleCloseEditor';
import { defineEditorOverlay } from '@components/editor/EditorOverlayV2';
import { DialogRefData } from '@hooks/useDialogsRef';
import { assertUnreachable } from '@utils/assertUnreachable';
import { useProjectTypes } from '@hooks/useProjectData';
import { TooltipWrapper } from '@ds/Tooltip';
import { playSound } from '@utils/sound';

import { useTypeChartsConfig } from './typeChartsConfigStore';
import { setSelectedChartId } from './typeChartsSelection';
import { buildDefaultEffectiveness } from './types';

/**
 * The naming overlay for creating a new type chart. Opened from the "New chart"
 * button in the TypeControlBar; on create it seeds the chart with a full copy of
 * the current DEFAULT effectiveness, selects it, and parks the edit for Save.
 */

const ButtonContainer = styled.div`
  display: flex;
  flex-direction: column;
  padding: 16px 0 0 0;
  gap: 8px;
`;

type TypeChartNewEditorProps = { closeDialog: () => void };

const TypeChartNewEditor = forwardRef<EditorHandlingClose, TypeChartNewEditorProps>(({ closeDialog }, ref) => {
  const { t } = useTranslation();
  const { projectDataValues: types } = useProjectTypes();
  const { addTypeChart } = useTypeChartsConfig();
  const [name, setName] = useState('');

  useEditorHandlingClose(ref);

  const onCreate = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const id = addTypeChart(trimmed, buildDefaultEffectiveness(Object.values(types)));
    setSelectedChartId(id);
    playSound('ready');
    closeDialog();
  };

  return (
    <Editor type="creation" title={t('type_charts_add')}>
      <InputContainer>
        <InputWithTopLabelContainer>
          <Label htmlFor="chart-name" required>
            {t('type_charts_name')}
          </Label>
          <Input
            id="chart-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('type_charts_name_placeholder')}
            onKeyDown={(e) => e.key === 'Enter' && onCreate()}
          />
        </InputWithTopLabelContainer>
        <ButtonContainer>
          <TooltipWrapper data-tooltip={!name.trim() ? t('fields_asterisk_required') : undefined}>
            <PrimaryButton onClick={onCreate} disabled={!name.trim()}>
              {t('type_charts_create')}
            </PrimaryButton>
          </TooltipWrapper>
          <DarkButton onClick={closeDialog}>{t('cancel')}</DarkButton>
        </ButtonContainer>
      </InputContainer>
    </Editor>
  );
});
TypeChartNewEditor.displayName = 'TypeChartNewEditor';

export type TypeChartDialogKeys = 'newChart';
export type TypeChartDialogsRef = React.RefObject<DialogRefData<TypeChartDialogKeys> | null>;

export const TypeChartEditorOverlay = defineEditorOverlay<TypeChartDialogKeys>(
  'TypeChartEditorOverlay',
  (dialogToShow, handleCloseRef, closeDialog) => {
    switch (dialogToShow) {
      case 'newChart':
        return <TypeChartNewEditor closeDialog={closeDialog} ref={handleCloseRef} />;
      default:
        return assertUnreachable(dialogToShow);
    }
  }
);
