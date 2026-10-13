import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useGlobalState } from '@src/GlobalStateProvider';

/**
 * Dev-only hooks for `tools/drive_studio.mjs` (the Studio console driver).
 *
 * Studio routes through a MemoryRouter, so there is no URL to point a page at:
 * the driver reaches pages through `window.__studio.navigate`, and reads where
 * Studio is / which project is open through `window.__studio.where()`. Never
 * installed in packaged builds.
 */

export type StudioDriverApi = {
  navigate: (path: string) => void;
  where: () => { route: string; projectPath: string | null; projectTitle: string | null };
};

declare global {
  interface Window {
    __studio?: StudioDriverApi;
  }
}

export const StudioDriverBridge = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [state] = useGlobalState();
  const latest = useRef({ navigate, location, state });
  latest.current = { navigate, location, state };

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    window.__studio = {
      navigate: (path) => latest.current.navigate(path),
      where: () => ({
        route: latest.current.location.pathname,
        projectPath: latest.current.state.projectPath ?? null,
        projectTitle: latest.current.state.projectPath ? latest.current.state.projectStudio?.title ?? null : null,
      }),
    };
    return () => {
      delete window.__studio;
    };
  }, []);

  return null;
};
