import React, { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';

import { DeleteButtonOnlyIcon } from '@components/buttons';
import { Input } from '@components/inputs';
import { Deletion } from '@components/deletion';
import { defineEditorOverlay } from '@components/editor/EditorOverlayV2';
import { EditorHandlingClose, useEditorHandlingClose } from '@components/editor/useHandleCloseEditor';
import { useDialogsRef } from '@hooks/useDialogsRef';
import { assertUnreachable } from '@utils/assertUnreachable';

import { useTypeChartsConfig } from './typeChartsConfigStore';
import { setSelectedChartId } from './typeChartsSelection';
import type { TypeChart } from './types';

/**
 * The header shown on the "Adjust type chart" (table) page when an alternative
 * chart is selected: rename or delete the chart. The effectiveness itself is
 * edited in the native Types table below, which the projection layer points at
 * the selected chart. Edits park for the bottom-left Save button — no auto-save.
 *
 * Deleting goes through the native `Deletion` confirm overlay (never a silent
 * removal), then falls back to the Default chart.
 */

const Container = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 8px 8px;

  & > .name {
    flex: 1;
    max-width: 360px;
  }
`;

const Label = styled.span`
  ${({ theme }) => theme.fonts.normalMedium};
  color: ${({ theme }) => theme.colors.text400};
`;

type ChartDeletionKeys = 'deleteChart';

const chartLabel = (chart: TypeChart, unnamed: string) => chart.name || unnamed;

const ChartDeletionEditor = forwardRef<EditorHandlingClose, { chart: TypeChart; closeDialog: () => void }>(({ chart, closeDialog }, ref) => {
  const { t } = useTranslation();
  const { deleteTypeChart } = useTypeChartsConfig();
  useEditorHandlingClose(ref);

  const name = chartLabel(chart, t('type_charts_unnamed'));
  return (
    <Deletion
      title={t('type_charts_deletion_title')}
      message={t('type_charts_deletion_message', { name })}
      onClickDelete={() => {
        deleteTypeChart(chart.id);
        setSelectedChartId(0);
        closeDialog();
      }}
      onClose={closeDialog}
    />
  );
});
ChartDeletionEditor.displayName = 'ChartDeletionEditor';

const TypeChartDeletionOverlay = defineEditorOverlay<ChartDeletionKeys, { chart: TypeChart }>(
  'TypeChartDeletionOverlay',
  (dialogToShow, handleCloseRef, closeDialog, { chart }) => {
    switch (dialogToShow) {
      case 'deleteChart':
        return <ChartDeletionEditor chart={chart} closeDialog={closeDialog} ref={handleCloseRef} />;
      default:
        return assertUnreachable(dialogToShow);
    }
  }
);

export const TypeChartEditor = ({ chart }: { chart: TypeChart }) => {
  const { t } = useTranslation();
  const { renameTypeChart } = useTypeChartsConfig();
  const deletionRef = useDialogsRef<ChartDeletionKeys>();

  return (
    <Container>
      <Label>{t('type_charts_name')}</Label>
      <Input className="name" value={chart.name} onChange={(e) => renameTypeChart(chart.id, e.target.value)} />
      <DeleteButtonOnlyIcon size="s" onClick={() => deletionRef.current?.openDialog('deleteChart', true)} />
      <TypeChartDeletionOverlay ref={deletionRef} chart={chart} />
    </Container>
  );
};
