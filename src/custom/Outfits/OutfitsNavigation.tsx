import React from 'react';
import { NavigationDatabaseStyle } from '@components/database/navigation/NavigationDatabase/NavigationDatabaseStyle';
import { NavigationDatabaseGroup } from '@components/database/navigation/NavigationDatabaseGroup';
import { NavigationDatabaseItem } from '@components/database/navigation/NavigationDatabaseItem';
import { useTranslation } from 'react-i18next';

export const OutfitsNavigation = () => {
  const { t } = useTranslation();
  return (
    <NavigationDatabaseStyle>
      <NavigationDatabaseGroup title={t('outfits_section_configuration')}>
        <NavigationDatabaseItem path="/outfits/settings" label={t('outfits_settings')} />
        <NavigationDatabaseItem path="/outfits/list" label={t('outfits_list')} />
      </NavigationDatabaseGroup>
    </NavigationDatabaseStyle>
  );
};
