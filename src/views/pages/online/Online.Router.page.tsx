import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { OnlineNavigation } from '@components/online';
import { PageWithMenu, PageWithMenuProps } from '@components/pages';
import { OnlineMysteryGiftPage } from './Online.MysteryGift.page';
import { OnlineGtsPage } from './Online.Gts.page';
import { OnlineSettingsPage } from './Online.Settings.page';

const OnlinePageWithMenu = ({ children }: Omit<PageWithMenuProps, 'navigation'>) => (
  <PageWithMenu navigation={<OnlineNavigation />}>{children}</PageWithMenu>
);

const OnlineRouterComponent = () => {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="mystery-gift" />} />
      <Route
        path="mystery-gift"
        element={
          <OnlinePageWithMenu>
            <OnlineMysteryGiftPage />
          </OnlinePageWithMenu>
        }
      />
      <Route
        path="gts"
        element={
          <OnlinePageWithMenu>
            <OnlineGtsPage />
          </OnlinePageWithMenu>
        }
      />
      <Route
        path="settings"
        element={
          <OnlinePageWithMenu>
            <OnlineSettingsPage />
          </OnlinePageWithMenu>
        }
      />
    </Routes>
  );
};

export default OnlineRouterComponent;
