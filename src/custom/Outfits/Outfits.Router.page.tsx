import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { PageWithMenu, PageWithMenuProps } from '@components/pages';
import { OutfitsNavigation } from './OutfitsNavigation';
import { OutfitsPage } from './Outfits.page';
import { OutfitsSettingsPage } from './Outfits.Settings.page';

const OutfitsPageWithMenu = ({ children }: Omit<PageWithMenuProps, 'navigation'>) => (
  <PageWithMenu navigation={<OutfitsNavigation />}>{children}</PageWithMenu>
);

const OutfitsRouterComponent = () => {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="settings" />} />
      <Route
        path="settings"
        element={
          <OutfitsPageWithMenu>
            <OutfitsSettingsPage />
          </OutfitsPageWithMenu>
        }
      />
      <Route
        path="list"
        element={
          <OutfitsPageWithMenu>
            <OutfitsPage />
          </OutfitsPageWithMenu>
        }
      />
      {/* Back-compat: the section used to be a single /outfits/config page. */}
      <Route path="config" element={<Navigate to="/outfits/settings" replace />} />
    </Routes>
  );
};

export default OutfitsRouterComponent;
