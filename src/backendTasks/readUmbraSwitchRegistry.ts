import log from 'electron-log';
import path from 'path';
import fs from 'fs';
import fsPromises from 'fs/promises';
import { defineBackendServiceFunction } from './defineBackendServiceFunction';

/**
 * Fork-only backend task: read the project's Ruby switch/variable "allocation
 * registry" — the `module Umbra::Sw` / `module Umbra::Var` named constants under
 * `scripts/00003 Umbra/00000 Switches_and_Variables/`. These are the ids the
 * game's code references by name, so the Switches & Variables manager can show
 * them as read-only annotations (which ids are code-referenced, and their intent).
 *
 * Purely additive and best-effort: a project without that folder just yields
 * empty maps. It parses `# comment` lines followed by `NAME = <id>` inside a
 * `module Sw` / `module Var` block — it does not evaluate Ruby.
 */

export type RegistryEntry = { constName: string; comment: string };
export type ReadUmbraSwitchRegistryInput = { projectPath: string };
export type ReadUmbraSwitchRegistryOutput = {
  /** switch id => { constName, comment } */
  switches: Record<number, RegistryEntry>;
  /** variable id => { constName, comment } */
  variables: Record<number, RegistryEntry>;
};

const REGISTRY_DIR = path.join('scripts', '00003 Umbra', '00000 Switches_and_Variables');

const parseFile = (content: string, out: ReadUmbraSwitchRegistryOutput) => {
  let section: 'switches' | 'variables' | null = null;
  let comment = '';
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    // Enter/track a `module Sw` / `module Var` block; anything else clears section on `end`.
    if (/^module\s+Sw\b/.test(line)) {
      section = 'switches';
      continue;
    }
    if (/^module\s+Var\b/.test(line)) {
      section = 'variables';
      continue;
    }
    const commentMatch = line.match(/^#\s?(.*)$/);
    if (commentMatch) {
      comment = commentMatch[1].trim();
      continue;
    }
    const constMatch = line.match(/^([A-Z][A-Za-z0-9_]*)\s*=\s*(\d+)\b/);
    if (constMatch && section) {
      out[section][Number(constMatch[2])] = { constName: constMatch[1], comment };
    }
    comment = '';
  }
};

const readUmbraSwitchRegistry = async (payload: ReadUmbraSwitchRegistryInput): Promise<ReadUmbraSwitchRegistryOutput> => {
  log.info('read-umbra-switch-registry');
  const out: ReadUmbraSwitchRegistryOutput = { switches: {}, variables: {} };
  const dir = path.join(payload.projectPath, REGISTRY_DIR);
  if (!fs.existsSync(dir)) return out;

  const files = (await fsPromises.readdir(dir)).filter((f) => f.endsWith('.rb'));
  for (const file of files) {
    try {
      parseFile(await fsPromises.readFile(path.join(dir, file), 'utf-8'), out);
    } catch {
      // Skip an unreadable file rather than fail the whole read.
    }
  }
  return out;
};

export const registerReadUmbraSwitchRegistry = defineBackendServiceFunction('read-umbra-switch-registry', readUmbraSwitchRegistry);
