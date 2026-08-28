import React, { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import { useGlobalState } from '@src/GlobalStateProvider';
import { useResourceImageSrc } from '@components/ResourceImage';
import { basename } from '@utils/path';
import { StudioMap } from '@modelEntities/map';

import { Dim, FooterBtn, Row, Scrim, SmallInput, SmallSelect } from '@src/custom/MapEditor/events/dialog/styles';
import { PicturePicker } from '@src/custom/MapEditor/events/dialog/PicturePicker';
import { FogPreview } from '@src/custom/MapEditor/events/dialog/FogPreview';

import { useMapSettingsConfig } from './mapSettingsConfigStore';
import { assetHasGraphic, type MapSettingsEntry, type TimeVariants } from './types';

/**
 * Per-map Settings editor (fog / panorama / battleback), styled like the fork's
 * Change Fog pop-out. Edits the shared map-settings store live (parked for the
 * bottom-left Save button — no auto-save). The fog preview lays the fog over the
 * map's Tiled overview image, so it reads exactly like the in-editor fog preview.
 */

const Dialog = styled.div`
  width: 900px;
  height: min(700px, calc(100vh - 48px));
  max-width: calc(100vw - 32px);
  max-height: calc(100vh - 32px);
  display: flex;
  flex-direction: column;
  background: ${({ theme }) => theme.colors.dark16};
  border: 1px solid ${({ theme }) => theme.colors.dark24};
  border-radius: 10px;
  overflow: hidden;
  ${({ theme }) => theme.fonts.normalRegular};
  color: ${({ theme }) => theme.colors.text100};

  & input,
  & select {
    box-sizing: border-box;
  }
`;

const TitleBar = styled.div`
  padding: 8px 14px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.dark20};
  ${({ theme }) => theme.fonts.normalMedium};
`;

const Body = styled.div`
  display: flex;
  gap: 14px;
  padding: 12px 14px;
  min-height: 0;
  flex: 1;
`;

const Controls = styled.div`
  width: 340px;
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
  padding-right: 4px;
`;

const PreviewPane = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
`;

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const SectionTitle = styled.span`
  ${({ theme }) => theme.fonts.titlesOverline};
  color: ${({ theme }) => theme.colors.text400};
  text-transform: uppercase;
`;

const Footer = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 14px;
  border-top: 1px solid ${({ theme }) => theme.colors.dark20};
`;

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

type MapTileMeta = { width?: number; height?: number };

type AssetLike = { name: string; byTime: boolean; times: TimeVariants };
type PeriodKey = 'default' | 'morning' | 'day' | 'sunset' | 'night';

/**
 * Graphic chooser for one asset: a mode toggle between a single "all times"
 * graphic and per-time-of-day variants. In time mode a period selector drives a
 * single reused PicturePicker (rather than stacking five), and an empty period
 * falls back to the "Default" graphic at runtime.
 */
const GraphicField = ({ folder, files, asset, onPatch }: { folder: string; files: string[]; asset: AssetLike; onPatch: (patch: Partial<AssetLike>) => void }) => {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<PeriodKey>('default');
  const tick = (v: string) => (v.trim() ? ' ✓' : '');

  const modeSelect = (
    <Row>
      <Dim style={{ minWidth: 52 }}>{t('map_settings_mode')}</Dim>
      <SmallSelect value={asset.byTime ? 'time' : 'all'} onChange={(e) => onPatch({ byTime: e.target.value === 'time' })} style={{ flex: 1 }}>
        <option value="all">{t('map_settings_mode_all')}</option>
        <option value="time">{t('map_settings_mode_time')}</option>
      </SmallSelect>
    </Row>
  );

  if (!asset.byTime) {
    return (
      <>
        {modeSelect}
        <PicturePicker folder={folder} files={files} value={asset.name} onChange={(name) => onPatch({ name })} />
      </>
    );
  }

  const value = period === 'default' ? asset.name : asset.times[period];
  const setValue = (name: string) => (period === 'default' ? onPatch({ name }) : onPatch({ times: { ...asset.times, [period]: name } }));

  return (
    <>
      {modeSelect}
      <Row>
        <Dim style={{ minWidth: 52 }}>{t('map_settings_time_editing')}</Dim>
        <SmallSelect value={period} onChange={(e) => setPeriod(e.target.value as PeriodKey)} style={{ flex: 1 }}>
          <option value="default">{t('map_settings_time_default') + tick(asset.name)}</option>
          <option value="morning">{t('map_settings_time_morning') + tick(asset.times.morning)}</option>
          <option value="day">{t('map_settings_time_day') + tick(asset.times.day)}</option>
          <option value="sunset">{t('map_settings_time_sunset') + tick(asset.times.sunset)}</option>
          <option value="night">{t('map_settings_time_night') + tick(asset.times.night)}</option>
        </SmallSelect>
      </Row>
      <PicturePicker folder={folder} files={files} value={value} onChange={setValue} />
    </>
  );
};

/** The graphic to show in the (single) fog preview — the day variant in time mode, else the constant. */
const representativeFogName = (fog: MapSettingsEntry['fog']): string =>
  fog.byTime ? fog.times.day || fog.times.morning || fog.times.sunset || fog.times.night || fog.name : fog.name;

type Props = {
  map: StudioMap;
  fogFiles: string[];
  panoramaFiles: string[];
  battlebackFiles: string[];
  onClose: () => void;
};

export const MapSettingsDialog = ({ map, fogFiles, panoramaFiles, battlebackFiles, onClose }: Props) => {
  const { t } = useTranslation();
  const { getEntry, setEntry } = useMapSettingsConfig();
  const entry = getEntry(map.id);

  const patchFog = (patch: Partial<MapSettingsEntry['fog']>) => setEntry(map.id, { ...entry, fog: { ...entry.fog, ...patch } });
  const patchPanorama = (patch: Partial<MapSettingsEntry['panorama']>) => setEntry(map.id, { ...entry, panorama: { ...entry.panorama, ...patch } });
  const patchBattleback = (patch: Partial<MapSettingsEntry['battleback']>) => setEntry(map.id, { ...entry, battleback: { ...entry.battleback, ...patch } });

  // The Tiled overview image doubles as the fog preview backdrop — same picture
  // the map tree shows, so no live render is needed on the Data tab.
  const overviewName = basename(map.tiledFilename || '', '.tmx');
  const overviewUrl = useResourceImageSrc(overviewName ? `Data/Tiled/Overviews/${overviewName}.png` : '');
  const meta = (map.tileMetadata ?? {}) as MapTileMeta;

  return (
    <Scrim onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <Dialog onMouseDown={(e) => e.stopPropagation()}>
        <TitleBar>{t('map_settings_title')}</TitleBar>
        <Body>
          <Controls>
            <Section>
              <SectionTitle>{t('map_settings_fog')}</SectionTitle>
              <GraphicField folder="fogs" files={fogFiles} asset={entry.fog} onPatch={patchFog} />
              {assetHasGraphic(entry.fog) && (
                <>
                  <Row>
                    <Dim style={{ minWidth: 52 }}>{t('map_settings_opacity')}</Dim>
                    <input type="range" min={0} max={255} value={entry.fog.opacity} style={{ flex: 1, minWidth: 0 }} onChange={(e) => patchFog({ opacity: Number(e.target.value) })} />
                    <SmallInput type="number" min={0} max={255} value={entry.fog.opacity} onChange={(e) => patchFog({ opacity: clamp(Number(e.target.value) || 0, 0, 255) })} />
                  </Row>
                  <Row>
                    <Dim style={{ minWidth: 52 }}>{t('map_settings_hue')}</Dim>
                    <input type="range" min={0} max={360} value={entry.fog.hue} style={{ flex: 1, minWidth: 0 }} onChange={(e) => patchFog({ hue: Number(e.target.value) })} />
                    <SmallInput type="number" min={0} max={360} value={entry.fog.hue} onChange={(e) => patchFog({ hue: clamp(Number(e.target.value) || 0, 0, 360) })} />
                  </Row>
                  <Row>
                    <Dim style={{ minWidth: 52 }}>{t('map_settings_blend')}</Dim>
                    <SmallSelect value={entry.fog.blend} onChange={(e) => patchFog({ blend: Number(e.target.value) })}>
                      <option value={0}>{t('map_settings_blend_normal')}</option>
                      <option value={1}>{t('map_settings_blend_add')}</option>
                      <option value={2}>{t('map_settings_blend_sub')}</option>
                      <option value={3}>{t('map_settings_blend_mult')}</option>
                    </SmallSelect>
                  </Row>
                  <Row>
                    <Dim style={{ minWidth: 52 }}>{t('map_settings_zoom')}</Dim>
                    <SmallInput type="number" min={1} value={entry.fog.zoom} onChange={(e) => patchFog({ zoom: Math.max(1, Number(e.target.value) || 100) })} />
                    <Dim>%</Dim>
                  </Row>
                  <Row>
                    <Dim style={{ minWidth: 52 }}>{t('map_settings_scroll')}</Dim>
                    <Dim>{t('map_settings_sx')}</Dim>
                    <SmallInput type="number" value={entry.fog.sx} onChange={(e) => patchFog({ sx: Number(e.target.value) || 0 })} />
                    <Dim>{t('map_settings_sy')}</Dim>
                    <SmallInput type="number" value={entry.fog.sy} onChange={(e) => patchFog({ sy: Number(e.target.value) || 0 })} />
                  </Row>
                  <Row>
                    <Dim style={{ minWidth: 52 }}>{t('map_settings_offset')}</Dim>
                    <Dim>{t('map_settings_ox')}</Dim>
                    <SmallInput type="number" value={entry.fog.ox} onChange={(e) => patchFog({ ox: Math.round(Number(e.target.value) || 0) })} />
                    <Dim>{t('map_settings_oy')}</Dim>
                    <SmallInput type="number" value={entry.fog.oy} onChange={(e) => patchFog({ oy: Math.round(Number(e.target.value) || 0) })} />
                  </Row>
                </>
              )}
            </Section>

            <Section>
              <SectionTitle>{t('map_settings_panorama')}</SectionTitle>
              <GraphicField folder="panoramas" files={panoramaFiles} asset={entry.panorama} onPatch={patchPanorama} />
              {assetHasGraphic(entry.panorama) && (
                <Row>
                  <Dim style={{ minWidth: 52 }}>{t('map_settings_hue')}</Dim>
                  <input type="range" min={0} max={360} value={entry.panorama.hue} style={{ flex: 1, minWidth: 0 }} onChange={(e) => patchPanorama({ hue: Number(e.target.value) })} />
                  <SmallInput type="number" min={0} max={360} value={entry.panorama.hue} onChange={(e) => patchPanorama({ hue: clamp(Number(e.target.value) || 0, 0, 360) })} />
                </Row>
              )}
            </Section>

            <Section>
              <SectionTitle>{t('map_settings_battleback')}</SectionTitle>
              <GraphicField folder="battlebacks" files={battlebackFiles} asset={entry.battleback} onPatch={patchBattleback} />
            </Section>
          </Controls>

          <PreviewPane>
            <FogPreview
              snapshotUrl={overviewUrl || null}
              fogName={representativeFogName(entry.fog)}
              hue={entry.fog.hue}
              opacity={entry.fog.opacity}
              blend={entry.fog.blend}
              zoom={entry.fog.zoom}
              sx={entry.fog.sx}
              sy={entry.fog.sy}
              ox={entry.fog.ox}
              oy={entry.fog.oy}
              height={560}
              mapWidthTiles={meta.width}
              mapHeightTiles={meta.height}
              onOffsetChange={(dOx, dOy) => patchFog({ ox: Math.round(entry.fog.ox + dOx), oy: Math.round(entry.fog.oy + dOy) })}
            />
          </PreviewPane>
        </Body>
        <Footer>
          <FooterBtn $primary onClick={onClose}>{t('map_settings_done')}</FooterBtn>
        </Footer>
      </Dialog>
    </Scrim>
  );
};

/** Loads the graphic file lists (fogs / panoramas / battlebacks) for the dialog. */
export const useMapGraphicFiles = () => {
  const [{ projectPath }] = useGlobalState();
  const [fogFiles, setFogFiles] = useState<string[]>([]);
  const [panoramaFiles, setPanoramaFiles] = useState<string[]>([]);
  const [battlebackFiles, setBattlebackFiles] = useState<string[]>([]);
  const exts = useMemo(() => ['.png', '.gif', '.jpg', '.jpeg', '.bmp'], []);

  useEffect(() => {
    if (!projectPath) return;
    const grab = (folder: string, set: (v: string[]) => void) =>
      window.api.getFilePathsFromFolder(
        { folderPath: `${projectPath}/graphics/${folder}`, extensions: exts, isFileNameOnly: true },
        // PSDK's fog/panorama/battleback loaders (RPG::Cache) want the BARE name —
        // strip any path prefix and extension, exactly like the event editor's
        // fog/panorama/battleback pickers (CommandListEditor).
        ({ filePaths }) =>
          set(
            filePaths
              .map((f) => f.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, ''))
              .sort((a, b) => a.localeCompare(b))
          ),
        () => set([])
      );
    grab('fogs', setFogFiles);
    grab('panoramas', setPanoramaFiles);
    grab('battlebacks', setBattlebackFiles);
  }, [projectPath, exts]);

  return { fogFiles, panoramaFiles, battlebackFiles };
};
