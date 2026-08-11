import React, { useMemo, useState } from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';

import { useProjectMaps } from '@hooks/useProjectData';
import { useGetEntityNameText } from '@utils/ReadingProjectText';

import { Scrim } from '../MapEditor/events/dialog/styles';
import { GrottoMapPreview } from './GrottoMapPreview';

/**
 * The "New grotto" window. One screen: a searchable list of the project's maps
 * on the left, a live preview of the highlighted map on the right, and a click
 * on that preview sets the grotto's spawn tile. Maps that already have a grotto
 * are shown disabled (one grotto per map). Confirming reports the chosen map id
 * and tile back to the page, which writes it into the config.
 */

const Dialog = styled.div`
  width: 900px;
  max-width: calc(100vw - 48px);
  height: min(680px, calc(100vh - 48px));
  display: flex;
  flex-direction: column;
  background: ${({ theme }) => theme.colors.dark16};
  border: 1px solid ${({ theme }) => theme.colors.dark24};
  border-radius: 10px;
  overflow: hidden;
  ${({ theme }) => theme.fonts.normalRegular};
  color: ${({ theme }) => theme.colors.text100};

  & *::-webkit-scrollbar {
    width: 10px;
    height: 10px;
  }
  & *::-webkit-scrollbar-thumb {
    background: ${({ theme }) => theme.colors.dark24};
    border: 2px solid ${({ theme }) => theme.colors.dark16};
    border-radius: 6px;
  }
  & *::-webkit-scrollbar-track {
    background: transparent;
  }
`;

const TitleBar = styled.div`
  padding: 12px 16px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.dark20};
  ${({ theme }) => theme.fonts.titlesHeadline6};
`;

const Body = styled.div`
  flex: 1;
  min-height: 0;
  display: flex;
`;

const ListPane = styled.div`
  width: 300px;
  display: flex;
  flex-direction: column;
  border-right: 1px solid ${({ theme }) => theme.colors.dark20};
`;

const SearchBox = styled.input`
  margin: 12px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.colors.dark24};
  background: ${({ theme }) => theme.colors.dark12};
  color: ${({ theme }) => theme.colors.text100};
  ${({ theme }) => theme.fonts.normalMedium};
  box-sizing: border-box;
`;

