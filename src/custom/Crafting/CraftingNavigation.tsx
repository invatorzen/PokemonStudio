import React from 'react';
import { NavigationDatabaseStyle } from '@components/database/navigation/NavigationDatabase/NavigationDatabaseStyle';
import { NavigationDatabaseGroup } from '@components/database/navigation/NavigationDatabaseGroup';
import { NavigationDatabaseItem } from '@components/database/navigation/NavigationDatabaseItem';
import { useTranslation } from 'react-i18next';

export const CraftingNavigation = () => {
  const { t } = useTranslation();
  return (
    <NavigationDatabaseStyle>
      <NavigationDatabaseGroup title={t('crafting_section_configuration')}>
        <NavigationDatabaseItem path="/crafting/categories" label={t('crafting_categories')} />
        <NavigationDatabaseItem path="/crafting/recipes" label={t('crafting_recipes')} />
      </NavigationDatabaseGroup>
    </NavigationDatabaseStyle>
  );
};
