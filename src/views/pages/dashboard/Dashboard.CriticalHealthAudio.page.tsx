import React from 'react';
import { useTranslation } from 'react-i18next';
import { DashboardTemplate } from '@components/dashboard';
import { CriticalHealthAudioPanel } from '@src/custom/CriticalHealthAudio/CriticalHealthAudioPanel';

export const DashboardCriticalHealthAudioPage = () => {
  const { t } = useTranslation();
  return (
    <DashboardTemplate title={t('cha_settings_title')}>
      <CriticalHealthAudioPanel />
    </DashboardTemplate>
  );
};
