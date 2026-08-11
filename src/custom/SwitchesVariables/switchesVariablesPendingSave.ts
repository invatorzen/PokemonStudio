/**
 * Fork-owned store for unsaved switch/variable name edits, mirroring
 * grottoPendingSave / sosPendingSave. The names live in Data/System.rxdata, not
 * Studio's tracked project data, so they ride the bottom-left "Save data" button
 * through this parking store instead of a save button of their own.
 *
 * Memory-only: unsaved work is lost on force-quit.
 */

type Pending = { projectPath: string; switches: string[]; variables: string[] } | null;

let pending: Pending = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

export const setSwitchesVariablesPending = (projectPath: string, switches: string[], variables: string[]) => {
  pending = { projectPath, switches, variables };
  notify();
};

export const clearSwitchesVariablesPending = () => {
  if (!pending) return;
  pending = null;
  notify();
};

export const getSwitchesVariablesPending = (): Pending => pending;

export const subscribeSwitchesVariablesPending = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/**
 * Write the pending names to System.rxdata, then clear. Resolves immediately
 * when nothing is pending, so the save button can await it unconditionally.
 */
export const flushSwitchesVariablesSave = (): Promise<void> =>
  new Promise((resolve, reject) => {
    const p = pending;
    if (!p) return resolve();
    window.api.writeRMXPSwitchNames(
      { projectPath: p.projectPath, switches: p.switches, variables: p.variables },
      () => {
        clearSwitchesVariablesPending();
        resolve();
      },
      ({ errorMessage }) => reject(new Error(errorMessage))
    );
  });
