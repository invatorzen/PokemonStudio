import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';

import { SelectItem } from '@components/selects';
import { StudioDropDown } from '@components/StudioDropDown';
import { DeleteButtonOnlyIcon, SecondaryButtonWithPlusIcon } from '@components/buttons';
import { Input, Label, Toggle } from '@components/inputs';
import { useDialogsRef } from '@hooks/useDialogsRef';

import { Card, Field, HelpText, NumberField } from './craftingUi';
import { ConditionEditor } from './ConditionEditor';
import { RecipeKeyOverwriteKeys, RecipeKeyOverwriteOverlay } from './RecipeKeyOverwriteOverlay';
import { buildLeafNode, defaultLeaf, nextCraftingId, type CategoryDraft, type IngredientRow, type RecipeDraft } from './types';

const IngredientList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

/** Recipe header: the key field grows, the delete icon stays a fixed-size glyph
 *  top-right (using the generic Row here would stretch the delete into a bar). */
const RecipeHeader = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 16px;

  & > .key {
    flex: 1;
    min-width: 0;
  }
  & > .delete {
    flex: 0 0 auto;
    margin-top: 26px;
  }
`;

/** Result / quantity / category row. Widths are capped so the selects don't
 *  stretch across the now-wider single-recipe page, and it wraps when cramped. */
const FieldsRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 16px;

  & > .grow {
    flex: 1 1 260px;
    max-width: 360px;
    min-width: 0;
  }
  & > .qty {
    flex: 0 0 120px;
  }
`;

const IngredientRowStyle = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;

  & > .item {
    flex: 1;
    min-width: 0;
    max-width: 360px;
  }
  & > .qty {
    flex: 0 0 88px;
  }
  & > .delete {
    flex: 0 0 auto;
  }
`;

const SectionTitle = styled.span`
  ${({ theme }) => theme.fonts.titlesOverline};
  color: ${({ theme }) => theme.colors.text400};
  text-transform: uppercase;
