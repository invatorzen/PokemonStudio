import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { PageWithMenu, PageWithMenuProps } from '@components/pages';
import { CraftingNavigation } from './CraftingNavigation';
import { CraftingCategoriesPage } from './Crafting.Categories.page';
import { CraftingRecipesPage } from './Crafting.Recipes.page';

const CraftingPageWithMenu = ({ children }: Omit<PageWithMenuProps, 'navigation'>) => (
  <PageWithMenu navigation={<CraftingNavigation />}>{children}</PageWithMenu>
);

const CraftingRouterComponent = () => {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="categories" />} />
      <Route
        path="categories"
        element={
          <CraftingPageWithMenu>
            <CraftingCategoriesPage />
          </CraftingPageWithMenu>
        }
      />
      <Route
        path="recipes"
        element={
          <CraftingPageWithMenu>
            <CraftingRecipesPage />
          </CraftingPageWithMenu>
        }
      />
    </Routes>
  );
};

export default CraftingRouterComponent;
