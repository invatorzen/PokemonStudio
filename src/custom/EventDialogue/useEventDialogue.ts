import { useCallback, useEffect, useState } from 'react';
import { useGlobalState } from '@src/GlobalStateProvider';
import type { EventDialogueEntry } from '@src/backendTasks/readEventDialogue';

/**
 * Loads the aggregated event-dialogue list for the open project via the
 * `read-event-dialogue` backend scan. Read-only: it never writes anything back.
 * The scan walks every map, so it can take a moment — `progress` drives a bar,
 * and `reload` re-runs it on demand (e.g. after editing a line elsewhere).
 *
 * The effect only kicks off the async scan; every state transition happens in
 * the scan's IPC callbacks, so nothing sets state synchronously inside it.
 */

type Progress = { step: number; total: number; stepText: string };
type Status = 'loading' | 'ready' | 'error';

export const useEventDialogue = () => {
  const [{ projectPath }] = useGlobalState();
  const [status, setStatus] = useState<Status>('loading');
  const [entries, setEntries] = useState<EventDialogueEntry[]>([]);
  const [progress, setProgress] = useState<Progress | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  const scan = useCallback((path: string) => {
    window.api.readEventDialogue(
      { projectPath: path },
      (result) => {
        setEntries(result.entries);
        setStatus('ready');
      },
      ({ errorMessage }) => {
        setError(errorMessage);
        setStatus('error');
      },
      (p) => setProgress(p)
    );
  }, []);

  useEffect(() => {
    if (projectPath) scan(projectPath);
  }, [projectPath, scan]);

  const reload = useCallback(() => {
    if (!projectPath) return;
    setStatus('loading');
    setProgress(undefined);
    setError(undefined);
    scan(projectPath);
  }, [projectPath, scan]);

  return { status, entries, progress, error, reload };
};
