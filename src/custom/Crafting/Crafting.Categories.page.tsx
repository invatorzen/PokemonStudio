import React from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';

import { PageEditor, PageTemplate } from '@components/pages';
import { SecondaryButtonWithPlusIcon, DeleteButtonOnlyIcon } from '@components/buttons';
import { Input, Label } from '@components/inputs';

import { useCraftingConfig } from './craftingConfigStore';
import { Card, EmptyState, Field, HelpText, NumberField } from './craftingUi';

const CategoryList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const CategoryRow = styled(Card)`
  flex-direction: row;
  align-items: flex-end;
  gap: 12px;

  & > .key {
    flex: 1;
    min-width: 0;
  }
  & > .icon {
    width: 140px;
  }
`;

const ReorderColumn = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;

  & button {
    width: 28px;
    height: 20px;
    padding: 0;
    border: 1px solid ${({ theme }) => theme.colors.dark20};
    border-radius: 4px;
    background-color: ${({ theme }) => theme.colors.dark18};
    color: ${({ theme }) => theme.colors.text400};
    cursor: pointer;

    &:disabled {
      opacity: 0.4;
      cursor: default;
    }
    &:not(:disabled):hover {
      color: ${({ theme }) => theme.colors.text100};
    }
  }
`;

const AddBar = styled.div`
  display: flex;
`;

export const CraftingCategoriesPage = () => {
  const { t } = useTranslation();
  const { projectPath, status, error, draft, addCategory, updateCategory, deleteCategory, moveCategory } = useCraftingConfig();

  return (
    <PageTemplate title={t('crafting_categories')} size="default">
      {!projectPath && <EmptyState>{t('crafting_no_project')}</EmptyState>}
      {status === 'loading' && <EmptyState>{t('crafting_loading')}</EmptyState>}
      {status === 'error' && <EmptyState>{t('crafting_load_error', { error: error ?? '' })}</EmptyState>}

      {status === 'ready' && (
        <PageEditor title={t('crafting_categories')} editorTitle={t('crafting_config')}>
          <HelpText>{t('crafting_categories_hint')}</HelpText>
          {draft.categories.length === 0 ? (
            <EmptyState>{t('crafting_categories_empty')}</EmptyState>
          ) : (
            <CategoryList>
              {draft.categories.map((row, index) => (
                <CategoryRow key={row.id}>
                  <div className="key">
                    <Field>
                      <Label>{t('crafting_category_key')}</Label>
                      <Input value={row.key} placeholder={t('crafting_category_key_placeholder')} onChange={(e) => updateCategory(row.id, { key: e.target.value })} />
                    </Field>
                  </div>
                  <div className="icon">
                    <Field>
                      <Label>{t('crafting_category_icon')}</Label>
                      <NumberField value={row.icon} min={0} integer onChange={(icon) => updateCategory(row.id, { icon })} />
                    </Field>
                  </div>
                  <ReorderColumn>
                    <button type="button" aria-label={t('crafting_move_up')} disabled={index === 0} onClick={() => moveCategory(row.id, -1)}>
                      ▲
                    </button>
                    <button type="button" aria-label={t('crafting_move_down')} disabled={index === draft.categories.length - 1} onClick={() => moveCategory(row.id, 1)}>
                      ▼
                    </button>
                  </ReorderColumn>
                  <DeleteButtonOnlyIcon onClick={() => deleteCategory(row.id)} />
                </CategoryRow>
              ))}
            </CategoryList>
          )}
          <AddBar>
            <SecondaryButtonWithPlusIcon onClick={addCategory}>{t('crafting_add_category')}</SecondaryButtonWithPlusIcon>
          </AddBar>
        </PageEditor>
      )}
    </PageTemplate>
  );
};
