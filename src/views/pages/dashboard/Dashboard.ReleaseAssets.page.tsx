import React from 'react';
import { useTranslation } from 'react-i18next';
import { DashboardTemplate } from '@components/dashboard';
import { ReleaseAssetsPanel } from '@src/custom/ReleaseAssets/ReleaseAssetsPanel';

export const DashboardReleaseAssetsPage = () => {
  const { t } = useTranslation();
  return (
    <DashboardTemplate title={t('ra_settings_title')}>
      <ReleaseAssetsPanel />
    </DashboardTemplate>
  );
};
