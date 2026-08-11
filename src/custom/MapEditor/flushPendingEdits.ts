import { getPendingEdits, clearPendingEdit } from './pendingEdits';
import { buildEventsWritePayload } from './events/useMapEvents';
import { saveBytes } from './saveBytes';

/**
 * Write every parked map edit to disk from ANYWHERE in the app — not only while
 * the map editor is mounted. It performs the exact same backend writes the
 * editor's own "Save all" uses, in the same order, so the on-disk result is
 * identical: `writeRMXPEvents` for parked events, then `saveBytes` for parked
 * tiles.
 *
 * Order matters and mirrors the map editor: events first (they rewrite
 * Data/Map###.rxdata), tiles last (the .tmx stays the newest source). Each
 * entry is cleared from the pending store as it lands, so the unsaved dot drops
 * as work is written.
 *
 * `mapsByDbSymbol` resolves a parked edit's db_symbol to its numeric map id,
 * which `writeRMXPEvents` needs. Entries whose map is unknown are skipped rather
 * than guessed at.
 */
type MapIdByDbSymbol = Record<string, { id: number } | undefined>;

export const flushPendingMapEdits = async (projectPath: string, mapsByDbSymbol: MapIdByDbSymbol): Promise<void> => {
  // Events first.
  for (const edit of getPendingEdits()) {
    if (!edit.events) continue;
    const owner = mapsByDbSymbol[edit.dbSymbol];
    if (!owner) continue;
    await new Promise<void>((resolve, reject) => {
      window.api.writeRMXPEvents(
        { projectPath, mapId: owner.id, events: buildEventsWritePayload(edit.events!), skippedOnRead: 0 },
        () => {
          clearPendingEdit(edit.dbSymbol, 'events');
          resolve();
        },
        ({ errorMessage }) => reject(new Error(errorMessage))
      );
    });
  }
  // Then tiles.
  for (const edit of getPendingEdits()) {
    if (!edit.tiles) continue;
    await saveBytes(projectPath, edit.tiledFilename, edit.tiles);
    clearPendingEdit(edit.dbSymbol, 'tiles');
  }
};
