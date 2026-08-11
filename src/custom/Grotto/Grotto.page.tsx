import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';

import { ControlBar } from '@components/ControlBar';
import { DataBlockWrapper } from '@components/database/dataBlocks';
import { DataBlockWithTitleNoActive } from '@components/database/dataBlocks/DataBlockWithTitle';
import { DataBlockWithAction } from '@components/database/dataBlocks/DataBoxWithAction';
import { DarkButton, DeleteButtonWithIcon, SecondaryButtonWithPlusIcon } from '@components/buttons';
import { StudioDropDown } from '@components/StudioDropDown';
import { useGlobalState } from '@src/GlobalStateProvider';
import { useProjectMaps } from '@hooks/useProjectData';
import { useSetCurrentDatabasePath } from '@hooks/useSetCurrentDatabasePage';
import { useGetEntityNameText } from '@utils/ReadingProjectText';

import { PageContainerStyle, PageDataConstrainerStyle } from '@pages/database/PageContainerStyle';
import { MapTilePicker } from '../MapEditor/events/dialog/MapTilePicker';
import { GrottoMapPreview } from './GrottoMapPreview';
import { GrottoNewDialog } from './GrottoNewDialog';
import { GrottoWeightedItemTable } from './GrottoWeightedItemTable';
import { GrottoCreatureSummary } from './GrottoCreatureSummary';
import { GrottoCreatureEditor } from './GrottoCreatureEditor';
import { clearGrottoPending, getGrottoPending, setGrottoPending } from './grottoPendingSave';
import { buildEmptyHiddenGrottoConfig } from './types';
import type { GrottoCreatureHash, GrottoPosition, GrottoWeightedCreature, GrottoWeightedItem, HiddenGrottoConfig } from './types';

const PageGrid = styled.div`
  display: grid;
  grid-template-rows: 64px auto;
  width: 100%;
`;

// Three zones: New (left), the grotto selector centered across the bar, and
// Save pinned right — like the Zones control bar but with a centered dropdown.
const GrottoControlBar = styled(ControlBar)`
  grid-template-columns: 1fr auto 1fr;
`;

const LeftZone = styled.div`
  justify-self: start;
`;

const RightZone = styled.div`
  justify-self: end;
  display: flex;
  align-items: center;
  gap: 16px;
`;

const DropdownWrap = styled.div`
  justify-self: center;
  min-width: 280px;
`;

const BlockHint = styled.p`
  ${({ theme }) => theme.fonts.normalSmall};
  color: ${({ theme }) => theme.colors.text400};
  margin: 0 0 16px;
`;

const GlobalGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
`;

const SubHeading = styled.h3`
  ${({ theme }) => theme.fonts.normalMedium};
  color: ${({ theme }) => theme.colors.text100};
  margin: 0 0 8px;
`;

const LocationRow = styled.div`
  display: flex;
  gap: 20px;
  align-items: flex-start;
  flex-wrap: wrap;
`;

const ThumbFrame = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.dark20};
  border-radius: 8px;
  padding: 8px;
  background: ${({ theme }) => theme.colors.dark12};
`;

const LocationDetails = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  ${({ theme }) => theme.fonts.normalMedium};
  color: ${({ theme }) => theme.colors.text100};
`;

const LocationButtons = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const CreatureList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const AddBar = styled.div`
  display: flex;
  margin-top: 16px;
`;

const EmptyState = styled.span`
  ${({ theme }) => theme.fonts.normalMedium};
  color: ${({ theme }) => theme.colors.text400};
`;

const CenteredBlock = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 24px;
  text-align: center;
`;

type LoadState = { status: 'idle' | 'loading' | 'ready' } | { status: 'error'; message: string };

// The dropdown's pinned first entry: the shared, game-wide loot tables, shown
// on their own so per-map grotto content isn't tangled up with them.
const GLOBAL_KEY = '__global__';

