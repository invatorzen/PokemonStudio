import React from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';

import { DeleteButtonOnlyIcon } from '@components/buttons';
import { SelectItem } from '@components/selects/SelectItem';
import { ResourceImage } from '@components/ResourceImage';
import { useProjectItems } from '@hooks/useProjectData';
import { itemIconPath } from '@utils/path';
import PlusIcon from '@assets/icons/global/plus-icon.svg';
import { GrottoWeightInput } from './GrottoWeightInput';
import type { GrottoWeightedItem } from './types';

const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: 40px 1fr 96px 120px 32px;
  gap: 12px;
  align-items: center;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid ${({ theme }) => theme.colors.dark20};
  background-color: ${({ theme }) => theme.colors.dark14};
  transition: border-color 120ms ease, background-color 120ms ease;

  &:hover {
    border-color: ${({ theme }) => theme.colors.dark24};
    background-color: ${({ theme }) => theme.colors.dark16};
  }
`;

const IconCell = styled.div`
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;

  & img {
    width: 32px;
    height: 32px;
    image-rendering: pixelated;
    object-fit: contain;
  }
`;

const IconPlaceholder = styled.div`
  width: 18px;
  height: 18px;
  border-radius: 4px;
  border: 1px dashed ${({ theme }) => theme.colors.dark24};
`;

const Share = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const ShareBar = styled.div`
  height: 6px;
  border-radius: 999px;
  background-color: ${({ theme }) => theme.colors.dark20};
  overflow: hidden;
`;

const ShareFill = styled.div<{ $pct: number }>`
  height: 100%;
  width: ${({ $pct }) => Math.max(0, Math.min(100, $pct))}%;
  border-radius: 999px;
  background-color: ${({ theme }) => theme.colors.primaryBase};
  transition: width 160ms ease;
`;

const ShareLabel = styled.span`
  ${({ theme }) => theme.fonts.normalSmall};
  color: ${({ theme }) => theme.colors.text400};
`;

const EmptyState = styled.span`
  ${({ theme }) => theme.fonts.normalMedium};
  color: ${({ theme }) => theme.colors.text400};
`;

const AddButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 10px;
  border-radius: 10px;
  border: 1px dashed ${({ theme }) => theme.colors.dark24};
  background-color: transparent;
  color: ${({ theme }) => theme.colors.text400};
  ${({ theme }) => theme.fonts.normalMedium};
  cursor: pointer;
  transition: border-color 120ms ease, color 120ms ease, background-color 120ms ease;

  & svg {
    width: 12px;
    height: 12px;
  }
  & svg path {
    fill: currentColor;
  }

  &:hover {
    border-color: ${({ theme }) => theme.colors.primaryBase};
    color: ${({ theme }) => theme.colors.primaryBase};
    background-color: ${({ theme }) => theme.colors.primarySoft}18;
  }
`;

type Props = {
  entries: GrottoWeightedItem[];
  onChange: (entries: GrottoWeightedItem[]) => void;
};

/**
 * A weighted list of `[weight, item_db_symbol]` rows. Reused by the two global
 * pools (visible / hidden) and by the per-map `unique_items` pool. Each row
 * shows the chosen item's icon, a search-select, its weight, and a live bar of
 * its share of the pool total.
 */
export const GrottoWeightedItemTable = ({ entries, onChange }: Props) => {
  const { t } = useTranslation();
  const { projectDataValues: items } = useProjectItems();
  const total = entries.reduce((sum, [weight]) => sum + (weight > 0 ? weight : 0), 0);

  const updateEntry = (index: number, next: GrottoWeightedItem) => onChange(entries.map((entry, i) => (i === index ? next : entry)));
  const removeEntry = (index: number) => onChange(entries.filter((_, i) => i !== index));
  const addEntry = () => onChange([...entries, [1, '']]);

  return (
    <List>
      {entries.length === 0 && <EmptyState>{t('grotto_no_items')}</EmptyState>}
      {entries.map(([weight, symbol], index) => {
        const pct = total > 0 && weight > 0 ? (weight / total) * 100 : 0;
        const item = symbol ? items[symbol] : undefined;
        return (
          <Row key={index}>
            <IconCell>
              {item ? <ResourceImage imagePathInProject={itemIconPath(item.icon)} /> : <IconPlaceholder />}
            </IconCell>
            <SelectItem
              noLabel
              dbSymbol={symbol || '__undef__'}
              onChange={(value) => updateEntry(index, [weight, value === '__undef__' ? '' : value])}
              undefValueOption={t('none_option')}
            />
            <GrottoWeightInput value={weight} onChange={(v) => updateEntry(index, [v, symbol])} />
            <Share>
              <ShareBar>
                <ShareFill $pct={pct} />
              </ShareBar>
              <ShareLabel>{t('grotto_chance', { percent: pct.toFixed(1) })}</ShareLabel>
            </Share>
            <DeleteButtonOnlyIcon size="s" onClick={() => removeEntry(index)} />
          </Row>
        );
      })}
      <AddButton type="button" onClick={addEntry}>
        <PlusIcon />
        {t('grotto_add_item')}
      </AddButton>
    </List>
  );
};
