import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';

import { useProjectQuests } from '@hooks/useProjectData';
import { SelectItem, SelectAbility, SelectMove, SelectQuest } from '@components/selects';
import { SelectPokemon } from '@components/selects/SelectPokemon';
import { StudioDropDown } from '@components/StudioDropDown';
import { DeleteButtonOnlyIcon } from '@components/buttons';
import { Label, Toggle } from '@components/inputs';
import PlusIcon from '@assets/icons/global/plus-icon.svg';

import { HelpText, NumberField, SmallAddButton } from './craftingUi';
import { SelectSwitchVariable } from './SelectSwitchVariable';
import {
  buildGroupNode,
  buildLeafNode,
  defaultLeaf,
  type CraftLeafType,
  type CraftOperator,
  type CraftPokemonLeaf,
  type DraftConditionNode,
} from './types';

/**
 * The recursive unlock-condition editor.
 *
 * A node is either a LEAF (a concrete test) or a GROUP (`and`/`or`/`not` over
 * nested nodes, to any depth). A single "kind" dropdown at the top of every node
 * switches it between the leaf types and the three group operators — so any node
 * can become a group and any group can hold further groups. Groups expose
 * "Add condition" / "Add group" buttons; every non-root node can be deleted.
 *
 * `onChange` replaces this node inside its parent; `onDelete` (absent on the root)
 * removes it. Options are built inside the component so StudioDropDown's verbatim
 * labels resolve through t().
 */

const NodeCard = styled.div<{ $group: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.colors.dark20};
  background-color: ${({ theme, $group }) => ($group ? theme.colors.dark12 : theme.colors.dark15)};
`;

const NodeHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;

  & > div:first-child {
    flex: 1;
    min-width: 0;
  }
`;

const Children = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-left: 16px;
  border-left: 2px solid ${({ theme }) => theme.colors.dark20};
`;

const ButtonRow = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`;

const FieldRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const OptionalGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
`;

const OptionalField = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;

  & .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
`;

const GROUP_OPERATORS: CraftOperator[] = ['and', 'or', 'not'];

/** Map a quest's numeric id to its db_symbol for SelectQuest, and back on change. */
const QuestIdSelect = ({ id, onChange }: { id: number; onChange: (id: number) => void }) => {
  const { t } = useTranslation();
  const { projectDataValues: quests } = useProjectQuests();
  const dbSymbol = useMemo(() => Object.keys(quests).find((symbol) => quests[symbol].id === id) ?? '__undef__', [quests, id]);
  return (
    <SelectQuest
      dbSymbol={dbSymbol}
      undefValueOption={t('crafting_none')}
      noLabel
      onChange={(symbol) => onChange(symbol === '__undef__' ? 0 : quests[symbol]?.id ?? 0)}
    />
  );
};

