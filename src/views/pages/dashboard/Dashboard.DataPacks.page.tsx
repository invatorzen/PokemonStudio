import React from 'react';
import { useTranslation } from 'react-i18next';
import { DashboardTemplate } from '@components/dashboard';
import { DataPacksPanel } from '@src/custom/DataPacks/DataPacksPanel';

export const DashboardDataPacksPage = () => {
  const { t } = useTranslation();
  return (
    <DashboardTemplate title={t('dp_title')}>
      <DataPacksPanel />
    </DashboardTemplate>
  );
};
