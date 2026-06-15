import type { ThemeMode } from '@src/AppTheme';

export type StudioSettings = {
  tiledPath: string;
  themeMode: ThemeMode;
};

const defaultSettings: StudioSettings = {
  tiledPath: '',
  themeMode: 'dark',
};

/**
 * Get all settings of the application
 * @returns A settings object containing the settings of the application
 */
export const getSettings = (): StudioSettings => {
  const settingsJson = localStorage.getItem('settings');
  if (!settingsJson) return defaultSettings;

  // Merge stored settings on top of defaults so newly-added keys (e.g. themeMode)
  // have a sane fallback when reading a localStorage blob from an older version.
  return { ...defaultSettings, ...(JSON.parse(settingsJson) as Partial<StudioSettings>) };
};

/**
 * Get one setting of the application
 * @param key The setting to get
 * @returns The setting associed at the key
 */
export const getSetting = <Key extends keyof StudioSettings>(key: Key) => {
  const settings = getSettings();
  return settings[key];
};

/**
 * Update the settings of the application
 * @param key The setting which should be updated
 * @param value The value associed at setting
 */
export const updateSettings = <Key extends keyof StudioSettings>(key: Key, value: StudioSettings[Key]) => {
  const settings = getSettings();
  const updatedSettings = {
    ...settings,
    [key]: value,
  };
  localStorage.setItem('settings', JSON.stringify(updatedSettings));
};
