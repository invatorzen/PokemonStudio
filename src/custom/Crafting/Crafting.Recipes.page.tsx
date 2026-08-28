import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';

import { PageEditor, PageTemplate } from '@components/pages';
import { DeleteButtonOnlyIcon, SecondaryButtonWithPlusIcon } from '@components/buttons';
import { StudioDropDown } from '@components/StudioDropDown';
import { useProjectItems } from '@hooks/useProjectData';
import { useGetEntityNameText } from '@utils/ReadingProjectText';

import { useCraftingConfig } from './craftingConfigStore';
import { EmptyState, HelpText } from './craftingUi';
import { RecipeCard } from './RecipeCard';

/** Selector bar: New button on the left, the recipe picker stretching across the
 *  free space beside it, and the delete-recipe trashcan pinned to the right. */
const SelectorBar = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  box-sizing: border-box;
  height: 64px;
  padding: 12px;
  margin-left: 2px;
  background-color: ${({ theme }) => theme.colors.dark16};
  border-radius: 2px;

  & > .picker {
    flex: 1;
    min-width: 240px;
  }
  & > .picker > div {
    width: 100%;
  }
`;

/**
 * Recipes are edited one at a time — like Studio's database pages — with a
 * top selector to switch between them and a "New" button. Keeps a long recipe
 * list scannable and each recipe's editor uncluttered. Which recipe is shown is
 * purely local UI state; the recipes themselves live in the shared config store.
 */
export const CraftingRecipesPage = () => {
  const { t } = useTranslation();
  const { projectPath, status, error, draft, addRecipe, updateRecipe, deleteRecipe } = useCraftingConfig();
  const { projectDataValues: items } = useProjectItems();
  const getEntityName = useGetEntityNameText();
  const recipes = draft.recipes;
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Derive the shown recipe instead of syncing it in an effect: a stale/absent
  // selection (nothing picked yet, or the picked recipe was deleted) falls back
  // to the first recipe, so the view is always valid without cascading renders.
  const selected = recipes.find((r) => r.id === selectedId) ?? recipes[0] ?? null;
  // Label each recipe by its result item's display name (falling back to the raw
  // key, then "untitled") — friendlier than the snake_case symbol.
  const recipeOptions = useMemo(
    () =>
      recipes.map((r) => {
        const item = r.result ? items[r.result] : undefined;
        return { value: r.id, label: item ? getEntityName(item) : r.key.trim() || t('crafting_recipe_untitled') };
      }),
    [recipes, items, getEntityName, t]
  );

  return (
    <PageTemplate title={t('crafting_recipes')} size="default">
      {!projectPath && <EmptyState>{t('crafting_no_project')}</EmptyState>}
      {status === 'loading' && <EmptyState>{t('crafting_loading')}</EmptyState>}
      {status === 'error' && <EmptyState>{t('crafting_load_error', { error: error ?? '' })}</EmptyState>}

      {status === 'ready' && (
        <>
          <SelectorBar>
            <SecondaryButtonWithPlusIcon onClick={() => setSelectedId(addRecipe())}>{t('crafting_add_recipe')}</SecondaryButtonWithPlusIcon>
            {recipes.length > 0 && (
              <div className="picker">
                <StudioDropDown
                  value={selected?.id ?? ''}
                  options={recipeOptions}
                  onChange={(id) => setSelectedId(id)}
                  optionals={{ deletedOption: t('crafting_recipe_untitled'), noOptionLabel: t('crafting_recipes_empty') }}
                />
              </div>
            )}
            {selected && <DeleteButtonOnlyIcon onClick={() => deleteRecipe(selected.id)} />}
          </SelectorBar>

          <PageEditor title={t('crafting_recipes')} editorTitle={t('crafting_config')}>
            <HelpText>{t('crafting_recipes_hint')}</HelpText>
            {selected ? (
              <RecipeCard
                key={selected.id}
                recipe={selected}
                categories={draft.categories}
                otherRecipeKeys={recipes.filter((r) => r.id !== selected.id).map((r) => r.key).filter(Boolean)}
                onChange={(patch) => updateRecipe(selected.id, patch)}
              />
            ) : (
              <EmptyState>{t('crafting_recipes_empty')}</EmptyState>
            )}
          </PageEditor>
        </>
      )}
    </PageTemplate>
  );
};