/** The editable fields for a `pokemon` leaf, including its omit-when-unset optionals. */
const PokemonLeafFields = ({ leaf, onChange }: { leaf: CraftPokemonLeaf; onChange: (leaf: CraftPokemonLeaf) => void }) => {
  const { t } = useTranslation();

  const toggle = <K extends keyof CraftPokemonLeaf>(key: K, enabled: boolean, defaultValue: CraftPokemonLeaf[K]) => {
    const next: CraftPokemonLeaf = { ...leaf };
    if (enabled) next[key] = defaultValue;
    else delete next[key];
    onChange(next);
  };
  const set = <K extends keyof CraftPokemonLeaf>(key: K, value: CraftPokemonLeaf[K]) => onChange({ ...leaf, [key]: value });

  return (
    <FieldRow>
      <FieldRow>
        <Label>{t('crafting_cond_pokemon_species')}</Label>
        <SelectPokemon dbSymbol={leaf.db_symbol || '__undef__'} undefValueOption={t('crafting_none')} noLabel onChange={(v) => set('db_symbol', v === '__undef__' ? '' : v)} />
      </FieldRow>
      <HelpText>{t('crafting_cond_pokemon_hint')}</HelpText>
      <OptionalGrid>
        <OptionalField>
          <div className="head">
            <Label>{t('crafting_cond_min_level')}</Label>
            <Toggle checked={leaf.min_level !== undefined} onChange={(e) => toggle('min_level', e.target.checked, 1)} />
          </div>
          {leaf.min_level !== undefined && <NumberField value={leaf.min_level} min={1} max={100} integer narrow onChange={(v) => set('min_level', v)} />}
        </OptionalField>

        <OptionalField>
          <div className="head">
            <Label>{t('crafting_cond_min_loyalty')}</Label>
            <Toggle checked={leaf.min_loyalty !== undefined} onChange={(e) => toggle('min_loyalty', e.target.checked, 0)} />
          </div>
          {leaf.min_loyalty !== undefined && <NumberField value={leaf.min_loyalty} min={0} max={255} integer narrow onChange={(v) => set('min_loyalty', v)} />}
        </OptionalField>

        <OptionalField>
          <div className="head">
            <Label>{t('crafting_cond_move')}</Label>
            <Toggle checked={leaf.move !== undefined} onChange={(e) => toggle('move', e.target.checked, '')} />
          </div>
          {leaf.move !== undefined && <SelectMove dbSymbol={leaf.move || '__undef__'} undefValueOption={t('crafting_none')} noLabel onChange={(v) => set('move', v === '__undef__' ? '' : v)} />}
        </OptionalField>

        <OptionalField>
          <div className="head">
            <Label>{t('crafting_cond_ability')}</Label>
            <Toggle checked={leaf.ability !== undefined} onChange={(e) => toggle('ability', e.target.checked, '')} />
          </div>
          {leaf.ability !== undefined && (
            <SelectAbility dbSymbol={leaf.ability || '__undef__'} undefValueOption={t('crafting_none')} noLabel onChange={(v) => set('ability', v === '__undef__' ? '' : v)} />
          )}
        </OptionalField>

        <OptionalField>
          <div className="head">
            <Label>{t('crafting_cond_holding_item')}</Label>
            <Toggle checked={leaf.holding_item !== undefined} onChange={(e) => toggle('holding_item', e.target.checked, '')} />
          </div>
          {leaf.holding_item !== undefined && (
            <SelectItem dbSymbol={leaf.holding_item || '__undef__'} undefValueOption={t('crafting_none')} noLabel onChange={(v) => set('holding_item', v === '__undef__' ? '' : v)} />
          )}
        </OptionalField>

        <OptionalField>
          <div className="head">
            <Label>{t('crafting_cond_gender')}</Label>
            <Toggle checked={leaf.gender !== undefined} onChange={(e) => toggle('gender', e.target.checked, 0)} />
          </div>
          {leaf.gender !== undefined && (
            <>
              <NumberField value={leaf.gender} min={0} max={2} integer narrow onChange={(v) => set('gender', v)} />
              <HelpText>{t('crafting_cond_gender_hint')}</HelpText>
            </>
          )}
        </OptionalField>

        <OptionalField>
          <div className="head">
            <Label>{t('crafting_cond_form')}</Label>
            <Toggle checked={leaf.form !== undefined} onChange={(e) => toggle('form', e.target.checked, 0)} />
          </div>
          {leaf.form !== undefined && <NumberField value={leaf.form} min={0} integer narrow onChange={(v) => set('form', v)} />}
        </OptionalField>

        <OptionalField>
          <div className="head">
            <Label>{t('crafting_cond_shiny')}</Label>
            <Toggle checked={leaf.shiny !== undefined} onChange={(e) => toggle('shiny', e.target.checked, true)} />
          </div>
          {leaf.shiny !== undefined && (
            <div className="head">
              <HelpText>{t('crafting_cond_shiny_required')}</HelpText>
              <Toggle checked={!!leaf.shiny} onChange={(e) => set('shiny', e.target.checked)} />
            </div>
          )}
        </OptionalField>
      </OptionalGrid>
    </FieldRow>
  );
};

