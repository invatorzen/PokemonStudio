import { useCallback, useEffect, useRef, useState } from 'react';
import type { WriteRMXPEvent, WriteRMXPEventPage } from '@src/backendTasks/writeRMXPEvents';
import { createEmptyEvent, createEmptyPage, nextEventId } from './rmxpEventUtils';

/**
 * Fork-only hook: RMXP events for the current map, loaded from
 * Data/Map###.rxdata and saved back through writeRMXPEvents.
 *
 * Every page carries `__source` provenance (original event/page index) so
 * the backend can carry over the ORIGINAL command list + move route for
 * pages that already existed — command lists are read-only in this
 * iteration and never rebuilt from renderer JSON (see writeRMXPEvents).
 */

export type MapEvent = WriteRMXPEvent;
export type MapEventPage = WriteRMXPEventPage;

/**
 * `mapWidth`/`mapHeight` come from the .tmx the editor has open. They're only
 * used when the map has no Data/Map###.rxdata yet — a map authored in Studio
 * doesn't get one until PSDK's Tiled2Rxdata runs at game boot, and without a
 * size the backend can't synthesize the blank map to write the events into.
 */
/**
 * Convert working events into the backend's edit protocol.
 *
 * Standalone (not buried in `save`) so a map that ISN'T currently open can be
 * written too — the multi-map save path holds parked events for other maps and
 * needs the identical conversion. Diverging the two would mean parked maps get
 * written by different rules than the live one.
 */
export const buildEventsWritePayload = (events: MapEvent[]) => {
  return events.map((event) => ({
    ...event,
    pages: event.pages.map((page) => {
      const list = page.list as (typeof page.list)[number][] & { __keep?: number }[];
      const routeList = page.moveRoute.list as (typeof page.moveRoute.list)[number][] & { __keep?: number }[];
      // A list/route still in its original order AND length is carried
      // byte-faithfully by the backend — only ship an edit protocol when it
      // changed. The length check matters: deleting only trailing entries
      // also leaves a sequential __keep run, and without it that deletion
      // would be silently thrown away on save.
      const source = page.__source;
      // An indent-only change (dragging a command into a branch) leaves both
      // the order and the length intact, so `__keep === i` alone would call it
      // untouched and silently throw the re-indent away — which un-nests the
      // command and makes its branch run unconditionally.
      const listUntouched =
        !!source &&
        list.length === source.listLength &&
        list.every((cmd, i) => (cmd as { __keep?: number }).__keep === i && cmd.indent === source.listIndents?.[i]);
      const routeUntouched =
        !!source && routeList.length === source.routeLength && routeList.every((cmd, i) => (cmd as { __keep?: number }).__keep === i);
      if (listUntouched && routeUntouched) return page;
      return {
        ...page,
        ...(listUntouched
          ? {}
          : {
              editedList: list.map((cmd) => {
                const keep = (cmd as { __keep?: number }).__keep;
                // A kept command still carries its CURRENT indent — it may have
                // been re-indented while being carried verbatim otherwise.
                return keep !== undefined
                  ? { keep, indent: cmd.indent }
                  : { code: cmd.code, indent: cmd.indent, parameters: cmd.parameters };
              }),
            }),
        ...(routeUntouched
          ? {}
          : {
              editedMoveRoute: {
                repeat: page.moveRoute.isRepeat,
                skippable: page.moveRoute.isSkippable,
                list: routeList.map((cmd) => {
                  const keep = (cmd as { __keep?: number }).__keep;
                  return keep !== undefined ? { keep } : { code: cmd.code, parameters: cmd.parameters };
                }),
              },
            }),
      };
    }),
  }));
};

