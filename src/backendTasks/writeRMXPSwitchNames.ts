import log from 'electron-log';
import path from 'path';
import fsPromises from 'fs/promises';
import { Marshal, type MarshalObject } from 'ts-marshal';
import { defineBackendServiceFunction } from './defineBackendServiceFunction';
import { isRecord } from '@utils/rmxpUtils';

/**
 * Fork-only backend task: write switch and variable NAMES back into
 * Data/System.rxdata (@switches / @variables). The counterpart of
 * readRMXPSwitchNames.ts, used by the Database "Switches & Variables" manager.
 *
 * Keep-protocol: the whole RMXP System object is loaded and re-dumped so every
 * other field (@edit_map_id, @party_members, audio, words, …) round-trips
 * untouched — only the two name arrays are replaced. A verified ts-marshal
 * round-trip of System.rxdata is semantically lossless (same 37 keys, no field
 * differs), so this only rewrites what it means to.
 *
 * Index 0 of each array is RMXP's unused slot; its original value (usually nil)
 * is preserved exactly rather than coerced to a string.
 */

export type WriteRMXPSwitchNamesInput = {
  projectPath: string;
  /** Full array, index = switch id; [0] is the unused slot. */
  switches: string[];
  /** Full array, index = variable id; [0] is the unused slot. */
  variables: string[];
};
export type WriteRMXPSwitchNamesOutput = Record<string, never>;

/** Take names[1..] from the editor but keep the original index-0 slot verbatim. */
const mergePreservingSlotZero = (original: unknown, edited: string[]): unknown[] => {
  const base = Array.isArray(original) ? original : [];
  const out: unknown[] = edited.slice();
  out[0] = base.length > 0 ? base[0] : '';
  return out;
};

const writeRMXPSwitchNames = async (payload: WriteRMXPSwitchNamesInput): Promise<WriteRMXPSwitchNamesOutput> => {
  log.info('write-rmxp-switch-names');
  const filePath = path.join(payload.projectPath, 'Data', 'System.rxdata');

  const marshalData = Marshal.load(await fsPromises.readFile(filePath));
  if (!isRecord(marshalData)) throw 'System.rxdata is not a valid RMXP system object';
  const system = marshalData as unknown as Record<string, unknown>;

  system['@switches'] = mergePreservingSlotZero(system['@switches'], payload.switches);
  system['@variables'] = mergePreservingSlotZero(system['@variables'], payload.variables);

  await fsPromises.writeFile(filePath, Marshal.dump(system as unknown as MarshalObject, { omitStringEncoding: true }));
  log.info('write-rmxp-switch-names/success');
  return {};
};

export const registerWriteRMXPSwitchNames = defineBackendServiceFunction('write-rmxp-switch-names', writeRMXPSwitchNames);
