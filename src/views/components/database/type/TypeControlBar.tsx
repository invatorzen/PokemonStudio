import { SecondaryButtonWithPlusIcon, SecondaryButton } from '@components/buttons';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { ControlBar, ControlBarButtonContainer, ControlBarLabelContainer } from '@components/ControlBar';
import { SelectType } from '@components/selects';
import { SelectCustomSimple } from '@components/SelectCustom';
import { useSetCurrentDatabasePath } from '@hooks/useSetCurrentDatabasePage';
import { useProjectTypes } from '@hooks/useProjectData';
import { useNavigate } from 'react-router-dom';
import { TypeDialogsRef } from './editors/TypeEditorOverlay';
import { useTypePage } from '@hooks/usePage';
import { StudioShortcutActions, useShortcut } from '@hooks/useShortcuts';
import { useDialogsRef } from '@hooks/useDialogsRef';
import { useTypeChartsConfig } from '@src/custom/TypeCharts/typeChartsConfigStore';
import { setSelectedChartId, useSelectedChartId } from '@src/custom/TypeCharts/typeChartsSelection';
import { TypeChartDialogKeys, TypeChartEditorOverlay } from '@src/custom/TypeCharts/TypeChartNewEditor';

type TypeControlBarProps = {
  dialogsRef?: TypeDialogsRef;
  onRedirect?: 'pokemon' | 'table' | 'moves';
};

// Right-side group: the Chart selector sits to the LEFT of the Type selector.
// No explicit color: inherit the default text color so "Chart" matches the "Type"
// label rendered by SelectType (SelectContainerWithLabel).
const PickerLabel = styled.span`
  ${({ theme }) => theme.fonts.normalRegular};
`;

export const TypeControlBar = ({ dialogsRef, onRedirect }: TypeControlBarProps) => {
  const { typeDbSymbol } = useTypePage();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setSelectedDataIdentifier, getPreviousDbSymbol, getNextDbSymbol } = useProjectTypes();
  useSetCurrentDatabasePath();
  const chartDialogsRef = useDialogsRef<TypeChartDialogKeys>();

  // Show the chart controls on the main Types page AND on the "Adjust type chart"
  // (table) page so their topbars look identical. The pokemon/moves list sub-views
  // keep the minimal bar.
  const showCharts = onRedirect === undefined || onRedirect === 'table';
  const { charts } = useTypeChartsConfig();
  const selectedChartId = useSelectedChartId();
  const activeChartId = charts.some((c) => c.id === selectedChartId) ? selectedChartId : 0;
  const chartOptions = useMemo(
    () => [
      { value: '0', label: t('type_charts_default') },
      ...charts.map((c) => ({ value: String(c.id), label: c.name || t('type_charts_unnamed') })),
    ],
    [charts, t]
  );

  const shortcutMap = useMemo<StudioShortcutActions>(() => {
    const isShortcutEnabled = () => dialogsRef?.current?.currentDialog === undefined;

    return {
      db_previous: () => {
        const previousDbSymbol = getPreviousDbSymbol('name');
        if (!isShortcutEnabled()) return;
        setSelectedDataIdentifier({ type: previousDbSymbol });
      },
      db_next: () => {
        const nextDbSymbol = getNextDbSymbol('name');
        if (!isShortcutEnabled()) return;
        setSelectedDataIdentifier({ type: nextDbSymbol });
      },
      db_new: () => isShortcutEnabled() && dialogsRef?.current?.openDialog(onRedirect === 'table' ? 'newTable' : 'newType'),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getPreviousDbSymbol, setSelectedDataIdentifier, getNextDbSymbol]);
  useShortcut(shortcutMap);

  const onClickNew =
    dialogsRef && (onRedirect === 'table' || !onRedirect)
      ? () => dialogsRef.current?.openDialog(onRedirect === 'table' ? 'newTable' : 'newType')
      : undefined;

  const onNewChart = () => chartDialogsRef.current?.openDialog('newChart');

  const newTypeButton = onClickNew && <SecondaryButtonWithPlusIcon onClick={onClickNew}>{t('new_type')}</SecondaryButtonWithPlusIcon>;
  const selectTypeEl = <SelectType dbSymbol={typeDbSymbol} onChange={(value) => setSelectedDataIdentifier({ type: value })} />;

  return (
    <>
      <ControlBar>
        <ControlBarLabelContainer>
          {showCharts ? <SecondaryButtonWithPlusIcon onClick={onNewChart}>{t('type_charts_add')}</SecondaryButtonWithPlusIcon> : newTypeButton}
          <SecondaryButton onClick={() => navigate(`/database/types/table`)}>{t('type_table')}</SecondaryButton>
        </ControlBarLabelContainer>
        {showCharts ? (
          <ControlBarButtonContainer>
            <ControlBarLabelContainer>
              <PickerLabel>{t('type_charts_chart')}</PickerLabel>
              <SelectCustomSimple
                id="type-chart-select"
                value={String(activeChartId)}
                options={chartOptions}
                noTooltip
                onChange={(v) => setSelectedChartId(Number(v))}
              />
            </ControlBarLabelContainer>
            <ControlBarLabelContainer>
              {selectTypeEl}
              {newTypeButton}
            </ControlBarLabelContainer>
          </ControlBarButtonContainer>
        ) : (
          selectTypeEl
        )}
      </ControlBar>
      <TypeChartEditorOverlay ref={chartDialogsRef} />
    </>
  );
};