export const useMapEvents = (
  projectPath: string | null,
  mapId: number | undefined,
  mapWidth?: number,
  mapHeight?: number,
  tiledFilename?: string,
  /**
   * Unsaved events parked from an earlier visit to this map. When it returns
   * a list we adopt it instead of re-reading the .rxdata, so moving between
   * maps keeps event edits in progress.
   */
  getSeedEvents?: (mapId: number) => MapEvent[] | undefined,
) => {
  const [events, setEvents] = useState<MapEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  // Events present in the file that failed to load. Non-zero means saving
  // would delete them, so we refuse — see readRMXPEvents' ReadRMXPEventOutput.
  const [skipped, setSkipped] = useState(0);
  // Which map `events` was actually loaded from. reload() is async, so after a
  // map switch `mapId` is already the new map while `events` still holds the
  // old one's — saving in that window would write the previous map's events
  // over this one. Compare rather than trust `loading`, which is false in the
  // gap between the id changing and the fetch starting.
  const [loadedMapId, setLoadedMapId] = useState<number | null>(null);

  // Read through a ref so reload's identity doesn't churn every render.
  const getSeedRef = useRef(getSeedEvents);
  getSeedRef.current = getSeedEvents;

  // ── Undo/redo for event edits ────────────────────────────────────────
  // A SEPARATE timeline from the tile-cell history in MapEditorPage: event
  // edits (create / delete / move / edit / duplicate) save through a
  // different pipeline (writeRMXPEvents → .rxdata) with their own dirty flag,
  // so they get their own stack rather than being interleaved with tile
  // actions. MapEditorPage routes Ctrl+Z / the toolbar Undo button here when
  // it's in Events mode.
  //
  // Each past/future entry is a full snapshot of the `events` array as it was
  // BEFORE (past) / AFTER (future) a mutation. Snapshotting the array by
  // reference is cheap and correct because every mutator below builds NEW
  // event and array objects and never mutates an existing MapEvent in place —
  // so a snapshot's element references keep pointing at the captured state
  // even after `events` is replaced.
  const EVENT_HISTORY_LIMIT = 200;
  const eventsRef = useRef<MapEvent[]>([]);
  const historyPastRef = useRef<MapEvent[][]>([]);
  const historyFutureRef = useRef<MapEvent[][]>([]);
  const [historyEpoch, setHistoryEpoch] = useState(0);
  const bumpHistory = useCallback(() => setHistoryEpoch((n) => n + 1), []);

  // Keep the ref in lockstep with state so mutators read the current array
  // synchronously and snapshots capture the exact pre-mutation state.
  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  /** Drop the undo history — called whenever `events` is (re)loaded wholesale
   *  (map switch, fresh read, or a save-then-reload). eventsRef re-syncs via
   *  the effect above before any user action can push a new entry. */
  const clearHistory = useCallback(() => {
    historyPastRef.current = [];
    historyFutureRef.current = [];
    bumpHistory();
  }, [bumpHistory]);

  /** Apply a new events array, recording the pre-state for undo. */
  const commit = useCallback((next: MapEvent[]) => {
    historyPastRef.current.push(eventsRef.current);
    if (historyPastRef.current.length > EVENT_HISTORY_LIMIT) historyPastRef.current.shift();
    historyFutureRef.current = [];
    eventsRef.current = next;
    setEvents(next);
    setDirty(true);
    bumpHistory();
  }, [bumpHistory]);

  const undo = useCallback(() => {
    const prev = historyPastRef.current.pop();
    if (prev === undefined) return;
    historyFutureRef.current.push(eventsRef.current);
    eventsRef.current = prev;
    setEvents(prev);
    setDirty(true);
    bumpHistory();
  }, [bumpHistory]);

  const redo = useCallback(() => {
    const next = historyFutureRef.current.pop();
    if (next === undefined) return;
    historyPastRef.current.push(eventsRef.current);
    eventsRef.current = next;
    setEvents(next);
    setDirty(true);
    bumpHistory();
  }, [bumpHistory]);

  // Plain render-time reads (matching MapEditorPage's tile-history buttons):
  // every stack mutation calls bumpHistory, so `historyEpoch` re-renders the
  // consumer and these recompute. `historyEpoch` is referenced here purely to
  // tie the recompute to that state.
  void historyEpoch;
  const canUndo = historyPastRef.current.length > 0;
  const canRedo = historyFutureRef.current.length > 0;

  const reload = useCallback(() => {
    if (!projectPath || mapId === undefined) return;
    // Parked edits win over the file — they're strictly newer.
    const seeded = getSeedRef.current?.(mapId);
    if (seeded) {
      setEvents(seeded);
      setSkipped(0);
      setLoadedMapId(mapId);
      setError(null);
      setDirty(true);
      setLoading(false);
      clearHistory();
      return;
    }
    setLoading(true);
    window.api.readRMXPEvents(
      { projectPath, mapId },
      ({ rmxpEvents, skipped: skippedOnRead }) => {
        // Stamp provenance: each existing page points at itself in the file,
        // and each command remembers its original index (`__keep`) so command
        // edits can reference untouched originals byte-faithfully on save.
        setEvents(
          rmxpEvents.map((event) => ({
            ...event,
            pages: event.pages.map((page, pageIndex) => ({
              ...page,
              // Record the ORIGINAL lengths too: a trailing-only deletion also
              // leaves a sequential __keep run, so length is what distinguishes
              // it from "unchanged" (see save()). `listIndents` does the same job
              // for a re-indent, which changes neither order nor length.
              __source: {
                eventId: event.id,
                pageIndex,
                listLength: page.list.length,
                listIndents: page.list.map((cmd) => cmd.indent),
                routeLength: page.moveRoute.list.length,
              },
              list: page.list.map((cmd, cmdIndex) => ({ ...cmd, __keep: cmdIndex })),
              // Same provenance for the move route: an untouched command (e.g. a
              // Play SE holding an RPG::AudioFile) is carried over verbatim.
              moveRoute: {
                ...page.moveRoute,
                list: page.moveRoute.list.map((cmd, cmdIndex) => ({ ...cmd, __keep: cmdIndex })),
              },
            })),
          })),
        );
        setSkipped(skippedOnRead);
        setLoadedMapId(mapId);
        setError(null);
        setDirty(false);
        setLoading(false);
        clearHistory();
      },
      ({ errorMessage }) => {
        // Maps created purely by Studio may have no rxdata yet — treat as empty.
        setEvents([]);
        setSkipped(0);
        setLoadedMapId(mapId);
        setError(errorMessage);
        setDirty(false);
        setLoading(false);
        clearHistory();
      },
    );
  }, [projectPath, mapId, clearHistory]);

  useEffect(() => reload(), [reload]);

  const save = useCallback((): Promise<string | null> => {
    if (!projectPath || mapId === undefined) return Promise.resolve('No map loaded');
    if (loadedMapId !== mapId) return Promise.resolve('The map is still loading — try again in a moment.');
    // The editor only holds the events it could read. Writing now would delete
    // the rest — refuse rather than silently destroy them.
    if (skipped > 0) {
      return Promise.resolve(
        `${skipped} event(s) in this map could not be read, so saving would delete them. Fix or remove them in RMXP first.`,
      );
    }
    // Convert working command lists into the edit protocol. A page whose list
    // is exactly its original (sequential __keep from 0) omits editedList so
    // the backend does a pure byte-faithful carry.
    const payloadEvents = buildEventsWritePayload(events);
    const mapSize = mapWidth && mapHeight ? { width: mapWidth, height: mapHeight } : undefined;
    return new Promise((resolve) => {
      window.api.writeRMXPEvents(
        // `tiledFilename` lets the backend read the map size straight from the
        // .tmx when `mapSize` is unavailable — so a brand-new map can be evented
        // and saved (creating its .rxdata) without booting the game first.
        { projectPath, mapId, events: payloadEvents, skippedOnRead: skipped, mapSize, tiledFilename },
        () => {
          setDirty(false);
          // Reload so provenance re-points at the freshly written file.
          reload();
          resolve(null);
        },
        ({ errorMessage }) => resolve(errorMessage),
      );
    });
  }, [projectPath, mapId, loadedMapId, events, skipped, mapWidth, mapHeight, tiledFilename, reload]);

  // All mutators read the current array from eventsRef (kept in lockstep with
  // state) and route through `commit`, which snapshots the pre-state so the
  // change can be undone. Each is one undo step.
  const updateEvent = useCallback((updated: MapEvent) => {
    commit(eventsRef.current.map((e) => (e.id === updated.id ? updated : e)));
  }, [commit]);

  const createEvent = useCallback((x: number, y: number): MapEvent => {
    const created = createEmptyEvent(nextEventId(eventsRef.current), x, y);
    commit([...eventsRef.current, created]);
    return created;
  }, [commit]);

  const deleteEvent = useCallback((id: number) => {
    commit(eventsRef.current.filter((e) => e.id !== id));
  }, [commit]);

  // `coalesce` folds a continuing drag into the single history entry the
  // drag's first step already pushed — so dragging an event across N cells is
  // ONE undo step, not N. EventsOverlay passes its `drag.moved` flag (false on
  // the first step of a drag, true thereafter).
  const moveEvent = useCallback((id: number, x: number, y: number, coalesce = false) => {
    const next = eventsRef.current.map((e) => (e.id === id ? { ...e, x, y } : e));
    if (!coalesce) {
      commit(next);
      return;
    }
    historyFutureRef.current = [];
    eventsRef.current = next;
    setEvents(next);
    setDirty(true);
    bumpHistory();
  }, [commit, bumpHistory]);

  /** Paste helper: duplicate an event at a new position (pages keep their provenance = commands carried over). */
  const duplicateEvent = useCallback((sourceId: number, x: number, y: number) => {
    const source = eventsRef.current.find((e) => e.id === sourceId);
    if (!source) return;
    const copy: MapEvent = { ...source, id: nextEventId(eventsRef.current), x, y, pages: source.pages.map((p) => ({ ...p })) };
    commit([...eventsRef.current, copy]);
  }, [commit]);

  return { events, loading, error, dirty, skipped, loadedMapId, reload, save, updateEvent, createEvent, deleteEvent, moveEvent, duplicateEvent, createEmptyPage, undo, redo, canUndo, canRedo };
};
