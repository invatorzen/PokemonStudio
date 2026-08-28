import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { PageEditor, PageTemplate } from '@components/pages';
import { SecondaryButtonWithPlusIcon } from '@components/buttons';
import { ControlBar } from '@components/ControlBar';
import { StudioDropDown } from '@components/StudioDropDown';
import { useProjectItems } from '@hooks/useProjectData';
import { useGetEntityNameText } from '@utils/ReadingProjectText';

import { OutfitCard } from './OutfitCard';
import { EmptyState, HelpText } from './outfitStyles';
import { useOutfitDraft } from './useOutfitDraft';

/**
 * Outfits are edited one at a time — like Studio's database pages — with a top
 * selector to switch between them and a "New" button. Which outfit is shown is
 * local UI state; the outfit rows live in the shared draft store.
 */
export const OutfitsPage = () => {
  const { t } = useTranslation();
  const { projectPath, loadState, draft, addOutfit, changeKey, changeEntry, deleteRow } = useOutfitDraft();
  const { projectDataValues: items } = useProjectItems();
  const getEntityName = useGetEntityNameText();
  const ready = loadState.status === 'ready';
  const rows = draft.rows;
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Derive the shown outfit instead of syncing it in an effect: a stale/absent
  // selection falls back to the first outfit, so the view stays valid.
  const selected = rows.find((r) => r.id === selectedId) ?? rows[0] ?? null;
  // Label each outfit by its item's display name (falling back to the raw key,
  // then "untitled") — the map key is the item db_symbol, not human-readable.
  const outfitOptions = useMemo(
    () =>
      rows.map((r) => {
        const key = r.key.trim();
        const item = key ? items[key] : undefined;
        return { value: r.id, label: item ? getEntityName(item) : key || t('outfits_untitled') };
      }),
    [rows, items, getEntityName, t]
  );

  return (
    <PageTemplate title={t('outfits_list')} size="default">
      {!projectPath && <EmptyState>{t('outfits_no_project')}</EmptyState>}
      {loadState.status === 'loading' && <EmptyState>{t('outfits_loading')}</EmptyState>}
      {loadState.status === 'error' && <EmptyState>{t('outfits_load_error', { error: loadState.message })}</EmptyState>}

      {ready && (
        <>
          <ControlBar>
            <SecondaryButtonWithPlusIcon onClick={() => setSelectedId(addOutfit())}>{t('outfits_add')}</SecondaryButtonWithPlusIcon>
            {rows.length > 0 ? (
              <StudioDropDown
                value={selected?.id ?? ''}
                options={outfitOptions}
                onChange={(id) => setSelectedId(id)}
                optionals={{ deletedOption: t('outfits_untitled'), noOptionLabel: t('outfits_empty') }}
              />
            ) : (
              <div />
            )}
          </ControlBar>

          <PageEditor title={t('outfits_list')} editorTitle={t('outfits_config')}>
            <HelpText>{t('outfits_list_help')}</HelpText>
            {selected ? (
              <OutfitCard key={selected.id} row={selected} onChangeKey={changeKey} onChangeEntry={changeEntry} onDelete={deleteRow} />
            ) : (
              <EmptyState>{t('outfits_empty')}</EmptyState>
            )}
          </PageEditor>
        </>
      )}
    </PageTemplate>
  );
};
