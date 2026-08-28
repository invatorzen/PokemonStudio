import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { TypeTableContainer, TypeTableHead, TypeTableRow, TypeTableBodyContainer, TableTypeContainer, TypeTableMainContainer } from './table';
import { TitleContainer } from '@components/editor/DataBlockEditorStyle';
import { useProjectTypes } from '@hooks/useProjectData';
import { HelperSelectedType, TypeHelper } from './TypeHelper';
import { StudioType } from '@modelEntities/type';
import { TypeTableDefensiveContainer } from './table/TypeTableContainers';
import { useTypeChartsConfig } from '@src/custom/TypeCharts/typeChartsConfigStore';
import { useSelectedChartId } from '@src/custom/TypeCharts/typeChartsSelection';
import { projectTypesOntoChart, damageToRow } from '@src/custom/TypeCharts/typeChartsProjection';

export const TypeTable = () => {
  const { projectDataValues: baseTypes, setProjectDataValues: setType } = useProjectTypes();
  const { charts, setTypeChartAttackRow } = useTypeChartsConfig();
  const selectedChartId = useSelectedChartId();
  const selectedChart = charts.find((chart) => chart.id === selectedChartId);
  // Project the selected alternative chart onto the types so the native table edits
  // it; "Default" (no chart) is an identity projection editing the base type data.
  const types = useMemo(() => projectTypesOntoChart(baseTypes, selectedChart), [baseTypes, selectedChart]);
  const allTypes = useMemo(() => Object.values(types).sort((a, b) => a.id - b.id), [types]);
  const [hoveredDefensiveType, setHoveredDefensiveType] = useState('__undef__');
  const [typeHelperSelected, setTypeHelperSelected] = useState<HelperSelectedType>({ offensiveType: undefined, defensiveType: undefined });
  const { t } = useTranslation();

  const editType = (type: StudioType) => {
    if (selectedChart) setTypeChartAttackRow(selectedChart.id, type.dbSymbol, damageToRow(type.damageTo));
    else setType({ [type.dbSymbol]: type });
  };

  const onMouseLeaveEnter = () => {
    setHoveredDefensiveType('__undef__');
    setTypeHelperSelected({ offensiveType: undefined, defensiveType: undefined });
  };

  return (
    <TypeTableMainContainer>
      <TypeTableContainer size="full" data-noactive onMouseLeave={onMouseLeaveEnter}>
        <TitleContainer onMouseEnter={onMouseLeaveEnter}>
          <p>{t('edition')}</p>
          <h3>{t('table')}</h3>
          <TypeTableDefensiveContainer>{t('defensive')}</TypeTableDefensiveContainer>
        </TitleContainer>
        <TableTypeContainer>
          <TypeTableHead allTypes={allTypes} t={t} hoveredDefensiveType={hoveredDefensiveType} />
          <TypeTableBodyContainer>
            {allTypes.map((type) => (
              <TypeTableRow
                currentType={type}
                allTypes={allTypes}
                editType={editType}
                key={`${type.dbSymbol}-row`}
                setHoveredDefensiveType={setHoveredDefensiveType}
                setTypeHelperSelected={setTypeHelperSelected}
              />
            ))}
          </TypeTableBodyContainer>
        </TableTypeContainer>
      </TypeTableContainer>
      <TypeHelper typeHelperSelected={typeHelperSelected} allTypes={allTypes} />
    </TypeTableMainContainer>
  );
};
