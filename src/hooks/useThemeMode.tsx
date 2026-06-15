import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { setActiveThemeMode, type ThemeMode } from '@src/AppTheme';
import { getSetting, updateSettings } from '@utils/settings';

type ThemeModeContextValue = {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
};

const ThemeModeContext = createContext<ThemeModeContextValue | null>(null);

const readInitialMode = (): ThemeMode => {
  const stored = getSetting('themeMode');
  return stored === 'light' ? 'light' : 'dark';
};

export const ThemeModeProvider = ({ children }: { children: React.ReactNode }) => {
  const [mode, setModeState] = useState<ThemeMode>(readInitialMode);

  // Keep the AppTheme module-level binding in sync during render so legacy
  // modules that import `theme` directly read the right palette on this pass.
  setActiveThemeMode(mode);

  const setMode = useCallback((next: ThemeMode) => {
    updateSettings('themeMode', next);
    setActiveThemeMode(next);
    setModeState(next);
  }, []);

  const value = useMemo(() => ({ mode, setMode }), [mode, setMode]);

  return <ThemeModeContext.Provider value={value}>{children}</ThemeModeContext.Provider>;
};

export const useThemeMode = (): ThemeModeContextValue => {
  const ctx = useContext(ThemeModeContext);
  if (!ctx) throw new Error('useThemeMode must be used within a ThemeModeProvider');
  return ctx;
};
