import { app } from 'electron';
import log from 'electron-log';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { getPSDKBinariesPath } from '@services/getPSDKVersion';
import { defineBackendServiceFunction } from './defineBackendServiceFunction';

/**
 * Runs the bundled GameDataPacks installer (`data-pack-tool/apply_data_pack.rb`)
 * against the open project, so a generation/version data pack can be applied
 * from inside Studio. The Ruby script is the single source of truth for the
 * overwrite/switch logic, custom-content renumbering, CSV merges and backups —
 * this task only shells out to it with the flags the wizard collected and
 * returns its console output.
 *
 * PSDK already ships a Ruby interpreter (psdk-binaries/ruby.exe on Windows), so
 * no system Ruby install is required; other platforms fall back to `ruby` on the
 * PATH. `git` is only needed for the remote (sparse-clone) source mode.
 */

/** The tool folder ships as an extraResource; in dev it sits at the repo root. */
const DATA_PACK_TOOL_DIR = app.isPackaged ? join(process.resourcesPath, 'data-pack-tool') : join(app.getAppPath(), 'data-pack-tool');
const SCRIPT_PATH = join(DATA_PACK_TOOL_DIR, 'apply_data_pack.rb');

/** PSDK's bundled Ruby when present (Windows), otherwise `ruby` from the PATH. */
const rubyExecutable = (): string => {
  if (process.platform === 'win32') {
    const psdkRuby = join(getPSDKBinariesPath(), 'ruby.exe');
    if (existsSync(psdkRuby)) return psdkRuby;
  }
  return 'ruby';
};

/** Whether a command runs and exits 0 (used to probe git / ruby availability). */
const commandOk = (command: string, args: string[]): Promise<boolean> =>
  new Promise((resolve) => {
    try {
      const child = spawn(command, args);
      child.on('error', () => resolve(false));
      child.on('exit', (code) => resolve(code === 0));
    } catch {
      resolve(false);
    }
  });

export type DataPackSource = { mode: 'local'; path: string } | { mode: 'remote' };

export type ApplyDataPackInput = {
  projectPath: string;
  strategy: 'overwrite' | 'switch';
  gen: number;
  version: string;
  fromGen?: number;
  fromVersion?: string;
  /** ['all'] or a subset of pokemon/moves/items/abilities/types. */
  scope: string[];
  source: DataPackSource;
  /** When true, pass --dry-run: the script prints its plan/preview and changes nothing. */
  dryRun: boolean;
};
export type ApplyDataPackOutput = { exitCode: number | null; log: string };

// PSDK's bundled Ruby otherwise activates RubyGems and may pick up an
// incompatible user-installed gem (e.g. a json build for another arch), which
// crashes `require 'json'`. Disabling gems/rubyopt makes it use the stdlib that
// ships with the interpreter — the same flags PSDK's own compilation task uses.
const RUBY_FLAGS = ['--disable=gems,rubyopt,did_you_mean'];

const buildArgs = (payload: ApplyDataPackInput): string[] => {
  const args = [...RUBY_FLAGS, SCRIPT_PATH];
  if (payload.source.mode === 'local') args.push('--local', payload.source.path);
  else args.push('--remote');
  args.push('--strategy', payload.strategy);
  args.push('--gen', String(payload.gen), '--version', payload.version);
  if (payload.strategy === 'switch') {
    args.push('--from-gen', String(payload.fromGen ?? 0), '--from-version', payload.fromVersion ?? '');
  }
  args.push('--scope', payload.scope.join(','));
  args.push(payload.dryRun ? '--dry-run' : '--yes');
  return args;
};

const applyDataPack = async (payload: ApplyDataPackInput): Promise<ApplyDataPackOutput> => {
  log.info('apply-data-pack', { ...payload, dryRun: payload.dryRun });

  if (!existsSync(SCRIPT_PATH)) throw `Data pack tool not found at ${SCRIPT_PATH}`;

  const ruby = rubyExecutable();
  const args = buildArgs(payload);

  return new Promise((resolve, reject) => {
    let out = '';
    let child: ReturnType<typeof spawn>;
    try {
      // No shell: the args array passes paths with spaces (project name, local
      // clone path, "Legends Z-A") through verbatim, no manual quoting needed.
      child = spawn(ruby, args, { cwd: payload.projectPath, env: { ...process.env } });
    } catch (error) {
      return reject(String(error));
    }
    // Strip ANSI colour codes the script may emit so the log reads cleanly.
    const append = (chunk: Buffer) => {
      // eslint-disable-next-line no-control-regex
      out += chunk.toString().replace(/\x1b\[\d{1,2}m/g, '');
    };
    child.stdout?.on('data', append);
    child.stderr?.on('data', append);
    child.on('error', (error) => reject(String(error)));
    child.on('exit', (exitCode) => {
      log.info('apply-data-pack/exit', { exitCode });
      resolve({ exitCode, log: out });
    });
  });
};

export type CheckDataPackEnvOutput = { ruby: boolean; git: boolean };

const checkDataPackEnv = async (): Promise<CheckDataPackEnvOutput> => {
  const psdkRuby = process.platform === 'win32' && existsSync(join(getPSDKBinariesPath(), 'ruby.exe'));
  const ruby = psdkRuby || (await commandOk('ruby', ['--version']));
  const git = await commandOk('git', ['--version']);
  return { ruby, git };
};

export const registerApplyDataPack = defineBackendServiceFunction('apply-data-pack', applyDataPack);
export const registerCheckDataPackEnv = defineBackendServiceFunction('check-data-pack-env', checkDataPackEnv);
