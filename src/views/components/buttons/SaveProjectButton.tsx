import styled from 'styled-components';
import React, { useMemo, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import theme from '@src/AppTheme';
import { BaseIcon } from '@components/icons/BaseIcon';
import SvgContainer from '@components/icons/BaseIcon/SvgContainer';

import { BaseButtonStyle } from './GenericButtons';
import { useProjectSave } from '@hooks/useProjectSave';
import { useLoaderRef } from '@utils/loaderContext';
import { StudioShortcutActions, useShortcut } from '@hooks/useShortcuts';
import { useDialogsRef } from '@hooks/useDialogsRef';
import { SaveEditorAndDeletionKeys, SaveEditorOverlay } from '@components/save/SaveEditorOverlay';
import {
  getMapEditorSaveTargets,
  getSaveShortcutOverride,
  setProjectSaveRunner,
  subscribeMapEditorSaveTargets,
} from '@hooks/saveShortcutOverride';
import { clearAllPendingEdits, getPendingEdits, subscribePendingEdits } from '@src/custom/MapEditor/pendingEdits';
import { flushPendingMapEdits } from '@src/custom/MapEditor/flushPendingEdits';
import { ConfirmDeleteDialog } from '@src/custom/MapEditor/ConfirmDeleteDialog';
import { flushGrottoSave, getGrottoPending, subscribeGrottoPending } from '@src/custom/Grotto/grottoPendingSave';
import { flushSosSave, getSosPending, subscribeSosPending } from '@src/custom/SOS/sosPendingSave';
import { flushSwitchesVariablesSave, getSwitchesVariablesPending, subscribeSwitchesVariablesPending } from '@src/custom/SwitchesVariables/switchesVariablesPendingSave';
import { flushOutfitSave, getOutfitPending, subscribeOutfitPending } from '@src/custom/Outfits/outfitPendingSave';
import { flushAmbientCriesSave, getAmbientCriesPending, subscribeAmbientCriesPending } from '@src/custom/AmbientCries/ambientCriesPendingSave';
import { flushCraftingSave, getCraftingPending, subscribeCraftingPending } from '@src/custom/Crafting/craftingPendingSave';
import { flushCriticalHealthAudioSave, getCriticalHealthAudioPending, subscribeCriticalHealthAudioPending } from '@src/custom/CriticalHealthAudio/criticalHealthAudioPendingSave';
import { flushMapSettingsSave, getMapSettingsPending, subscribeMapSettingsPending } from '@src/custom/MapSettings/mapSettingsPendingSave';
import { flushTypeChartsSave, getTypeChartsPending, subscribeTypeChartsPending } from '@src/custom/TypeCharts/typeChartsPendingSave';
import { useProjectMaps } from '@hooks/useProjectData';
import { useGlobalState } from '@src/GlobalStateProvider';
import { playSound } from '@utils/sound';

/**
 * Fork-owned split button. Clicking it still does "save all"; hovering opens a
 * breakdown so you can write just one thing — mirroring how PlayButton exposes
 * its release/debug/worldmap modes.
 *
 * "Save maps" and "Save events" act on the map open in the map editor (published
 * through the saveShortcutOverride registry), so they're disabled anywhere else.
 */

const SaveMenuContainer = styled.div`
  position: fixed;
  left: 60px;
  bottom: 16px;
  width: 256px;
  z-index: 100;
  cursor: default;

  & .save-menu {
    width: 240px;
    margin-left: 16px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    box-sizing: border-box;
    padding: 8px;
    background-color: ${({ theme: t }) => t.colors.dark20};
    border-radius: 8px;

    & span.entry {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 8px 16px 8px 16px;
      border-radius: 8px;
      ${({ theme: t }) => t.fonts.normalRegular};
      color: ${({ theme: t }) => t.colors.text400};
      user-select: none;
      cursor: pointer;

      &:hover {
        background-color: ${({ theme: t }) => t.colors.dark22};
      }

      &[data-disabled='true'] {
        color: ${({ theme: t }) => t.colors.text600};
        cursor: default;

        &:hover {
          background-color: transparent;
        }
      }
    }

    & hr {
      border: none;
      border-top: 1px solid ${({ theme: t }) => t.colors.dark22};
      margin: 4px 8px;
      width: calc(100% - 16px);
    }
  }
`;

/** Marks a menu entry that currently has something unsaved. */
const PendingDot = styled.span`
  width: 8px;
  height: 8px;
  border-radius: 100%;
  flex: none;
  background-color: ${({ theme: t }) => t.colors.dangerBase};
`;

const SaveProjectButtonContainer = styled(BaseButtonStyle)`
  display: inline-block;
  width: 48px;
  height: 48px;
  border-radius: 8px;
  padding: 14px 6px 6px 14px;

  &[data-disabled] {
    background-color: ${theme.colors.dark16};
  }

  &:hover {
    background-color: ${theme.colors.dark18};
  }

  &:active > ${SvgContainer} {
    background-color: ${theme.colors.primarySoft};

    svg {
      color: ${theme.colors.primaryBase};
    }
  }
`;

const SplitContainer = styled.div`
  position: relative;
  display: flex;
  align-items: center;

  & span.triangle {
    position: absolute;
    display: inline-block;
    bottom: 6px;
    right: 4px;
    height: 0;
    width: 0;
    border-bottom: 4px solid ${({ theme: t }) => t.colors.text600};
    border-left: 4px solid transparent;
    pointer-events: none;
  }

  &.open ${SaveMenuContainer} {
    visibility: visible;
    transition: visibility 0s ease-in 300ms;
  }

  ${SaveMenuContainer} {
    visibility: hidden;
  }
`;

const BadgeContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
`;

type BadgeProps = {
  visible: boolean;
};

const Badge = styled.div<BadgeProps>`
  ${({ visible }) => !visible && 'display: none;'}
  border-radius: 100%;
  background-color: ${theme.colors.dangerBase};
  width: 8px;
  height: 8px;
`;

export const SaveProjectButton = () => {
  const { isDataToSave, isMapsToSave, save } = useProjectSave();
  const [{ projectPath }] = useGlobalState();
  const { projectDataValues: maps } = useProjectMaps();
  const loaderRef = useLoaderRef();
  const dialogsRef = useDialogsRef<SaveEditorAndDeletionKeys>();
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  // The map editor publishes its save handles while it's mounted.
  const mapTargets = useSyncExternalStore(subscribeMapEditorSaveTargets, getMapEditorSaveTargets);
  // Map edits held in memory. They survive navigating between maps, but not
  // quitting — so closing with any pending is the one moment work is lost.
  const pendingEdits = useSyncExternalStore(subscribePendingEdits, getPendingEdits);
  // Unsaved Hidden Grottos config, parked the same way so this one button owns it.
  const grottoPending = useSyncExternalStore(subscribeGrottoPending, getGrottoPending);
  // Unsaved SOS-battle config, parked identically so it rides the same button.
  const sosPending = useSyncExternalStore(subscribeSosPending, getSosPending);
  // Unsaved switch/variable name edits (System.rxdata), same parking pattern.
  const svPending = useSyncExternalStore(subscribeSwitchesVariablesPending, getSwitchesVariablesPending);
  // Unsaved Easy Outfits config, parked identically so it rides the same button.
  const outfitPending = useSyncExternalStore(subscribeOutfitPending, getOutfitPending);
  // Unsaved Ambient Cries config, parked identically so it rides the same button.
  const ambientCriesPending = useSyncExternalStore(subscribeAmbientCriesPending, getAmbientCriesPending);
  // Unsaved Crafting config, parked identically so it rides the same button.
  const craftingPending = useSyncExternalStore(subscribeCraftingPending, getCraftingPending);
  // Unsaved Critical Health Audio config, parked identically so it rides the same button.
  const criticalHealthAudioPending = useSyncExternalStore(subscribeCriticalHealthAudioPending, getCriticalHealthAudioPending);
  // Unsaved per-map Settings (fog/panorama/battleback), parked identically.
  const mapSettingsPending = useSyncExternalStore(subscribeMapSettingsPending, getMapSettingsPending);
  // Unsaved alternative type charts, parked identically.
  const typeChartsPending = useSyncExternalStore(subscribeTypeChartsPending, getTypeChartsPending);
  const [closeGuard, setCloseGuard] = useState(false);

  // Let the map editor's save dialog reach the project pipeline: writing map
  // files alone does not make the change take effect.
  React.useEffect(() => {
    setProjectSaveRunner(() => void handleSave());
    return () => setProjectSaveRunner(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMapsToSave, isDataToSave]);

  React.useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (getPendingEdits().length === 0) return;
      // Electron cancels the close when returnValue is set; it shows no
      // native prompt, so we raise our own instead.
      e.preventDefault();
      e.returnValue = '';
      setCloseGuard(true);
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  const handleSave = async () => {
    // Flush the Hidden Grottos config (if any) alongside the project save, so
    // this one button is all a user needs — no separate grotto save button.
    try {
      await flushGrottoSave();
      await flushSosSave();
      await flushSwitchesVariablesSave();
      await flushOutfitSave();
      await flushAmbientCriesSave();
      await flushCraftingSave();
      await flushCriticalHealthAudioSave();
      await flushMapSettingsSave();
      await flushTypeChartsSave();
    } catch (error) {
      loaderRef.current.setError('saving_project_error', error instanceof Error ? error.message : String(error));
      return;
    }
    // Outside the map editor there is no save dialog to write parked map/event
    // edits, so flush them here — the same writes the editor's Save all uses —
    // so map/event changes can be saved from anywhere, not only in the editor.
    if (!mapTargets && getPendingEdits().length > 0 && projectPath) {
      try {
        await flushPendingMapEdits(projectPath, maps);
      } catch (error) {
        loaderRef.current.setError('saving_project_error', error instanceof Error ? error.message : String(error));
        return;
      }
    }
    const skipMapWarning = localStorage.getItem('neverRemindMeMapModification') === 'true';
    if (skipMapWarning || !isMapsToSave) {
      save(
        () => {
          // Save completing is otherwise only signalled by the badge clearing —
          // easy to miss. The failure path already sounds via setError.
          playSound('success');
          loaderRef.current.close();
        },
        ({ errorMessage }) => loaderRef.current.setError('saving_project_error', errorMessage)
      );
      return;
    }
    dialogsRef.current?.openDialog('map_warning', true);
  };

  /**
   * Save all: write the map/event files, then ALWAYS run the project pipeline.
   *
   * The pipeline is what reproduces the sequence that actually makes a map take
   * effect — the same thing you get by pressing Ctrl+S (which writes the .tmx)
   * and then hitting Save all. Gating it on `isDataToSave` broke exactly that:
   * with no other project data dirty the pipeline was skipped, so saveMapInfo /
   * saveRMXPMapInfo never ran and the map warning never appeared.
   */
  const handleSaveAll = async () => {
    setIsOpen(false);
    // AWAIT the file writes before running the pipeline. Firing them off and
    // immediately saving the project meant the pipeline ran against the state
    // from before the map was written — which is why a single Save all did not
    // take effect and a second one did.
    //
    // Events first, then maps: writing events rewrites Data/Map###.rxdata, so
    // saving the .tmx last keeps the source newest.
    // Anything unsaved in the map editor gets confirmed first: the same dialog
    // the menu entries use, so "what am I about to write" is always an explicit
    // choice rather than a silent side effect of Save all. The dialog carries
    // on into the project pipeline itself once the files are written.
    if (mapTargets?.mapDirty || mapTargets?.eventsDirty) {
      mapTargets.openSaveDialog(true);
      return;
    }
    await handleSave();
  };

  const runMenuAction = (enabled: boolean, action?: () => void) => {
    if (!enabled || !action) return;
    setIsOpen(false);
    action();
  };

  // Grotto and SOS configs count as project data — they save via "Save data", never maps/events.
  const dataToSave =
    isDataToSave || !!grottoPending || !!sosPending || !!svPending || !!outfitPending || !!ambientCriesPending || !!craftingPending || !!criticalHealthAudioPending || !!mapSettingsPending || !!typeChartsPending;
  // `mapTargets` only exists while the map editor is mounted, so relying on it
  // alone made the unsaved dot vanish the moment you left for another section.
  // The parked edits (tiles serialized on teardown, events parked on edit) live
  // on regardless, so consult them directly — the dot now persists everywhere.
  const anythingToSave = dataToSave || !!mapTargets?.mapDirty || !!mapTargets?.eventsDirty || pendingEdits.length > 0;
  const outsideMapEditor = mapTargets ? undefined : t('save_map_editor_only');

  const shortcutMap = useMemo<StudioShortcutActions>(() => {
    // No shortcut if an editor is opened and no data to save (grotto counts).
    const isShortcutEnabled = () => !document.querySelector('#dialogs')?.textContent && (isDataToSave || !!getGrottoPending() || !!getSosPending() || !!getSwitchesVariablesPending() || !!getOutfitPending() || !!getAmbientCriesPending() || !!getCraftingPending() || !!getCriticalHealthAudioPending());
    return {
      save: () => {
        // Fork-specific: the map editor route claims Ctrl+S while mounted so
        // it can save just the map (not the whole project). When claimed,
        // skip the project-save path entirely — even the dialog warning —
        // and run the override.
        const override = getSaveShortcutOverride();
        if (override) {
          override();
          return;
        }
        if (isShortcutEnabled()) handleSave();
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [save, isDataToSave]);
  useShortcut(shortcutMap);

  return (
    <>
      <SplitContainer className={isOpen ? 'open' : undefined} onMouseLeave={() => setIsOpen(false)}>
        <SaveProjectButtonContainer onMouseEnter={() => setIsOpen(true)} onClick={() => void handleSaveAll()} disabled={!anythingToSave}>
          <BaseIcon color={theme.colors.navigationIconColor} size="s" icon="save" disabled={!anythingToSave} />
          <BadgeContainer>
            <Badge visible={anythingToSave} />
          </BadgeContainer>
          <span className="triangle" />
        </SaveProjectButtonContainer>
        <SaveMenuContainer>
          <div className="save-menu">
            <span className="entry" data-disabled={!anythingToSave} onClick={() => void handleSaveAll()}>
              {t('save_all')}
              {anythingToSave && <PendingDot />}
            </span>
            <hr />
            <span className="entry" data-disabled={!dataToSave} onClick={() => runMenuAction(dataToSave, () => void handleSave())}>
              {t('save_data')}
              {dataToSave && <PendingDot />}
            </span>
            <span
              className="entry"
              data-disabled={!mapTargets?.mapDirty}
              title={outsideMapEditor}
              onClick={() => runMenuAction(!!mapTargets?.mapDirty, () => mapTargets?.openSaveDialog(false))}
            >
              {t('save_maps')}
              {mapTargets?.mapDirty && <PendingDot />}
            </span>
            <span
              className="entry"
              data-disabled={!mapTargets?.eventsDirty}
              title={outsideMapEditor}
              onClick={() => runMenuAction(!!mapTargets?.eventsDirty, () => mapTargets?.openSaveDialog(false))}
            >
              {t('save_events')}
              {mapTargets?.eventsDirty && <PendingDot />}
            </span>
          </div>
        </SaveMenuContainer>
      </SplitContainer>
      <SaveEditorOverlay ref={dialogsRef} />
      {closeGuard && (
        <ConfirmDeleteDialog
          title={t('unsaved_maps_title')}
          message={
            <>
              {t('unsaved_maps_message')}
              <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
                {pendingEdits.map((edit) => (
                  <li key={edit.dbSymbol}>
                    {edit.mapName}
                    {edit.tiles && edit.events ? ` — ${t('unsaved_maps_both')}` : edit.events ? ` — ${t('unsaved_maps_events')}` : ` — ${t('unsaved_maps_tiles')}`}
                  </li>
                ))}
              </ul>
            </>
          }
          confirmLabel={t('unsaved_maps_discard')}
          skipLabel=""
          skip={false}
          onSkipChange={() => undefined}
          onConfirm={() => {
            // Explicitly discarding — drop the parked work and let the close through.
            clearAllPendingEdits();
            setCloseGuard(false);
            window.close();
          }}
          onCancel={() => setCloseGuard(false)}
        />
      )}
    </>
  );
};
