import React from 'react';
import { useTranslation } from 'react-i18next';
import { DashboardTemplate } from '@components/dashboard';
import { AmbientCriesGlobalPanel } from '@src/custom/AmbientCries/AmbientCriesGlobalPanel';

export const DashboardAmbientCriesPage = () => {
  const { t } = useTranslation();
  return (
    <DashboardTemplate title={t('ac_settings_title')}>
      <AmbientCriesGlobalPanel />
    </DashboardTemplate>
  );
};
