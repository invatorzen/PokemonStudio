import type { IpcMainEvent } from 'electron';
import log from 'electron-log';
import path from 'path';
import fs from 'fs';
import { defineBackendServiceFunction } from './defineBackendServiceFunction';
import { ChannelNames, sendProgress } from '@utils/BackendTask';
import { readRMXPEvents } from './readRMXPEvents';
import { readRMXPMapInfo } from './readRMXPMapInfo';

/**
 * Scan every map's events and collect all of the game dialogue in one place —
 * a read-only aggregate for the "Dialogues" viewer.
 *
 * Umbra's event dialogue is authored two ways, and the viewer must tell them
 * apart:
 *  - RAW: an RMXP "Show Text" command (code 101, continued by 401) whose string
 *    is literal text. It lives inline in the event and is NOT in the text editor.
 *  - CSV: a text-file reference. Three authoring forms all count:
 *      1. A Show Text (101) that STARTS with `<fileId>, <textId>` — PSDK's
 *         `detect_dialog` resolves it to `Data/Text/Dialogs/<fileId>.csv` row
 *         <textId> and IGNORES everything after (regex `/^([0-9]+),( |)([0-9]+)/`,
 *         start-anchored). Any trailing text is the author's note of what the line
 *         should say; we keep it as a fallback preview for refs whose file/row
 *         isn't there yet. This is the bulk of Umbra's dialogue.
 *      2. A Show Choices (102) option that starts with the same `<fileId>, <textId>`.
 *      3. A Script command (355/655) calling `message(f, t)` / `ext_text(f, t)`.
 *    All are editable in Studio's text editor; the renderer resolves the actual
 *    string (and language) via the loaded project texts, falling back to the note.
 *
 * Classification mirrors the engine: a message/choice starting with `digits, digits`
 * is CSV whether or not the file exists yet. Arbitrary scripts are skipped.
 */

export type ReadEventDialogueInput = { projectPath: string };

export type EventDialogueEntry = {
  mapId: number;
  mapName: string;
  eventId: number;
  eventName: string;
  /** 1-based page number the line is on. */
  page: number;
  kind: 'raw' | 'csv';
  /** Parsed speaker when the raw line uses the `\c[9]:[name=…]:` format. */
  speaker?: string;
  /** Raw kind: the message text. CSV kind: empty — the renderer resolves it. */
  text: string;
  /** CSV kind: the referenced text file id + row, for the text-editor deep link. */
  fileId?: number;
  textId?: number;
  /** True when this is a Show Choices (102) option rather than a spoken message. */
  isChoice?: boolean;
};

export type ReadEventDialogueOutput = { entries: EventDialogueEntry[] };

// A Script command referencing a CSV text line. Matches `message(f, t)` and
// `ext_text(f, t)` (the first two integer args are file id + text id).
const CSV_TEXT_CALL = /(?:ext_text|message)\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)/;

// A message/choice that STARTS with a CSV reference `<fileId>, <textId>`.
// Mirrors PSDK `detect_dialog` exactly (`/^([0-9]+),( |)([0-9]+)/`): anchored at
// the start only, so anything after the pair (an author's note, the human-readable
// line, a `:[name=…]:`) is ignored — the engine reads the CSV row, not that text.
const CSV_MESSAGE_REF = /^(\d+), ?(\d+)/;

// Build a CSV entry from a string that matched CSV_MESSAGE_REF. `text` keeps the
// author's trailing note as a fallback the renderer shows when the CSV row is
// missing (many refs point at files not migrated yet).
const csvEntry = (base: Omit<EventDialogueEntry, 'kind' | 'text'>, raw: string, ref: RegExpMatchArray): EventDialogueEntry => ({
  ...base,
  kind: 'csv',
  fileId: Number(ref[1]),
  textId: Number(ref[2]),
  text: raw.slice(ref[0].length).trim(),
});

// `\c[9]:[name=SPEAKER]:` — PSDK's speaker prefix on a raw Show Text line.
const SPEAKER_PREFIX = /^\\c\[9\]:\[name=([^\]]*)\]:?\s*/;

const parseRaw = (text: string): { speaker?: string; text: string } => {
  const match = text.match(SPEAKER_PREFIX);
  if (!match) return { text };
  return { speaker: match[1].trim() || undefined, text: text.slice(match[0].length) };
};

const readEventDialogue = async (payload: ReadEventDialogueInput, event: IpcMainEvent, channels: ChannelNames): Promise<ReadEventDialogueOutput> => {
  log.info('read-event-dialogue');
  const { projectPath } = payload;

  const mapInfoPath = path.join(projectPath, 'Data', 'MapInfos.rxdata');
  if (!fs.existsSync(mapInfoPath)) throw 'MapInfos.rxdata not found — cannot list the maps to scan.';
  const maps = await readRMXPMapInfo(mapInfoPath); // [{ id, name, parentId }], map order

  const entries: EventDialogueEntry[] = [];
  for (let index = 0; index < maps.length; index += 1) {
    const map = maps[index];
    sendProgress(event, channels, { step: index + 1, total: maps.length, stepText: map.name || `Map ${map.id}` });

    let events;
    try {
      ({ events } = await readRMXPEvents(projectPath, map.id));
    } catch (error) {
      // A single unreadable map must not sink the whole scan — skip and continue.
      log.warn(`read-event-dialogue: skipped Map ${map.id} (${map.name}): ${String(error)}`);
      continue;
    }

    events.forEach((evt) => {
      evt.pages.forEach((page, pageIndex) => {
        const list = page.list;
        for (let i = 0; i < list.length; i += 1) {
          const command = list[i];
          const base = { mapId: map.id, mapName: map.name, eventId: evt.id, eventName: evt.name, page: pageIndex + 1 };

          if (command.code === 101) {
            const lines = [String(command.parameters[0] ?? '')];
            while (i + 1 < list.length && list[i + 1].code === 401) {
              i += 1;
              lines.push(String(list[i].parameters[0] ?? ''));
            }
            const joined = lines.join('\n');
            const ref = joined.match(CSV_MESSAGE_REF);
            if (ref) {
              entries.push(csvEntry(base, joined, ref));
            } else {
              const { speaker, text } = parseRaw(joined);
              if (text.trim() || speaker) entries.push({ ...base, kind: 'raw', speaker, text });
            }
          } else if (command.code === 102) {
            // Show Choices: parameters[0] is the array of choice strings; each can
            // be a CSV reference or a literal option.
            const choices = command.parameters[0];
            if (Array.isArray(choices)) {
              choices.forEach((choice) => {
                const s = String(choice ?? '');
                const ref = s.match(CSV_MESSAGE_REF);
                if (ref) entries.push({ ...csvEntry(base, s, ref), isChoice: true });
                else if (s.trim()) entries.push({ ...base, kind: 'raw', text: s, isChoice: true });
              });
            }
          } else if (command.code === 355) {
            const lines = [String(command.parameters[0] ?? '')];
            while (i + 1 < list.length && list[i + 1].code === 655) {
              i += 1;
              lines.push(String(list[i].parameters[0] ?? ''));
            }
            const match = lines.join('\n').match(CSV_TEXT_CALL);
            if (match) entries.push({ ...base, kind: 'csv', text: '', fileId: Number(match[1]), textId: Number(match[2]) });
          }
        }
      });
    });
  }

  log.info('read-event-dialogue/success', { entries: entries.length, maps: maps.length });
  return { entries };
};

export const registerReadEventDialogue = defineBackendServiceFunction('read-event-dialogue', readEventDialogue);