/** The editable fields for a leaf node, dispatched on its type. */
const LeafFields = ({
  node,
  onChange,
  recipeKeys,
  isRoot,
}: {
  node: Extract<DraftConditionNode, { node: 'leaf' }>;
  onChange: (node: DraftConditionNode) => void;
  recipeKeys: string[];
  isRoot?: boolean;
}) => {
  const { t } = useTranslation();
  const { leaf } = node;
  const update = (nextLeaf: typeof leaf) => onChange({ ...node, leaf: nextLeaf });

  const recipeOptions = useMemo(() => {
    const opts = recipeKeys.filter(Boolean).map((key) => ({ value: key, label: key }));
    return [{ value: '__undef__', label: t('crafting_none') }, ...opts];
  }, [recipeKeys, t]);

  switch (leaf.type) {
    case 'manual':
      // At the root, the recipe's "This recipe starts unlocked" toggle owns the
      // manual value, so we don't repeat a toggle here — only the kind dropdown
      // in the header (which lets the user pick a real condition instead).
      if (isRoot) return null;
      return (
        <div className="head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <HelpText>{t('crafting_cond_manual_hint')}</HelpText>
          <Toggle checked={leaf.value} onChange={(e) => update({ type: 'manual', value: e.target.checked })} />
        </div>
      );
    case 'switch':
      return (
        <FieldRow>
          <Label>{t('crafting_cond_switch')}</Label>
          <SelectSwitchVariable kind="switch" value={leaf.id} onChange={(id) => update({ type: 'switch', id })} />
        </FieldRow>
      );
    case 'variable':
      return (
        <FieldRow>
          <Label>{t('crafting_cond_variable')}</Label>
          <SelectSwitchVariable kind="variable" value={leaf.id} onChange={(id) => update({ ...leaf, id })} />
          <Label>{t('crafting_cond_variable_value')}</Label>
          <NumberField value={leaf.value} integer narrow onChange={(value) => update({ ...leaf, value })} />
          <HelpText>{t('crafting_cond_variable_hint')}</HelpText>
        </FieldRow>
      );
    case 'quest':
      return (
        <FieldRow>
          <Label>{t('crafting_cond_quest')}</Label>
          <QuestIdSelect id={leaf.id} onChange={(id) => update({ type: 'quest', id })} />
        </FieldRow>
      );
    case 'recipe':
      return (
        <FieldRow>
          <Label>{t('crafting_cond_recipe')}</Label>
          <StudioDropDown
            value={leaf.key || '__undef__'}
            options={recipeOptions}
            onChange={(key) => update({ type: 'recipe', key: key === '__undef__' ? '' : key })}
            optionals={{ deletedOption: leaf.key || t('crafting_none'), noOptionLabel: t('crafting_no_recipe') }}
          />
          <HelpText>{t('crafting_cond_recipe_hint')}</HelpText>
        </FieldRow>
      );
    case 'item':
      return (
        <FieldRow>
          <Label>{t('crafting_cond_item')}</Label>
          <SelectItem dbSymbol={leaf.item || '__undef__'} undefValueOption={t('crafting_none')} noLabel onChange={(item) => update({ ...leaf, item: item === '__undef__' ? '' : item })} />
          <Label>{t('crafting_cond_item_quantity')}</Label>
          <NumberField value={leaf.quantity} min={1} integer narrow onChange={(quantity) => update({ ...leaf, quantity })} />
        </FieldRow>
      );
    case 'pokemon':
      return <PokemonLeafFields leaf={leaf} onChange={(nextLeaf) => update(nextLeaf)} />;
  }
};

type ConditionNodeProps = {
  node: DraftConditionNode;
  onChange: (node: DraftConditionNode) => void;
  onDelete?: () => void;
  recipeKeys: string[];
  /** The tree root — hides the manual leaf's own toggle (the recipe owns it). */
  isRoot?: boolean;
};