export const GrottoPage = () => {
  const { t } = useTranslation();
  const [state] = useGlobalState();
  const projectPath = state.projectPath;
  useSetCurrentDatabasePath();

  const { projectDataValues: maps, setSelectedDataIdentifier: setSelectedMapIdentifier } = useProjectMaps();
  const getEntityName = useGetEntityNameText();
  const navigate = useNavigate();

  const [config, setConfig] = useState<HiddenGrottoConfig>(buildEmptyHiddenGrottoConfig);
  const [loadState, setLoadState] = useState<LoadState>({ status: 'idle' });
  const [selectedMapId, setSelectedMapId] = useState<string>(GLOBAL_KEY);
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [tilePickerOpen, setTilePickerOpen] = useState(false);
  // The creature editor is a draft popup: 'create' adds on commit, 'edit'
  // replaces the entry at `index` on commit. null = closed.
  const [creatureEditor, setCreatureEditor] = useState<{ mode: 'create' } | { mode: 'edit'; index: number } | null>(null);
  // Flips on the first edit so the publish effect only parks real changes.
  const dirtyRef = useRef(false);

  // Load the config once a project is open — but if there are unsaved grotto
  // edits parked from a previous visit (the bottom-left Save button hasn't
  // flushed them yet), restore those so navigating away and back never loses
  // work. Any pending for a different project is stale, so drop it.
  useEffect(() => {
    dirtyRef.current = false;
    if (!projectPath) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoadState({ status: 'idle' });
      return;
    }
    const pending = getGrottoPending();
    if (pending && pending.projectPath !== projectPath) clearGrottoPending();
    if (pending && pending.projectPath === projectPath) {
      dirtyRef.current = true;
      setConfig(pending.config);
      setLoadState({ status: 'ready' });
      return;
    }
    setLoadState({ status: 'loading' });
    const cancel = window.api.readHiddenGrotto(
      { projectPath },
      ({ config: loaded }) => {
        setConfig(loaded as HiddenGrottoConfig);
        setLoadState({ status: 'ready' });
      },
      ({ errorMessage }) => setLoadState({ status: 'error', message: errorMessage })
    );
    return cancel;
  }, [projectPath]);

  const markDirty = () => {
    dirtyRef.current = true;
  };

  // Park edits in the shared save store so the bottom-left "Save data" button
  // owns them — grotto config has no separate save button of its own.
  useEffect(() => {
    if (!dirtyRef.current || !projectPath) return;
    setGrottoPending(projectPath, config);
  }, [config, projectPath]);

  // "Existing grottos" = every map id that appears in any per-map structure.
  const grottoMapIds = useMemo(() => {
    const ids = new Set<string>([
      ...Object.keys(config.unique_items),
      ...Object.keys(config.unique_pokemon),
      ...Object.keys(config.grotto_positions ?? {}),
    ]);
    return [...ids].sort((a, b) => Number(a) - Number(b));
  }, [config]);

  const mapName = useCallback(
    (id: string) => {
      const numId = Number(id);
      const map = Object.values(maps).find((m) => m.id === numId);
      return `[${id}] ${getEntityName({ klass: 'Map', id: numId }) || map?.dbSymbol || id}`;
    },
    [maps, getEntityName]
  );

  // The selector always offers "Global loot" first, then one entry per grotto.
  const dropdownOptions = useMemo(
    () => [{ value: GLOBAL_KEY, label: t('grotto_global_loot') }, ...grottoMapIds.map((id) => ({ value: id, label: mapName(id) }))],
    [grottoMapIds, mapName, t]
  );

  // Derive the effective selection instead of storing-and-syncing it: a real
  // grotto if one is picked, otherwise the Global loot view (also the fallback
  // when the selected grotto was just deleted). Writes go through
  // setSelectedMapId (dropdown, create).
  const effectiveSelectedId = grottoMapIds.includes(selectedMapId) ? selectedMapId : GLOBAL_KEY;
  const isGrottoView = effectiveSelectedId !== GLOBAL_KEY;

  const selectedMap = useMemo(
    () => (isGrottoView ? Object.values(maps).find((m) => String(m.id) === effectiveSelectedId) : undefined),
    [maps, effectiveSelectedId, isGrottoView]
  );
  const currentPosition: GrottoPosition | undefined = isGrottoView ? config.grotto_positions?.[effectiveSelectedId] : undefined;
  const currentUniqueItems = isGrottoView ? config.unique_items[effectiveSelectedId] ?? [] : [];
  const currentUniquePokemon = isGrottoView ? config.unique_pokemon[effectiveSelectedId] ?? [] : [];

  const updateGlobalItems = (key: 'visible_items' | 'hidden_items') => (entries: GrottoWeightedItem[]) => {
    setConfig((prev) => ({ ...prev, [key]: entries }));
    markDirty();
  };

  const setMapUniqueItems = (entries: GrottoWeightedItem[]) => {
    if (!isGrottoView) return;
    setConfig((prev) => {
      const next = { ...prev.unique_items };
      if (entries.length === 0) delete next[effectiveSelectedId];
      else next[effectiveSelectedId] = entries;
      return { ...prev, unique_items: next };
    });
    markDirty();
  };

  const setMapUniquePokemon = (entries: GrottoWeightedCreature[]) => {
    if (!isGrottoView) return;
    setConfig((prev) => {
      const next = { ...prev.unique_pokemon };
      if (entries.length === 0) delete next[effectiveSelectedId];
      else next[effectiveSelectedId] = entries;
      return { ...prev, unique_pokemon: next };
    });
    markDirty();
  };

  const setMapPosition = (mapId: string, pos: GrottoPosition | null) => {
    setConfig((prev) => {
      const next = { ...(prev.grotto_positions ?? {}) };
      if (pos) next[mapId] = pos;
      else delete next[mapId];
      return { ...prev, grotto_positions: next };
    });
    markDirty();
  };

  // Open the draft popup; the creature is only appended when the user commits.
  const openAddCreature = () => setCreatureEditor({ mode: 'create' });

  const commitCreature = (hash: GrottoCreatureHash) => {
    if (creatureEditor?.mode === 'edit') {
      const idx = creatureEditor.index;
      setMapUniquePokemon(currentUniquePokemon.map((entry, i) => (i === idx ? [entry[0], hash] : entry)));
    } else {
      setMapUniquePokemon([...currentUniquePokemon, [1, hash]]);
    }
  };

  const removeCreature = (index: number) => {
    setMapUniquePokemon(currentUniquePokemon.filter((_, i) => i !== index));
    setCreatureEditor(null);
  };

  const pokemonTotal = currentUniquePokemon.reduce((sum, [weight]) => sum + (weight > 0 ? weight : 0), 0);

  const createGrotto = (mapId: string, x: number, y: number) => {
    setMapPosition(mapId, [x, y]);
    setSelectedMapId(mapId);
    setNewDialogOpen(false);
  };

  // Open this grotto's map in the map editor so the user can place/edit its
  // anchor event. Selects the map, then routes to the Tiled/overview editor.
  const jumpToMap = () => {
    if (!selectedMap) return;
    setSelectedMapIdentifier({ map: selectedMap.dbSymbol });
    navigate('/world/overview');
  };

  const deleteGrotto = () => {
    if (!isGrottoView) return;
    const mapId = effectiveSelectedId;
    setConfig((prev) => {
      const uItems = { ...prev.unique_items };
      const uPoke = { ...prev.unique_pokemon };
      const pos = { ...(prev.grotto_positions ?? {}) };
      delete uItems[mapId];
      delete uPoke[mapId];
      delete pos[mapId];
      return { ...prev, unique_items: uItems, unique_pokemon: uPoke, grotto_positions: pos };
    });
    markDirty();
  };

  const ready = loadState.status === 'ready';

  return (
    <PageGrid>
      <GrottoControlBar>
        <LeftZone>
          <SecondaryButtonWithPlusIcon onClick={() => setNewDialogOpen(true)} disabled={!ready}>
            {t('grotto_new_button')}
          </SecondaryButtonWithPlusIcon>
        </LeftZone>
        <DropdownWrap>
          <StudioDropDown
            value={effectiveSelectedId}
            options={dropdownOptions}
            onChange={(value) => {
              setSelectedMapId(value);
              setCreatureEditor(null);
            }}
          />
        </DropdownWrap>
        {/* Right zone kept empty so the selector stays centred; grotto edits are
            saved from the app's bottom-left "Save data" button, not here. */}
        <RightZone />
      </GrottoControlBar>

      <PageContainerStyle>
        <PageDataConstrainerStyle>
          {!projectPath && <EmptyState>{t('grotto_no_project')}</EmptyState>}
          {loadState.status === 'loading' && <EmptyState>{t('grotto_loading')}</EmptyState>}
          {loadState.status === 'error' && <EmptyState>{t('grotto_load_error', { error: loadState.message })}</EmptyState>}

          {ready && !isGrottoView && (
            <>
              <DataBlockWrapper>
                <DataBlockWithTitleNoActive title={t('grotto_global_loot')} size="full">
                  <BlockHint>{t('grotto_global_loot_hint')}</BlockHint>
                  <GlobalGroup>
                    <div>
                      <SubHeading>{t('grotto_visible_items')}</SubHeading>
                      <GrottoWeightedItemTable entries={config.visible_items} onChange={updateGlobalItems('visible_items')} />
                    </div>
                    <div>
                      <SubHeading>{t('grotto_hidden_items')}</SubHeading>
                      <GrottoWeightedItemTable entries={config.hidden_items} onChange={updateGlobalItems('hidden_items')} />
                    </div>
                  </GlobalGroup>
                </DataBlockWithTitleNoActive>
              </DataBlockWrapper>

              {grottoMapIds.length === 0 && (
                <DataBlockWrapper>
                  <DataBlockWithTitleNoActive title={t('grotto_title')} size="full">
                    <CenteredBlock>
                      <EmptyState>{t('grotto_empty_prompt')}</EmptyState>
                      <SecondaryButtonWithPlusIcon onClick={() => setNewDialogOpen(true)}>
                        {t('grotto_new_button')}
                      </SecondaryButtonWithPlusIcon>
                    </CenteredBlock>
                  </DataBlockWithTitleNoActive>
                </DataBlockWrapper>
              )}
            </>
          )}

          {ready && isGrottoView && (
                <>
                  <DataBlockWrapper>
                    <DataBlockWithTitleNoActive title={t('grotto_location')} size="full">
                      <BlockHint>{t('grotto_position_hint')}</BlockHint>
                      <LocationRow>
                        {selectedMap?.tiledFilename && (
                          <ThumbFrame>
                            <GrottoMapPreview
                              key={selectedMap.tiledFilename}
                              tiledFilename={selectedMap.tiledFilename}
                              marker={currentPosition ? { x: currentPosition[0], y: currentPosition[1] } : null}
                              fitWidth={320}
                              fitHeight={220}
                            />
                          </ThumbFrame>
                        )}
                        <LocationDetails>
                          <span>{mapName(effectiveSelectedId)}</span>
                          <span>
                            {currentPosition
                              ? t('grotto_position_value', { x: currentPosition[0], y: currentPosition[1] })
                              : t('grotto_position_unset')}
                          </span>
                          <LocationButtons>
                            <DarkButton onClick={() => setTilePickerOpen(true)} disabled={!selectedMap?.tiledFilename}>
                              {currentPosition ? t('grotto_position_change') : t('grotto_position_pick')}
                            </DarkButton>
                            <DarkButton onClick={jumpToMap} disabled={!selectedMap}>
                              {t('grotto_jump_to_map')}
                            </DarkButton>
                          </LocationButtons>
                        </LocationDetails>
                      </LocationRow>
                    </DataBlockWithTitleNoActive>
                  </DataBlockWrapper>

                  <DataBlockWrapper>
                    <DataBlockWithTitleNoActive title={t('grotto_unique_pokemon')} size="full">
                      <BlockHint>{t('grotto_unique_pokemon_hint')}</BlockHint>
                      {currentUniquePokemon.length === 0 && <EmptyState>{t('grotto_no_creatures')}</EmptyState>}
                      <CreatureList>
                        {currentUniquePokemon.map(([weight, hash], index) => {
                          const percent = pokemonTotal > 0 && weight > 0 ? ((weight / pokemonTotal) * 100).toFixed(1) : '0';
                          return (
                            <GrottoCreatureSummary
                              key={index}
                              index={index}
                              weight={weight}
                              hash={hash}
                              percent={percent}
                              onChangeWeight={(nextWeight) =>
                                setMapUniquePokemon(
                                  currentUniquePokemon.map((entry, i) => (i === index ? [nextWeight, entry[1]] : entry))
                                )
                              }
                              onEdit={() => setCreatureEditor({ mode: 'edit', index })}
                              onRemove={() => removeCreature(index)}
                            />
                          );
                        })}
                      </CreatureList>
                      <AddBar>
                        <SecondaryButtonWithPlusIcon onClick={openAddCreature}>{t('grotto_add_creature')}</SecondaryButtonWithPlusIcon>
                      </AddBar>
                    </DataBlockWithTitleNoActive>
                  </DataBlockWrapper>

                  <DataBlockWrapper>
                    <DataBlockWithTitleNoActive title={t('grotto_unique_items')} size="full">
                      <BlockHint>{t('grotto_unique_items_hint')}</BlockHint>
                      <GrottoWeightedItemTable entries={currentUniqueItems} onChange={setMapUniqueItems} />
                    </DataBlockWithTitleNoActive>
                  </DataBlockWrapper>

                  <DataBlockWrapper>
                    <DataBlockWithAction title={t('grotto_deletion')} size="full">
                      <DeleteButtonWithIcon onClick={deleteGrotto}>{t('grotto_delete')}</DeleteButtonWithIcon>
                    </DataBlockWithAction>
                  </DataBlockWrapper>
                </>
          )}
        </PageDataConstrainerStyle>
      </PageContainerStyle>

      {newDialogOpen && (
        <GrottoNewDialog existingMapIds={grottoMapIds} onCreate={createGrotto} onClose={() => setNewDialogOpen(false)} />
      )}

      {creatureEditor && (creatureEditor.mode === 'create' || currentUniquePokemon[creatureEditor.index]) && (
        <GrottoCreatureEditor
          mode={creatureEditor.mode}
          initialHash={creatureEditor.mode === 'edit' ? currentUniquePokemon[creatureEditor.index][1] : { id: '', level: 1 }}
          onCommit={commitCreature}
          onClose={() => setCreatureEditor(null)}
        />
      )}

      {tilePickerOpen && selectedMap?.tiledFilename && (
        <MapTilePicker
          tiledFilename={selectedMap.tiledFilename}
          mapName={mapName(effectiveSelectedId)}
          x={currentPosition?.[0] ?? 0}
          y={currentPosition?.[1] ?? 0}
          onConfirm={(x, y) => {
            setMapPosition(effectiveSelectedId, [x, y]);
            setTilePickerOpen(false);
          }}
          onClose={() => setTilePickerOpen(false)}
        />
      )}
    </PageGrid>
  );
};
