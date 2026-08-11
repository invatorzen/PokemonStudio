import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';

import { AutoSizer, List } from 'react-virtualized';
import { Input } from '@components/inputs';
import { SecondaryButtonWithPlusIcon, DeleteButtonOnlyIcon } from '@components/buttons';
import { themedScrollbars } from '@src/custom/MapEditor/scrollbars';
import type { RegistryEntry } from '@src/backendTasks/readUmbraSwitchRegistry';

type SortMode = 'id' | 'alpha' | 'used';

/** Fixed row height keeps virtualization simple and reorder-safe under sorting. */
const ROW_HEIGHT = 46;

import { useSwitchesVariables } from './switchesVariablesStore';

const Page = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  flex: 1;
  min-width: 0;
  height: 100%;
  overflow: hidden;
  box-sizing: border-box;
  ${themedScrollbars}
`;

const Title = styled.h1`
  ${({ theme }) => theme.fonts.titlesHeadline6};
  color: ${({ theme }) => theme.colors.text100};
  margin: 0;
`;

const Intro = styled.p`
  ${({ theme }) => theme.fonts.normalSmall};
  color: ${({ theme }) => theme.colors.text400};
  margin: -8px 0 0;
`;

const Columns = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  flex: 1;
  min-height: 0;
`;

const Column = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 0;
  border: 1px solid ${({ theme }) => theme.colors.dark20};
  border-radius: 12px;
  background-color: ${({ theme }) => theme.colors.dark14};
`;

const ColHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.dark20};

  & h2 {
    ${({ theme }) => theme.fonts.normalMedium};
    color: ${({ theme }) => theme.colors.text100};
    margin: 0;
  }
  & .count {
    ${({ theme }) => theme.fonts.normalSmall};
    color: ${({ theme }) => theme.colors.text400};
  }
`;

const SearchRow = styled.div`
  padding: 10px 14px;
  & input {
    width: 100%;
  }
`;

// Host for the virtualized List (react-virtualized measures this box).
const ListArea = styled.div`
  flex: 1;
  min-height: 0;
  padding: 0 8px 8px;
`;

const RowLine = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 6px;
  box-sizing: border-box;
`;

// The trashcan only shows while hovering the row, like Studio's list rows.
const TrashCell = styled.div`
  flex: none;
  width: 24px;
  opacity: 0;
  transition: opacity 100ms ease;

  ${RowLine}:hover & {
    opacity: 1;
  }
`;

const Toolbar = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;

  & > span {
    ${({ theme }) => theme.fonts.normalMedium};
    color: ${({ theme }) => theme.colors.text100};
  }
`;

const SortSelect = styled.select`
  ${({ theme }) => theme.fonts.normalMedium};
  color: ${({ theme }) => theme.colors.text100};
  background-color: ${({ theme }) => theme.colors.dark18};
  border: 1px solid ${({ theme }) => theme.colors.dark24};
  border-radius: 8px;
  padding: 6px 10px;
`;

const IdCell = styled.span`
  ${({ theme }) => theme.fonts.codeRegular};
  color: ${({ theme }) => theme.colors.text400};
  width: 44px;
  flex: none;
  text-align: right;
`;

const NameCell = styled.div`
  flex: 1;
  min-width: 0;

  & input {
    width: 100%;
  }
`;