const ConditionNode = ({ node, onChange, onDelete, recipeKeys, isRoot }: ConditionNodeProps) => {
  const { t } = useTranslation();

  // Groups and leaf types share one namespace (no overlap), so a single dropdown
  // can switch a node between any of them.
  const kindOptions = useMemo(
    () => [
      { value: 'and', label: t('crafting_op_and') },
      { value: 'or', label: t('crafting_op_or') },
      { value: 'not', label: t('crafting_op_not') },
      { value: 'manual', label: t('crafting_leaf_manual') },
      { value: 'switch', label: t('crafting_leaf_switch') },
      { value: 'variable', label: t('crafting_leaf_variable') },
      { value: 'quest', label: t('crafting_leaf_quest') },
      { value: 'recipe', label: t('crafting_leaf_recipe') },
      { value: 'item', label: t('crafting_leaf_item') },
      { value: 'pokemon', label: t('crafting_leaf_pokemon') },
    ],
    [t]
  );

  const currentKind = node.node === 'group' ? node.operator : node.leaf.type;

  const changeKind = (value: string) => {
    if ((GROUP_OPERATORS as string[]).includes(value)) {
      const operator = value as CraftOperator;
      if (node.node === 'group') onChange({ ...node, operator });
      // Leaf → group: keep the stable key, start with an empty child list.
      else onChange({ _id: node._id, node: 'group', operator, conditions: [] });
      return;
    }
    const type = value as CraftLeafType;
    if (node.node === 'leaf' && node.leaf.type === type) return;
    // Group → leaf (or leaf type change): keep the stable key.
    onChange({ _id: node._id, node: 'leaf', leaf: defaultLeaf(type) });
  };

  const isGroup = node.node === 'group';

  const changeChild = (index: number, next: DraftConditionNode) => {
    if (!isGroup) return;
    const conditions = node.conditions.slice();
    conditions[index] = next;
    onChange({ ...node, conditions });
  };
  const deleteChild = (index: number) => {
    if (!isGroup) return;
    onChange({ ...node, conditions: node.conditions.filter((_, i) => i !== index) });
  };
  const addLeaf = () => {
    if (!isGroup) return;
    onChange({ ...node, conditions: [...node.conditions, buildLeafNode({ type: 'manual', value: true })] });
  };
  const addGroup = () => {
    if (!isGroup) return;
    onChange({ ...node, conditions: [...node.conditions, buildGroupNode('and', [])] });
  };

  return (
    <NodeCard $group={isGroup}>
      <NodeHeader>
        <div>
          <StudioDropDown value={currentKind} options={kindOptions} onChange={changeKind} />
        </div>
        {onDelete && <DeleteButtonOnlyIcon onClick={onDelete} />}
      </NodeHeader>

      {node.node === 'leaf' ? (
        <LeafFields node={node} onChange={onChange} recipeKeys={recipeKeys} isRoot={isRoot} />
      ) : (
        <>
          {node.operator === 'not' && <HelpText>{t('crafting_op_not_hint')}</HelpText>}
          {node.conditions.length > 0 && (
            <Children>
              {node.conditions.map((child, index) => (
                <ConditionNode key={child._id} node={child} recipeKeys={recipeKeys} onChange={(next) => changeChild(index, next)} onDelete={() => deleteChild(index)} />
              ))}
            </Children>
          )}
          <ButtonRow>
            <SmallAddButton type="button" onClick={addLeaf}>
              <PlusIcon />
              {t('crafting_add_condition')}
            </SmallAddButton>
            <SmallAddButton type="button" onClick={addGroup}>
              <PlusIcon />
              {t('crafting_add_group')}
            </SmallAddButton>
          </ButtonRow>
        </>
      )}
    </NodeCard>
  );
};

type ConditionEditorProps = {
  condition: DraftConditionNode;
  onChange: (condition: DraftConditionNode) => void;
  /** Other recipe keys, offered by the `recipe` leaf's dropdown. */
  recipeKeys: string[];
};

/** The root of the recursive condition tree — no delete affordance on the root. */
export const ConditionEditor = ({ condition, onChange, recipeKeys }: ConditionEditorProps) => (
  <ConditionNode node={condition} onChange={onChange} recipeKeys={recipeKeys} isRoot />
);