`;

const MaxCraftRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const ToggleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

type RecipeCardProps = {
  recipe: RecipeDraft;
  categories: CategoryDraft[];
  /** Keys of the OTHER recipes, for the unlock-condition recipe picker. */
  otherRecipeKeys: string[];
  onChange: (patch: Partial<Omit<RecipeDraft, 'id'>>) => void;
};

export const RecipeCard = ({ recipe, categories, otherRecipeKeys, onChange }: RecipeCardProps) => {
  const { t } = useTranslation();
  const overwriteDialogsRef = useDialogsRef<RecipeKeyOverwriteKeys>();
  // The result the user just picked while a hand-typed key exists — resolved by
  // the overwrite dialog (replace the key) or its cancel (keep the key).
  const [pendingResult, setPendingResult] = useState('');

  // Built inside the component so StudioDropDown's verbatim labels resolve.
  const categoryOptions = useMemo(() => {
    const opts = categories.map((c) => c.key.trim()).filter(Boolean).map((key) => ({ value: key, label: key }));
    return [{ value: '__undef__', label: t('crafting_none') }, ...opts];
  }, [categories, t]);

  // Picking a result auto-names the recipe after it when the key is still empty;
  // if a key was typed, ask before overwriting it.
  const onResultChange = (raw: string) => {
    const result = raw === '__undef__' ? '' : raw;
    const key = recipe.key.trim();
    if (result && !key) {
      onChange({ result, key: result });
    } else if (result && key !== result) {
      // Apply the new result now; the dialog only decides whether the key follows
      // it (confirm) or is kept (cancel just closes).
      onChange({ result });
      setPendingResult(result);
      overwriteDialogsRef.current?.openDialog('overwrite_key', true);
    } else {
      onChange({ result });
    }
  };

  const setIngredient = (id: string, patch: Partial<Omit<IngredientRow, 'id'>>) =>
    onChange({ ingredients: recipe.ingredients.map((ing) => (ing.id === id ? { ...ing, ...patch } : ing)) });
  const addIngredient = () => onChange({ ingredients: [...recipe.ingredients, { id: nextCraftingId('ing'), item: '', qty: 1 }] });
  const deleteIngredient = (id: string) => onChange({ ingredients: recipe.ingredients.filter((ing) => ing.id !== id) });

  // "This recipe starts unlocked" == the root condition is a manual leaf set true.
  // Turning it off seeds a real, editable condition; picking any non-manual kind
  // in the editor below flips it off automatically (the state is derived).
  const root = recipe.condition;
  const startsUnlocked = root.node === 'leaf' && root.leaf.type === 'manual' && !!root.leaf.value;
  const toggleStartsUnlocked = (checked: boolean) =>
    onChange({ condition: checked ? buildLeafNode({ type: 'manual', value: true }) : buildLeafNode(defaultLeaf('switch')) });

  return (
    <Card>
      <RecipeHeader>
        <Field className="key">
          <Label>{t('crafting_recipe_key')}</Label>
          <Input value={recipe.key} placeholder={t('crafting_recipe_key_placeholder')} onChange={(e) => onChange({ key: e.target.value })} />
          <HelpText>{t('crafting_recipe_key_hint')}</HelpText>
        </Field>
        {/* Clears the key back to empty (so it re-derives from the result) — the
            recipe itself is deleted from the selector bar, not from here. */}
        <div className="delete">
          <DeleteButtonOnlyIcon size="s" onClick={() => onChange({ key: '' })} />
        </div>
      </RecipeHeader>

      <FieldsRow>
        <Field className="grow">
          <Label>{t('crafting_recipe_result')}</Label>
          <SelectItem dbSymbol={recipe.result || '__undef__'} undefValueOption={t('crafting_none')} noLabel onChange={onResultChange} />
        </Field>
        <Field className="qty">
          <Label>{t('crafting_recipe_quantity')}</Label>
          <NumberField value={recipe.quantity} min={1} integer onChange={(quantity) => onChange({ quantity })} />
        </Field>
        <Field className="grow">
          <Label>{t('crafting_recipe_category')}</Label>
          <StudioDropDown
            value={recipe.category || '__undef__'}
            options={categoryOptions}
            onChange={(category) => onChange({ category: category === '__undef__' ? '' : category })}
            optionals={{ deletedOption: recipe.category || t('crafting_none'), noOptionLabel: t('crafting_no_category') }}
          />
        </Field>
      </FieldsRow>

      <Field>
        <MaxCraftRow>
          <Label>{t('crafting_recipe_max_craft')}</Label>
          <Toggle checked={recipe.maxCraft !== null} onChange={(e) => onChange({ maxCraft: e.target.checked ? 1 : null })} />
          {recipe.maxCraft !== null && <NumberField value={recipe.maxCraft} min={0} integer narrow onChange={(maxCraft) => onChange({ maxCraft })} />}
        </MaxCraftRow>
        <HelpText>{t('crafting_recipe_max_craft_hint')}</HelpText>
      </Field>

      <Field>
        <SectionTitle>{t('crafting_ingredients')}</SectionTitle>
        <HelpText>{t('crafting_ingredients_hint')}</HelpText>
        <IngredientList>
          {recipe.ingredients.map((ing) => (
            <IngredientRowStyle key={ing.id}>
              <div className="item">
                <SelectItem dbSymbol={ing.item || '__undef__'} undefValueOption={t('crafting_none')} noLabel onChange={(item) => setIngredient(ing.id, { item: item === '__undef__' ? '' : item })} />
              </div>
              <div className="qty">
                <NumberField value={ing.qty} min={1} integer onChange={(qty) => setIngredient(ing.id, { qty })} />
              </div>
              <div className="delete">
                <DeleteButtonOnlyIcon size="s" onClick={() => deleteIngredient(ing.id)} />
              </div>
            </IngredientRowStyle>
          ))}
        </IngredientList>
        <SecondaryButtonWithPlusIcon onClick={addIngredient}>{t('crafting_add_ingredient')}</SecondaryButtonWithPlusIcon>
      </Field>

      <Field>
        <SectionTitle>{t('crafting_unlock_condition')}</SectionTitle>
        <HelpText>{t('crafting_unlock_condition_hint')}</HelpText>
        <ToggleRow>
          <Label>{t('crafting_recipe_starts_unlocked')}</Label>
          <Toggle checked={startsUnlocked} onChange={(e) => toggleStartsUnlocked(e.target.checked)} />
        </ToggleRow>
        <ConditionEditor condition={root} recipeKeys={otherRecipeKeys} onChange={(condition) => onChange({ condition })} />
      </Field>

      <RecipeKeyOverwriteOverlay
        ref={overwriteDialogsRef}
        currentKey={recipe.key.trim()}
        nextKey={pendingResult}
        onConfirm={() => onChange({ result: pendingResult, key: pendingResult })}
      />
    </Card>
  );
};
