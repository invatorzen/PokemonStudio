import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';

import { DatabasePageStyle } from '@components/database/DatabasePageStyle';
import { ControlBar } from '@components/ControlBar';
import { Input } from '@components/inputs';
import { SelectCustomSimple } from '@components/SelectCustom';
import { SecondaryButton } from '@components/buttons';
import { useGlobalSelectedDataIdentifier } from '@src/GlobalStateProvider';
import { useGetProjectText } from '@utils/ReadingProjectText';
import type { EventDialogueEntry } from '@src/backendTasks/readEventDialogue';

import { useEventDialogue } from './useEventDialogue';

/**
 * Read-only "Dialogues" viewer: every line of event dialogue in the project,
 * grouped by map and searchable. Each line is tagged RAW (inline in the event)
 * or CSV (backed by a text file); CSV lines get an Edit button that jumps to the
 * matching file in Studio's text editor. Raw lines say so — they'll move to CSV
 * later. Nothing here writes to the project.
 */

const Page = styled(DatabasePageStyle)`
  display: flex;
  flex-direction: column;
  height: 100%;
`;

const Bar = styled(ControlBar)`
  grid-template-columns: 1fr auto auto auto;

  & .search {
    max-width: 420px;
  }
  & .filter {
    min-width: 150px;
  }
  & .count {
    ${({ theme }) => theme.fonts.normalRegular};
    color: ${({ theme }) => theme.colors.text400};
    white-space: nowrap;
  }
`;

const Scroll = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 16px 18px 48px;
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

const MapGroup = styled.section`
  display: flex;
  flex-direction: column;
  gap: 4px;

  & > h2 {
    ${({ theme }) => theme.fonts.titlesHeadline6};
    color: ${({ theme }) => theme.colors.text100};
    margin: 0 0 6px;
    position: sticky;
    top: -16px;
    background-color: ${({ theme }) => theme.colors.dark12};
    padding: 6px 0;
    z-index: 1;
  }
  & > h2 > span {
    ${({ theme }) => theme.fonts.normalRegular};
    color: ${({ theme }) => theme.colors.text500};
    margin-left: 8px;
  }
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: 200px 1fr auto;
  gap: 12px;
  align-items: start;
  padding: 10px 12px;
  border-radius: 8px;
  background-color: ${({ theme }) => theme.colors.dark16};
  ${({ theme }) => theme.fonts.normalRegular};

  & .meta {
    color: ${({ theme }) => theme.colors.text500};
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  & .meta .event {
    color: ${({ theme }) => theme.colors.text400};
  }
  & .text {
    color: ${({ theme }) => theme.colors.text100};
    white-space: pre-wrap;
    word-break: break-word;
  }
  & .text .speaker {
    color: ${({ theme }) => theme.colors.primaryBase};
    font-weight: 600;
    margin-right: 6px;
  }
  & .side {
    display: flex;
    align-items: center;
    gap: 8px;
  }
`;

const Badge = styled.span<{ kind: 'raw' | 'csv' }>`
  ${({ theme }) => theme.fonts.normalSmall};
  padding: 2px 8px;
  border-radius: 100px;
  white-space: nowrap;
  color: ${({ theme, kind }) => (kind === 'csv' ? theme.colors.successBase : theme.colors.warningBase)};
  background-color: ${({ theme, kind }) => (kind === 'csv' ? theme.colors.successSoft : theme.colors.warningSoft)};
`;

const ChoiceTag = styled.span`
  ${({ theme }) => theme.fonts.normalSmall};
  padding: 2px 8px;
  border-radius: 100px;
  white-space: nowrap;
  color: ${({ theme }) => theme.colors.infoBase};
  background-color: ${({ theme }) => theme.colors.infoSoft};
`;

const Centered = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: ${({ theme }) => theme.colors.text400};
  ${({ theme }) => theme.fonts.normalRegular};

  & .bar {
    width: 320px;
    height: 6px;
    border-radius: 3px;
    background-color: ${({ theme }) => theme.colors.dark20};
    overflow: hidden;
  }
  & .bar > span {
    display: block;
    height: 100%;
    background-color: ${({ theme }) => theme.colors.primaryBase};
    transition: width 0.15s ease;
  }