// Inline hint (only present on registry-referenced ids); truncates so rows stay
// one fixed-height line for the virtualized list.
const Annotation = styled.span`
  ${({ theme }) => theme.fonts.normalSmall};
  color: ${({ theme }) => theme.colors.primaryBase};
  flex: 0 1 auto;
  min-width: 0;
  max-width: 45%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

/** One id row, memoized so a keystroke only re-renders the row being edited. */
const Row = React.memo(
  ({
    id,
    name,
    annotation,
    placeholder,
    deleteTitle,
    onChange,
    onDelete,
    style,
  }: {
    id: number;
    name: string;
    annotation?: RegistryEntry;
    placeholder: string;
    deleteTitle: string;
    onChange: (id: number, name: string) => void;
    onDelete: (id: number) => void;
    style: React.CSSProperties;
  }) => {
    const annotationText = annotation ? `Umbra::${annotation.constName}${annotation.comment ? ` — ${annotation.comment}` : ''}` : '';
    return (
      <RowLine style={style}>
        <IdCell>{id}</IdCell>
        <NameCell>
          <Input type="text" value={name} placeholder={placeholder} onChange={(e) => onChange(id, e.target.value)} />
        </NameCell>
        {annotation && <Annotation title={annotationText}>{annotationText}</Annotation>}
        <TrashCell title={deleteTitle}>
          <DeleteButtonOnlyIcon size="s" onClick={() => onDelete(id)} />
        </TrashCell>
      </RowLine>
    );
  }
);
Row.displayName = 'SwitchVarRow';

type ColumnKind = 'switches' | 'variables';

const NameColumn = ({
  kind,
  names,
  registry,
  sort,
  onChange,
  onAdd,
  onDelete,
}: {
  kind: ColumnKind;
  names: string[];
  registry: Record<number, RegistryEntry>;
  sort: SortMode;
  onChange: (id: number, name: string) => void;
  onAdd: () => void;
  onDelete: (id: number) => void;
}) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');

  // An id counts as "used" when it has a name or is referenced by the registry.
  const isUsed = (id: number, name: string) => (!!name && name !== '') || !!registry[id];

  // id 0 is RMXP's unused slot — never listed.
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let all = names.map((name, id) => ({ id, name })).slice(1);
    if (q) all = all.filter(({ id, name }) => String(id) === q || name.toLowerCase().includes(q) || registry[id]?.constName.toLowerCase().includes(q));
    if (sort === 'alpha') {
      // Unnamed entries sort last; ties break by id.
      all = all.slice().sort((a, b) => (a.name || '￿').toLowerCase().localeCompare((b.name || '￿').toLowerCase()) || a.id - b.id);
    } else if (sort === 'used') {
      all = all.slice().sort((a, b) => Number(isUsed(b.id, b.name)) - Number(isUsed(a.id, a.name)) || a.id - b.id);
    }
    // 'id' keeps the natural index order.
    return all;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [names, query, registry, sort]);

  const named = names.slice(1).filter((n) => n && n !== '').length;
  // Hoisted so each Row gets the same string identity (keeps React.memo happy).
  const unnamed = t('sv_unnamed');
  const deleteTitle = t('sv_delete');

  return (
    <Column>
      <ColHeader>
        <h2>{t(kind === 'switches' ? 'sv_switches' : 'sv_variables')}</h2>
        <span className="count">{t('sv_count', { named, total: Math.max(0, names.length - 1) })}</span>
        <SecondaryButtonWithPlusIcon onClick={onAdd}>{t('sv_add')}</SecondaryButtonWithPlusIcon>
      </ColHeader>
      <SearchRow>
        <Input type="text" value={query} placeholder={t('sv_search')} onChange={(e) => setQuery(e.target.value)} />
      </SearchRow>
      <ListArea>
        <AutoSizer>
          {({ width, height }) => (
            <List
              width={width}
              height={height}
              rowCount={rows.length}
              rowHeight={ROW_HEIGHT}
              overscanRowCount={6}
              noRowsRenderer={() => <></>}
              rowRenderer={({ key, index, style }: { key: string; index: number; style: React.CSSProperties }) => {
                const row = rows[index];
                return (
                  <Row
                    key={key}
                    style={style}
                    id={row.id}
                    name={row.name}
                    annotation={registry[row.id]}
                    placeholder={unnamed}
                    deleteTitle={deleteTitle}
                    onChange={onChange}
                    onDelete={onDelete}
                  />
                );
              }}
            />
          )}
        </AutoSizer>
      </ListArea>
    </Column>
  );
};

/**
 * The Database "Switches & Variables" manager. Edits the name arrays from
 * Data/System.rxdata (index = id), which the event editor's switch/variable
 * pickers read. Ids that your Ruby `Umbra::Sw`/`Var` registry references are
 * annotated read-only so code-referenced ids are obvious. Edits park for the
 * bottom-left "Save data" button.
 */
export const SwitchesVariablesPage = () => {
  const { t } = useTranslation();
  const { status, switches, variables, registry, error, setName, addEntry } = useSwitchesVariables();
  const [sort, setSort] = useState<SortMode>('id');

  // Stable per-column callbacks (setName/addEntry are module-level singletons),
  // so the memoized Rows only re-render the one being edited, not all ~1100.
  const onSwitchChange = useCallback((id: number, name: string) => setName('switches', id, name), [setName]);
  const onVariableChange = useCallback((id: number, name: string) => setName('variables', id, name), [setName]);
  const onSwitchDelete = useCallback((id: number) => setName('switches', id, ''), [setName]);
  const onVariableDelete = useCallback((id: number) => setName('variables', id, ''), [setName]);
  const onSwitchAdd = useCallback(() => addEntry('switches'), [addEntry]);
  const onVariableAdd = useCallback(() => addEntry('variables'), [addEntry]);

  if (status === 'loading' || status === 'idle') return <Page><Title>{t('sv_title')}</Title><Intro>{t('sv_loading')}</Intro></Page>;
  if (status === 'error') return <Page><Title>{t('sv_title')}</Title><Intro>{error}</Intro></Page>;

  return (
    <Page>
      <Title>{t('sv_title')}</Title>
      <Intro>{t('sv_intro')}</Intro>
      <Toolbar>
        <span>{t('sv_sort')}</span>
        <SortSelect value={sort} onChange={(e) => setSort(e.target.value as SortMode)}>
          <option value="id">{t('sv_sort_id')}</option>
          <option value="alpha">{t('sv_sort_alpha')}</option>
          <option value="used">{t('sv_sort_used')}</option>
        </SortSelect>
      </Toolbar>
      <Columns>
        <NameColumn kind="switches" names={switches} registry={registry.switches} sort={sort} onChange={onSwitchChange} onAdd={onSwitchAdd} onDelete={onSwitchDelete} />
        <NameColumn kind="variables" names={variables} registry={registry.variables} sort={sort} onChange={onVariableChange} onAdd={onVariableAdd} onDelete={onVariableDelete} />
      </Columns>
    </Page>
  );
};
