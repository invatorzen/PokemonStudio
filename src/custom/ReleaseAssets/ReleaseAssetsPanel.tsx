import React, { useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import { PageEditor } from '@components/pages';
import { Input, Toggle } from '@components/inputs';
import { SecondaryButton, WarningButton } from '@components/buttons';
import { SelectCustomSimple } from '@components/SelectCustom/SelectCustomSimple';

import { assetKey, type AssetReason, type ReleaseAsset } from './types';
import { buildAssetTree, formatBytes, type AssetFolder } from './releaseAssetsTree';
import {
  includeAllAssets,
  removeUnusedAssets,
  rescanReleaseAssets,
  setAssetsIncluded,
  setReleaseAssetsEnabled,
  undoReleaseAssets,
  useReleaseAssets,
} from './releaseAssetsStore';

/**
 * Release assets page: a checkbox tree of every graphics/audio file the release
 * build would ship. The checked set is what gets compiled (Umbra's
 * `00080 ReleaseAssets.rb` reads the saved selection). "Remove unused assets"
 * unchecks what the scan found unreferenced; hand-made choices always win.
 */

type Filter = 'all' | 'used' | 'rule' | 'unused' | 'excluded' | 'new';
type Sort = 'name' | 'size';

/** Files shown per folder before "Show more". */
const PAGE = 200;

const Hint = styled.p`
  margin: 0;
  ${({ theme }) => theme.fonts.normalSmall};
  color: ${({ theme }) => theme.colors.text400};
  white-space: pre-line;
`;

const SummaryGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 4px 16px;
  ${({ theme }) => theme.fonts.normalRegular};
  color: ${({ theme }) => theme.colors.text400};

  & .value {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  & .total {
    color: ${({ theme }) => theme.colors.text100};
    ${({ theme }) => theme.fonts.normalMedium};
    border-top: 1px solid ${({ theme }) => theme.colors.dark20};
    padding-top: 6px;
    margin-top: 2px;
  }
  & .saving {
    color: ${({ theme }) => theme.colors.successBase};
  }
`;

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
`;

const ToggleRow = styled.label`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  ${({ theme }) => theme.fonts.normalRegular};
  color: ${({ theme }) => theme.colors.text100};
`;

const Warning = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 16px;
  border-radius: 8px;
  background-color: ${({ theme }) => theme.colors.warningSoft};
  color: ${({ theme }) => theme.colors.warningBase};
  ${({ theme }) => theme.fonts.normalSmall};

  & ul {
    margin: 0;
    padding-left: 18px;
  }
`;

// Search on its own row: SelectCustomSimple has a 240px min-width, so two selects
// plus the search box don't fit on one line inside the card.
const Filters = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;

  & > :first-child {
    grid-column: 1 / -1;
  }
`;

const Tree = styled.div`
  display: flex;
  flex-direction: column;
  border: 1px solid ${({ theme }) => theme.colors.dark20};
  border-radius: 8px;
  overflow: hidden;
`;

const Row = styled.div<{ $depth: number; $folder?: boolean; $off?: boolean }>`
  display: grid;
  grid-template-columns: 16px 18px minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 8px;
  padding: 4px 12px 4px ${({ $depth }) => 12 + $depth * 18}px;
  min-height: 28px;
  ${({ theme }) => theme.fonts.normalSmall};
  color: ${({ theme, $off }) => ($off ? theme.colors.text600 : theme.colors.text100)};
  background-color: ${({ theme, $folder }) => ($folder ? theme.colors.dark18 : 'transparent')};
  border-top: 1px solid ${({ theme }) => theme.colors.dark19};

  &:first-child {
    border-top: none;
  }
  &:hover {
    background-color: ${({ theme }) => theme.colors.dark20};
  }
  & .chevron {
    cursor: pointer;
    user-select: none;
    color: ${({ theme }) => theme.colors.text400};
    text-align: center;
  }
  & .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: ${({ $folder }) => ($folder ? 'pointer' : 'default')};
    text-decoration: ${({ $off, $folder }) => ($off && !$folder ? 'line-through' : 'none')};
  }
  & .size {
    font-variant-numeric: tabular-nums;
    color: ${({ theme }) => theme.colors.text400};
    text-align: right;
    white-space: nowrap;
  }
  & input[type='checkbox'] {
    margin: 0;
    cursor: pointer;
  }
`;

const Badges = styled.span`
  display: flex;
  gap: 4px;
  justify-content: flex-end;
`;

const Badge = styled.span<{ $kind: 'used' | 'rule' | 'unused' | 'new' | 'manual' }>`
  padding: 1px 6px;
  border-radius: 4px;
  white-space: nowrap;
  ${({ theme }) => theme.fonts.normalSmall};
  font-size: 11px;
  ${({ theme, $kind }) => {
    const c = theme.colors;
    const [bg, fg] =
      $kind === 'used'
        ? [c.successSoft, c.successBase]
        : $kind === 'rule'
          ? [c.infoSoft, c.infoBase]
          : $kind === 'unused'
            ? [c.warningSoft, c.warningBase]
            : $kind === 'new'
              ? [c.primarySoft, c.primaryBase]
              : [c.dark20, c.text400];
    return `background-color: ${bg}; color: ${fg};`;
  }}
`;

const MoreButton = styled.div<{ $depth: number }>`
  padding: 6px 12px 6px ${({ $depth }) => 48 + $depth * 18}px;
  ${({ theme }) => theme.fonts.normalSmall};
  color: ${({ theme }) => theme.colors.primaryBase};
  cursor: pointer;
  border-top: 1px solid ${({ theme }) => theme.colors.dark19};
`;

/** A native checkbox that can show the "some checked" state. */
const TriCheckbox = ({ checked, indeterminate, onChange, title }: { checked: boolean; indeterminate: boolean; onChange: (v: boolean) => void; title?: string }) => {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return <input ref={ref} type="checkbox" checked={checked} title={title} onChange={(e) => onChange(e.target.checked)} />;
};

const reasonText = (t: TFunction, r: AssetReason): string => {
  switch (r.type) {
    case 'source':
      return r.label;
    case 'folder':
      return t('ra_reason_folder', { folder: r.folder });
    case 'folderInCode':
      return t('ra_reason_folder_in_code', { label: r.label });
    case 'variant':
      return t('ra_reason_variant', { of: r.of });
    case 'idName':
      return t('ra_reason_id_name');
    case 'prefix':
      return t('ra_reason_prefix', { prefix: r.prefix, label: r.label });
  }
};

export const ReleaseAssetsPanel = () => {
  const { t } = useTranslation();
  const { status, error, scan, selection, neverSaved, history } = useReleaseAssets();
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('size');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['graphics', 'audio']));
  const [limits, setLimits] = useState<Record<string, number>>({});
  const [lastRemoved, setLastRemoved] = useState<number | null>(null);

  const tree = useMemo(() => (scan ? buildAssetTree(scan) : []), [scan]);
  const excluded = useMemo(() => new Set(selection.excluded.map(assetKey)), [selection.excluded]);
  const reviewed = useMemo(() => new Set(selection.reviewed), [selection.reviewed]);
  const isNew = (a: ReleaseAsset) => !neverSaved && reviewed.size > 0 && !reviewed.has(assetKey(a.path));
  const isIn = (a: ReleaseAsset) => !excluded.has(assetKey(a.path));

  if (status === 'idle' || status === 'loading' || (status === 'scanning' && !scan)) {
    return (
      <PageEditor editorTitle={t('ra_section')} title={t('ra_summary_title')}>
        <Hint>{t('ra_scanning')}</Hint>
      </PageEditor>
    );
  }
  if (status === 'error' || !scan) {
    return (
      <PageEditor editorTitle={t('ra_section')} title={t('ra_summary_title')}>
        <Hint>{t('ra_error', { error: error ?? '' })}</Hint>
        <Actions>
          <SecondaryButton onClick={rescanReleaseAssets}>{t('ra_rescan')}</SecondaryButton>
        </Actions>
      </PageEditor>
    );
  }

  // --- Totals ---
  const assetsTotal = scan.assets.reduce((sum, a) => sum + a.size, 0);
  const assetsIn = scan.assets.reduce((sum, a) => sum + (isIn(a) || !selection.enabled ? a.size : 0), 0);
  const other = scan.other;
  const otherTotal = other.engine + other.lib + other.data + other.scripts + other.fontsAndShaders;
  const unusedCount = scan.assets.filter((a) => a.status === 'unused').length;
  const unusedSize = scan.assets.filter((a) => a.status === 'unused').reduce((sum, a) => sum + a.size, 0);
  const excludedUsed = scan.assets.filter((a) => a.status !== 'unused' && !isIn(a));
  const newCount = scan.assets.filter(isNew).length;

  // --- Tree rows ---
  const q = query.trim().toLowerCase();
  const passes = (a: ReleaseAsset) => {
    if (q && !a.path.toLowerCase().includes(q)) return false;
    switch (filter) {
      case 'all':
        return true;
      case 'excluded':
        return !isIn(a);
      case 'new':
        return isNew(a);
      default:
        return a.status === filter;
    }
  };
  const filtering = filter !== 'all' || q.length > 0;
  const bySort = <T extends { size: number; name?: string; path?: string }>(list: T[]) =>
    [...list].sort((a, b) => (sort === 'size' ? b.size - a.size : (a.name ?? a.path ?? '').localeCompare(b.name ?? b.path ?? '')));

  const toggleFolder = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const rows: React.ReactNode[] = [];
  const renderFolder = (folder: AssetFolder, depth: number) => {
    const visible = filtering ? folder.all.filter(passes) : folder.all;
    if (filtering && !visible.length) return;
    const inCount = folder.all.filter(isIn).length;
    const inSize = folder.all.reduce((sum, a) => sum + (isIn(a) ? a.size : 0), 0);
    const unused = folder.all.filter((a) => a.status === 'unused').length;
    const open = filtering || expanded.has(folder.key);
    rows.push(
      <Row key={`d:${folder.key}`} $depth={depth} $folder $off={inCount === 0}>
        <span className="chevron" onClick={() => toggleFolder(folder.key)}>
          {open ? '▾' : '▸'}
        </span>
        <TriCheckbox
          checked={inCount === folder.all.length}
          indeterminate={inCount > 0 && inCount < folder.all.length}
          onChange={(v) => setAssetsIncluded(filtering ? visible : folder.all, v)}
          title={filtering ? t('ra_folder_toggle_filtered') : undefined}
        />
        <span className="name" onClick={() => toggleFolder(folder.key)}>
          {folder.name}/
        </span>
        <Badges>{unused > 0 && <Badge $kind="unused">{t('ra_badge_unused_count', { count: unused })}</Badge>}</Badges>
        <span className="size">{inSize === folder.size ? formatBytes(folder.size) : t('ra_size_of', { in: formatBytes(inSize), total: formatBytes(folder.size) })}</span>
      </Row>
    );
    if (!open) return;
    for (const sub of bySort(folder.folders)) renderFolder(sub, depth + 1);
    const files = bySort((filtering ? folder.files.filter(passes) : folder.files).map((a) => ({ ...a, name: a.path.slice(a.path.lastIndexOf('/') + 1) })));
    const limit = limits[folder.key] ?? PAGE;
    for (const file of files.slice(0, limit)) {
      const on = isIn(file);
      const manual = selection.manual[assetKey(file.path)];
      rows.push(
        <Row key={`f:${file.path}`} $depth={depth + 1} $off={!on} title={file.reasons.map((r) => reasonText(t, r)).join('\n') || t('ra_no_reference')}>
          <span />
          <TriCheckbox checked={on} indeterminate={false} onChange={(v) => setAssetsIncluded([file], v)} />
          <span className="name">{file.name}</span>
          <Badges>
            {isNew(file) && <Badge $kind="new">{t('ra_badge_new')}</Badge>}
            {manual && <Badge $kind="manual">{t('ra_badge_manual')}</Badge>}
            <Badge $kind={file.status}>{t(`ra_badge_${file.status}`)}</Badge>
          </Badges>
          <span className="size">{formatBytes(file.size)}</span>
        </Row>
      );
    }
    if (files.length > limit) {
      rows.push(
        <MoreButton key={`m:${folder.key}`} $depth={depth} onClick={() => setLimits((prev) => ({ ...prev, [folder.key]: limit + PAGE * 5 }))}>
          {t('ra_show_more', { count: files.length - limit })}
        </MoreButton>
      );
    }
  };
  for (const folder of tree) renderFolder(folder, 0);

  const filterOptions = (['all', 'used', 'rule', 'unused', 'excluded', 'new'] as Filter[]).map((value) => ({ value, label: t(`ra_filter_${value}`) }));
  const sortOptions = (['size', 'name'] as Sort[]).map((value) => ({ value, label: t(`ra_sort_${value}`) }));

  return (
    <>
      <PageEditor editorTitle={t('ra_section')} title={t('ra_summary_title')}>
        <Hint>{t('ra_intro')}</Hint>
        <SummaryGrid>
          <span>{t('ra_line_assets', { in: formatBytes(assetsIn), total: formatBytes(assetsTotal) })}</span>
          <span className="value">{formatBytes(assetsIn)}</span>
          <span>{t('ra_line_engine')}</span>
          <span className="value">≈ {formatBytes(other.engine + other.lib)}</span>
          <span>{t('ra_line_data')}</span>
          <span className="value">≈ {formatBytes(other.data + other.scripts)}</span>
          <span>{t('ra_line_fonts')}</span>
          <span className="value">{formatBytes(other.fontsAndShaders)}</span>
          <span className="total">{t('ra_line_total')}</span>
          <span className="total value">≈ {formatBytes(assetsIn + otherTotal)}</span>
          {assetsIn < assetsTotal && (
            <>
              <span className="saving">{t('ra_line_saving', { full: formatBytes(assetsTotal + otherTotal) })}</span>
              <span className="saving value">− {formatBytes(assetsTotal - assetsIn)}</span>
            </>
          )}
        </SummaryGrid>
        <ToggleRow>
          <span>{t('ra_enabled')}</span>
          <Toggle checked={selection.enabled} onChange={(e) => setReleaseAssetsEnabled(e.target.checked)} />
        </ToggleRow>
        <Actions>
          <WarningButton
            onClick={() => setLastRemoved(removeUnusedAssets())}
            title={t('ra_remove_unused_hint', { count: unusedCount, size: formatBytes(unusedSize) })}
          >
            {t('ra_remove_unused')}
          </WarningButton>
          <SecondaryButton onClick={() => history.length && undoReleaseAssets()} disabled={!history.length}>
            {t('ra_undo')}
          </SecondaryButton>
          <SecondaryButton onClick={includeAllAssets}>{t('ra_include_all')}</SecondaryButton>
          <SecondaryButton onClick={rescanReleaseAssets} disabled={status === 'scanning'}>
            {status === 'scanning' ? t('ra_rescanning') : t('ra_rescan')}
          </SecondaryButton>
        </Actions>
        {lastRemoved !== null && <Hint>{lastRemoved ? t('ra_removed', { count: lastRemoved }) : t('ra_removed_none')}</Hint>}
        <Hint>
          {t('ra_scan_info', {
            maps: scan.sources.maps,
            data: scan.sources.dataFiles,
            scripts: scan.sources.scripts,
            texts: scan.sources.texts,
            tiled: scan.sources.tiled,
            seconds: (scan.durationMs / 1000).toFixed(1),
          })}
          {newCount > 0 ? `\n${t('ra_new_count', { count: newCount })}` : ''}
        </Hint>
        {scan.sources.unreadable.length > 0 && (
          <Warning>
            <span>{t('ra_unreadable', { count: scan.sources.unreadable.length })}</span>
            <ul>
              {scan.sources.unreadable.slice(0, 8).map((file) => (
                <li key={file}>{file}</li>
              ))}
            </ul>
          </Warning>
        )}
        {excludedUsed.length > 0 && (
          <Warning>
            <span>{t('ra_warning_used', { count: excludedUsed.length })}</span>
            <ul>
              {excludedUsed.slice(0, 5).map((a) => (
                <li key={a.path}>
                  {a.path} — {a.reasons.map((r) => reasonText(t, r))[0]}
                </li>
              ))}
            </ul>
            <Actions>
              <SecondaryButton onClick={() => setAssetsIncluded(excludedUsed, true)}>{t('ra_warning_include')}</SecondaryButton>
            </Actions>
          </Warning>
        )}
      </PageEditor>

      <PageEditor editorTitle={t('ra_section')} title={t('ra_tree_title')}>
        <Filters>
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('ra_search')} />
          <SelectCustomSimple id="ra-filter" value={filter} options={filterOptions} onChange={(v) => setFilter(v as Filter)} noTooltip />
          <SelectCustomSimple id="ra-sort" value={sort} options={sortOptions} onChange={(v) => setSort(v as Sort)} noTooltip />
        </Filters>
        <Tree>{rows.length ? rows : <Row $depth={0}>{t('ra_nothing')}</Row>}</Tree>
      </PageEditor>
    </>
  );
};