`;

const resolvedText = (entry: EventDialogueEntry, getText: (fileId: number, textId: number) => string): string => {
  if (entry.kind === 'csv' && entry.fileId !== undefined && entry.textId !== undefined) {
    const csv = getText(entry.fileId, entry.textId);
    // The CSV row when it resolves; otherwise the author's trailing note (entry.text)
    // so refs to not-yet-created files still show something meaningful.
    if (csv && !csv.startsWith('Unable to find') && csv.trim() !== '') return csv;
    return entry.text;
  }
  return entry.text;
};

export const EventDialoguePage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [, setSelectedDataIdentifier] = useGlobalSelectedDataIdentifier();
  const getText = useGetProjectText();
  const { status, entries, progress, error, reload } = useEventDialogue();
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<'all' | 'csv' | 'raw' | 'choice'>('all');

  const filterOptions = useMemo(
    () => [
      { value: 'all', label: t('dialogues_filter_all') },
      { value: 'csv', label: t('dialogues_filter_csv') },
      { value: 'raw', label: t('dialogues_filter_raw') },
      { value: 'choice', label: t('dialogues_filter_choice') },
    ],
    [t]
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matchesFilter = (entry: EventDialogueEntry) => {
      if (kindFilter === 'all') return true;
      if (kindFilter === 'choice') return !!entry.isChoice; // choices, both csv and raw
      return entry.kind === kindFilter;
    };
    const withText = entries.filter(matchesFilter).map((entry) => ({ entry, text: resolvedText(entry, getText) }));
    if (!query) return withText;
    return withText.filter(
      ({ entry, text }) =>
        text.toLowerCase().includes(query) ||
        entry.mapName.toLowerCase().includes(query) ||
        entry.eventName.toLowerCase().includes(query) ||
        (entry.speaker ?? '').toLowerCase().includes(query)
    );
  }, [entries, getText, search, kindFilter]);

  const groups = useMemo(() => {
    const byMap: { mapId: number; mapName: string; rows: typeof filtered }[] = [];
    filtered.forEach((item) => {
      const last = byMap[byMap.length - 1];
      if (last && last.mapId === item.entry.mapId) last.rows.push(item);
      else byMap.push({ mapId: item.entry.mapId, mapName: item.entry.mapName, rows: [item] });
    });
    return byMap;
  }, [filtered]);

  const visibleMapCount = useMemo(() => new Set(filtered.map(({ entry }) => entry.mapId)).size, [filtered]);

  const openInTextEditor = (fileId: number) => {
    setSelectedDataIdentifier({ textInfo: fileId });
    navigate('/texts');
  };

  return (
    <Page>
      <Bar>
        <Input
          className="search"
          type="text"
          placeholder={t('dialogues_search_placeholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="filter">
          <SelectCustomSimple
            id="dialogues-filter"
            value={kindFilter}
            options={filterOptions}
            noTooltip
            onChange={(v) => setKindFilter(v as 'all' | 'csv' | 'raw' | 'choice')}
          />
        </div>
        <span className="count">{status === 'ready' ? t('dialogues_count', { count: filtered.length, maps: visibleMapCount }) : ''}</span>
        <SecondaryButton onClick={reload} disabled={status === 'loading'}>
          {t('dialogues_refresh')}
        </SecondaryButton>
      </Bar>

      {status === 'loading' && (
        <Centered>
          <div>{progress ? t('dialogues_scanning', { step: progress.step, total: progress.total, name: progress.stepText }) : t('dialogues_loading')}</div>
          <div className="bar">
            <span style={{ width: progress ? `${Math.round((progress.step / Math.max(progress.total, 1)) * 100)}%` : '0%' }} />
          </div>
        </Centered>
      )}

      {status === 'error' && <Centered>{t('dialogues_error', { error: error ?? '' })}</Centered>}

      {status === 'ready' && entries.length === 0 && <Centered>{t('dialogues_empty')}</Centered>}

      {status === 'ready' && entries.length > 0 && (
        <Scroll>
          {groups.length === 0 && <Centered>{t('dialogues_no_match')}</Centered>}
          {groups.map((group) => (
            <MapGroup key={group.mapId}>
              <h2>
                {group.mapName || t('dialogues_untitled_map', { id: group.mapId })}
                <span>{t('dialogues_group_count', { count: group.rows.length })}</span>
              </h2>
              {group.rows.map(({ entry, text }, index) => (
                <Row key={`${entry.mapId}-${entry.eventId}-${entry.page}-${index}`}>
                  <div className="meta">
                    <span className="event">{t('dialogues_event', { name: entry.eventName || `#${entry.eventId}`, id: entry.eventId })}</span>
                    <span>{t('dialogues_page', { page: entry.page })}</span>
                  </div>
                  <div className="text">
                    {entry.speaker && <span className="speaker">{entry.speaker}:</span>}
                    {text || <em>{t('dialogues_empty_line')}</em>}
                  </div>
                  <div className="side">
                    {entry.isChoice && <ChoiceTag>{t('dialogues_badge_choice')}</ChoiceTag>}
                    <Badge kind={entry.kind}>{entry.kind === 'csv' ? t('dialogues_badge_csv') : t('dialogues_badge_raw')}</Badge>
                    {entry.kind === 'csv' && entry.fileId !== undefined && (
                      <SecondaryButton onClick={() => openInTextEditor(entry.fileId as number)}>{t('dialogues_edit')}</SecondaryButton>
                    )}
                  </div>
                </Row>
              ))}
            </MapGroup>
          ))}
        </Scroll>
      )}
    </Page>
  );
};
