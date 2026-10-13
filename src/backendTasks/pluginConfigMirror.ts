import log from 'electron-log';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { getPSDKBinariesPath } from '@services/getPSDKVersion';

/**
 * Keep the Marshal `.rxdata` mirrors of the project's plugin JSON configs current
 * whenever the fork saves one.
 *
 * PSDK RELEASE builds ship only compiled `Data/*.dat` bundles — loose
 * `Data/configs/plugins/*.json` are NOT included, and the release data glob
 * bundles `Data/configs/**\/*.rxdata` (never `.json`). So the game can't read a
 * loose config in a release. The runtime patch
 * (`scripts/00000 All_Studio_Scripts/00040 PluginConfigMirror.rb`) transparently
 * serves a bundled `.rxdata` mirror (a Marshal dump of the config's JSON *text*)
 * when the loose `.json` is absent. This regenerates those mirrors on save so the
 * next release build ships current data — without waiting for a dev-run.
 *
 * The fork can't write Ruby Marshal itself, so it runs the project's bundled Ruby
 * on a tiny one-liner. Fire-and-forget: a failure only means the mirror is stale
 * until the next dev boot (which rebuilds them), never a broken save.
 */

/** PSDK's bundled Ruby when present (Windows), otherwise `ruby` from PATH. */
const rubyExecutable = (): string => {
  if (process.platform === 'win32') {
    const psdkRuby = join(getPSDKBinariesPath(), 'ruby.exe');
    if (existsSync(psdkRuby)) return psdkRuby;
  }
  return 'ruby';
};

// Disabling gems/rubyopt makes the bundled Ruby use the stdlib (matches applyDataPack).
const RUBY_FLAGS = ['--disable=gems,rubyopt,did_you_mean'];

// Rewrite <name>.rxdata = Marshal.dump(<name>.json's text) for every plugin config.
const MIRROR_SCRIPT =
  "Dir['Data/configs/plugins/*.json'].each { |j| File.binwrite(j.sub(/\\.json\\z/, '.rxdata'), Marshal.dump(File.read(j))) rescue nil }";

/**
 * Regenerate the `.rxdata` mirrors for every plugin config JSON in the project.
 * Non-blocking and best-effort — call it after writing any plugin config.
 * @param projectPath absolute path to the project root
 */
export const mirrorPluginConfigs = (projectPath: string): void => {
  try {
    const child = spawn(rubyExecutable(), [...RUBY_FLAGS, '-e', MIRROR_SCRIPT], {
      cwd: projectPath,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.on('error', (error) => log.warn(`[pluginConfigMirror] ruby spawn failed: ${error.message}`));
  } catch (error) {
    log.warn(`[pluginConfigMirror] failed: ${error instanceof Error ? error.message : String(error)}`);
  }
};
