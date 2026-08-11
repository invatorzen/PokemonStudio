import React from 'react';
import { useTranslation } from 'react-i18next';
import { DashboardTemplate } from '@components/dashboard';
import { SosSettingsPanel } from '@src/custom/SOS/SosSettingsPanel';

export const DashboardSosPage = () => {
  const { t } = useTranslation();
  return (
    <DashboardTemplate title={t('sos_settings_title')}>
      <SosSettingsPanel />
    </DashboardTemplate>
  );
};