const MapList = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 0 8px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const MapRow = styled.button<{ $active: boolean; $disabled: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  text-align: left;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid ${({ theme, $active }) => ($active ? theme.colors.primaryBase : 'transparent')};
  background: ${({ theme, $active }) => ($active ? theme.colors.dark18 : 'transparent')};
  color: ${({ theme, $disabled }) => ($disabled ? theme.colors.text500 : theme.colors.text100)};
  ${({ theme }) => theme.fonts.normalMedium};
  cursor: ${({ $disabled }) => ($disabled ? 'default' : 'pointer')};
  &:hover {
    background: ${({ theme, $disabled }) => ($disabled ? 'transparent' : theme.colors.dark18)};
  }
`;

const Tag = styled.span`
  ${({ theme }) => theme.fonts.normalSmall};
  color: ${({ theme }) => theme.colors.text400};
  background: ${({ theme }) => theme.colors.dark20};
  border-radius: 6px;
  padding: 2px 6px;
  white-space: nowrap;
`;

const PreviewPane = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
`;

const PreviewToolbar = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px 8px;
  ${({ theme }) => theme.fonts.normalSmall};
  color: ${({ theme }) => theme.colors.text400};
`;

const Viewport = styled.div`
  flex: 1;
  overflow: auto;
  padding: 12px 16px;
  background: ${({ theme }) => theme.colors.dark12};
`;

const EmptyPreview = styled.div`
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  ${({ theme }) => theme.fonts.normalMedium};
  color: ${({ theme }) => theme.colors.text400};
`;

const ZoomBtn = styled.button<{ $active: boolean }>`
  padding: 3px 10px;
  border-radius: 6px;
  border: 1px solid ${({ theme }) => theme.colors.dark24};
  background: transparent;
  color: ${({ theme }) => theme.colors.text100};
  ${({ theme }) => theme.fonts.normalSmall};
  cursor: pointer;
  opacity: ${({ $active }) => ($active ? 1 : 0.55)};
`;

const Coords = styled.span`
  color: ${({ theme }) => theme.colors.text100};
`;

const Footer = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid ${({ theme }) => theme.colors.dark20};
`;

const FooterBtn = styled.button<{ $primary?: boolean }>`
  padding: 8px 22px;
  border-radius: 8px;
  border: 1px solid ${({ theme, $primary }) => ($primary ? theme.colors.primaryBase : theme.colors.dark24)};
  background: ${({ theme, $primary }) => ($primary ? theme.colors.primaryBase : 'transparent')};
  color: ${({ theme }) => theme.colors.text100};
  ${({ theme }) => theme.fonts.normalMedium};
  cursor: pointer;
  &:hover {
    filter: brightness(1.1);
  }
  &:disabled {
    opacity: 0.4;
    cursor: default;
    filter: none;
  }
`;

const ZOOM_CELLS = [16, 32, 64] as const;

type Props = {
  /** Map ids (string) that already have a grotto — shown disabled. */
  existingMapIds: string[];
  onCreate: (mapId: string, x: number, y: number) => void;
  onClose: () => void;
};

export const GrottoNewDialog = ({ existingMapIds, onCreate, onClose }: Props) => {
  const { t } = useTranslation();
  const { projectDataValues: maps } = useProjectMaps();
  const getEntityName = useGetEntityNameText();

  const [filter, setFilter] = useState('');
  const [selectedMapId, setSelectedMapId] = useState<string | null>(null);
  const [tile, setTile] = useState<{ x: number; y: number } | null>(null);
  const [zoomCell, setZoomCell] = useState<number>(32);

  const rows = useMemo(() => {
    const term = filter.trim().toLowerCase();
    return Object.values(maps)
      .slice()
      .sort((a, b) => a.id - b.id)
      .map((map) => ({
        id: String(map.id),
        tiledFilename: map.tiledFilename,
        label: `[${map.id}] ${getEntityName({ klass: 'Map', id: map.id }) || map.dbSymbol}`,
        taken: existingMapIds.includes(String(map.id)),
      }))
      .filter((row) => (term ? row.label.toLowerCase().includes(term) : true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maps, filter, existingMapIds]);

  const selectedRow = rows.find((r) => r.id === selectedMapId) ?? null;

  const selectMap = (id: string, taken: boolean) => {
    if (taken) return;
    setSelectedMapId(id);
    setTile(null);
  };

  const canCreate = selectedRow && tile;

  return (
    <Scrim onClick={onClose}>
      <Dialog onClick={(e) => e.stopPropagation()}>
        <TitleBar>{t('grotto_new_title')}</TitleBar>
        <Body>
          <ListPane>
            <SearchBox placeholder={t('grotto_new_search')} value={filter} onChange={(e) => setFilter(e.target.value)} />
            <MapList>
              {rows.map((row) => (
                <MapRow
                  key={row.id}
                  type="button"
                  $active={row.id === selectedMapId}
                  $disabled={row.taken}
                  onClick={() => selectMap(row.id, row.taken)}
                >
                  <span>{row.label}</span>
                  {row.taken && <Tag>{t('grotto_new_has_grotto')}</Tag>}
                </MapRow>
              ))}
            </MapList>
          </ListPane>
          <PreviewPane>
            {selectedRow ? (
              <>
                <PreviewToolbar>
                  <span>{t('grotto_new_pick_hint')}</span>
                  <div style={{ flex: 1 }} />
                  {tile && (
                    <Coords>{t('grotto_position_value', { x: tile.x, y: tile.y })}</Coords>
                  )}
                  {ZOOM_CELLS.map((c) => (
                    <ZoomBtn key={c} type="button" $active={zoomCell === c} onClick={() => setZoomCell(c)}>
                      {c === 16 ? '0.5×' : c === 32 ? '1×' : '2×'}
                    </ZoomBtn>
                  ))}
                </PreviewToolbar>
                <Viewport>
                  <GrottoMapPreview
                    key={selectedRow.id}
                    tiledFilename={selectedRow.tiledFilename}
                    cellPx={zoomCell}
                    marker={tile}
                    onPick={(x, y) => setTile({ x, y })}
                  />
                </Viewport>
              </>
            ) : (
              <EmptyPreview>{t('grotto_new_choose_map')}</EmptyPreview>
            )}
          </PreviewPane>
        </Body>
        <Footer>
          <div style={{ flex: 1 }} />
          <FooterBtn type="button" onClick={onClose}>
            {t('cancel')}
          </FooterBtn>
          <FooterBtn
            type="button"
            $primary
            disabled={!canCreate}
            onClick={() => canCreate && onCreate(selectedRow!.id, tile!.x, tile!.y)}
          >
            {t('grotto_new_create')}
          </FooterBtn>
        </Footer>
      </Dialog>
    </Scrim>
  );
};
