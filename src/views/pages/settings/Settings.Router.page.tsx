import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { SettingsNavigation } from '@components/settings';
import { SettingsMapsPage } from './Settings.maps.page';
import { SettingsLanguagePage } from './Settings.language.page';
import { SettingsThemePage } from './Settings.theme.page';
import { PageWithMenu, PageWithMenuProps } from '@components/pages';

const SettingsPageWithMenu = ({ children }: Omit<PageWithMenuProps, 'navigation'>) => (
  <PageWithMenu navigation={<SettingsNavigation />}>{children}</PageWithMenu>
);

const SettingsRouterComponent = () => {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="language" />} />
      <Route
        path="language"
        element={
          <SettingsPageWithMenu>
            <SettingsLanguagePage />
          </SettingsPageWithMenu>
        }
      />
      <Route
        path="maps"
        element={
          <SettingsPageWithMenu>
            <SettingsMapsPage />
          </SettingsPageWithMenu>
        }
      />
      <Route
        path="theme"
        element={
          <SettingsPageWithMenu>
            <SettingsThemePage />
          </SettingsPageWithMenu>
        }
      />
    </Routes>
  );
};

export default SettingsRouterComponent;
