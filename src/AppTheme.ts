// eslint-disable-next-line import/named
import { DefaultTheme } from 'styled-components';

export type ThemeMode = 'dark' | 'light';

/**
 * Module-level active theme mode. Kept in sync with the React context by
 * `ThemeModeProvider`. The default-exported `theme` proxy reads from this so
 * that legacy modules importing `theme` directly (instead of going through
 * `useTheme()` / styled-components ThemeProvider) still get the active palette.
 */
let activeMode: ThemeMode = 'dark';

export const setActiveThemeMode = (mode: ThemeMode) => {
  activeMode = mode;
};

export const getActiveThemeMode = (): ThemeMode => activeMode;

const darkColors: DefaultTheme['colors'] = {
  /* Button Styles */
  primaryBase: 'rgba(101, 98, 248, 1)',
  primaryHover: 'rgba(111, 109, 248, 1)',
  primarySoft: 'rgba(101, 98, 248, 0.12)',
  secondaryHover: 'rgba(111, 116, 246, 0.16)',

  dangerBase: 'rgba(245, 61, 92, 1)',
  dangerHover: 'rgba(243, 73, 107, 0.16)',
  dangerSoft: 'rgba(245, 61, 92, 0.12)',

  infoBase: 'rgba(53, 175, 243, 1)',
  infoHover: 'rgba(53, 175, 243, 0.16)',
  infoSoft: 'rgba(53, 175, 243, 0.12)',

  warningBase: 'rgba(245, 171, 61, 1)',
  warningHover: 'rgba(246, 180, 81, 1)',
  warningSoft: 'rgba(245, 171, 61, 0.12)',

  successBase: 'rgba(53, 221, 131, 1)',
  successHover: 'rgba(53, 221, 131, 0.16)',
  successSoft: 'rgba(53, 221, 131, 0.12)',

  navigationTopIconColor: '#f4f4f5',
  navigationIconColor: '#656572',
  navigationIconCloseColor: '#EC2D3A',

  overlay: 'rgba(145, 145, 161, 1)',
  dark8: 'rgba(19, 18, 22, 1)',
  dark12: 'rgba(29, 28, 34, 1)',
  dark14: 'rgba(34, 33, 39, 1)',
  dark15: 'rgba(36, 35, 41, 1)',
  dark16: 'rgba(38, 37, 44, 1)',
  dark18: 'rgba(43, 42, 50, 1)',
  dark19: 'rgba(45, 44, 53, 1)',
  dark20: 'rgba(48, 46, 56, 1)',
  dark22: 'rgba(53, 51, 61, 1)',
  dark23: 'rgba(55, 53, 64, 1)',
  dark24: 'rgba(58, 56, 67, 1)',

  text100: 'rgba(244, 244, 245, 1)',
  text400: 'rgba(145, 145, 161, 1)',
  text500: 'rgba(101, 101, 114, 1)',
  text600: 'rgba(75, 75, 88, 1)',
  text700: 'rgba(66, 66, 77, 1)',

  silverDark6: '#272c31',
  silverDark9: '#4a545d',
  silverDark11: '#63788e',

  goldDark6: '#2f2b25',
  goldDark9: '#595146',
  goldDark11: '#85735B',

  bronzeDark6: '#302A27',
  bronzeDark9: '#5C4F4A',
  bronzeDark11: '#8D7063',

  topazDark6: '#3D2416',
  topazDark9: '#7D3F17',
  topazDark11: '#BA5D1D',

  vermillionDark6: '#422018',
  vermillionDark9: '#88341F',
  vermillionDark11: '#CC4B2B',

  magentaDark6: '#3F1E35',
  magentaDark9: '#7D3168',
  magentaDark11: '#BD4A9D',

  amethystDark6: '#342147',
  amethystDark9: '#663693',
  amethystDark11: '#9559D0',

  lavenderDark6: '#2B244B',
  lavenderDark9: '#543D9E',
  lavenderDark11: '#7E61E0',

  cobaltDark6: '#1A294E',
  cobaltDark9: '#2B4C9F',
  cobaltDark11: '#4370E2',

  ceruleanDark6: '#082E49',
  ceruleanDark9: '#02578B',
  ceruleanDark11: '#087CC2',

  cyanDark6: '#04313C',
  cyanDark9: '#005C71',
  cyanDark11: '#0A819D',

  celadonDark6: '#073234',
  celadonDark9: '#005F5F',
  celadonDark11: '#00857F',

  peridotDark6: '#1A321B',
  peridotDark9: '#325F34',
  peridotDark11: '#458449',

  oliveDark6: '#233014',
  oliveDark9: '#435C26',
  oliveDark11: '#5D8035',
};

/**
 * Light palette. Token keys are kept identical to the dark palette
 * (including the `dark*` / `*Dark*` names) so the 200+ existing call sites
 * don't have to be touched — these tokens are surface-tone semantic, not
 * literally "dark". `dark8` is the lowest surface (closest to a tooltip / pop
 * layer), `dark24` is the highest. `text100` is the highest-contrast text,
 * `text700` the dimmest.
 */
const lightColors: DefaultTheme['colors'] = {
  primaryBase: 'rgba(101, 98, 248, 1)',
  primaryHover: 'rgba(91, 88, 238, 1)',
  primarySoft: 'rgba(101, 98, 248, 0.12)',
  secondaryHover: 'rgba(111, 116, 246, 0.12)',

  dangerBase: 'rgba(225, 41, 72, 1)',
  dangerHover: 'rgba(225, 41, 72, 0.12)',
  dangerSoft: 'rgba(225, 41, 72, 0.10)',

  infoBase: 'rgba(33, 155, 223, 1)',
  infoHover: 'rgba(33, 155, 223, 0.12)',
  infoSoft: 'rgba(33, 155, 223, 0.10)',

  warningBase: 'rgba(225, 151, 41, 1)',
  warningHover: 'rgba(225, 151, 41, 0.85)',
  warningSoft: 'rgba(225, 151, 41, 0.12)',

  successBase: 'rgba(33, 201, 111, 1)',
  successHover: 'rgba(33, 201, 111, 0.12)',
  successSoft: 'rgba(33, 201, 111, 0.10)',

  navigationTopIconColor: '#1d1c22',
  navigationIconColor: '#8a8a96',
  navigationIconCloseColor: '#EC2D3A',

  overlay: 'rgba(75, 75, 88, 0.45)',
  // Surface scale: dark8 = nearly white pop layer, going up = subtly darker.
  dark8: 'rgba(255, 255, 255, 1)',
  dark12: 'rgba(247, 247, 249, 1)',
  dark14: 'rgba(240, 240, 243, 1)',
  dark15: 'rgba(234, 234, 238, 1)',
  dark16: 'rgba(228, 228, 233, 1)',
  dark18: 'rgba(218, 218, 225, 1)',
  dark19: 'rgba(210, 210, 218, 1)',
  dark20: 'rgba(204, 204, 213, 1)',
  dark22: 'rgba(195, 195, 206, 1)',
  dark23: 'rgba(188, 188, 200, 1)',
  dark24: 'rgba(181, 181, 194, 1)',

  // Text scale inverted: text100 = strongest contrast (near-black), text700 = lightest gray.
  text100: 'rgba(19, 18, 22, 1)',
  text400: 'rgba(75, 75, 88, 1)',
  text500: 'rgba(101, 101, 114, 1)',
  text600: 'rgba(145, 145, 161, 1)',
  text700: 'rgba(180, 180, 195, 1)',

  silverDark6: '#e9edf1',
  silverDark9: '#c6cdd3',
  silverDark11: '#63788e',

  goldDark6: '#f6f0e1',
  goldDark9: '#e6d6b3',
  goldDark11: '#85735B',

  bronzeDark6: '#f1e7e1',
  bronzeDark9: '#dec4b6',
  bronzeDark11: '#8D7063',

  topazDark6: '#fbe5d6',
  topazDark9: '#eeb89a',
  topazDark11: '#BA5D1D',

  vermillionDark6: '#fbe1d8',
  vermillionDark9: '#f1b6a3',
  vermillionDark11: '#CC4B2B',

  magentaDark6: '#f7e0ee',
  magentaDark9: '#e9b1d5',
  magentaDark11: '#BD4A9D',

  amethystDark6: '#ece1f5',
  amethystDark9: '#d0b6ec',
  amethystDark11: '#9559D0',

  lavenderDark6: '#e6e0f5',
  lavenderDark9: '#bba9e7',
  lavenderDark11: '#7E61E0',

  cobaltDark6: '#dde6f8',
  cobaltDark9: '#9bb1e5',
  cobaltDark11: '#4370E2',

  ceruleanDark6: '#d8ebf5',
  ceruleanDark9: '#8cbfe3',
  ceruleanDark11: '#087CC2',

  cyanDark6: '#d6edf2',
  cyanDark9: '#88c5d3',
  cyanDark11: '#0A819D',

  celadonDark6: '#d7edec',
  celadonDark9: '#8acac6',
  celadonDark11: '#00857F',

  peridotDark6: '#dfecde',
  peridotDark9: '#9ec79f',
  peridotDark11: '#458449',

  oliveDark6: '#e6ecda',
  oliveDark9: '#bdcd9d',
  oliveDark11: '#5D8035',
};

const sharedFonts: DefaultTheme['fonts'] = {
  titlesStudio: `
      font-family: Gilroy;
      font-weight: 400;
      font-size: 48px;
      letter-spacing: 0.25px;
      line-height: 58px;`,
  titlesHeadline1: `
      font-family: Gilroy;
      font-weight: 600;
      font-size: 36px;
      letter-spacing: 0.25px;
      line-height: 43px;`,
  titlesHeadline4: `
      font-family: Gilroy;
      font-weight: 400;
      font-size: 24px;
      line-height: 29px;`,
  titlesHeadline6: `
      font-family: Gilroy;
      font-weight: 600;
      font-size: 18px;`,
  titlesOverline: `
      font-family: Avenir Next;
      font-weight: 600;
      font-size: 10px;`,
  normalRegular: `
      font-family: Avenir Next;
      font-weight: 400;
      font-size: 14px;`,
  normalMedium: `
      font-family: Avenir Next;
      font-weight: 500;
      font-size: 14px;`,
  normalSmall: `
      font-family: Avenir Next;
      font-weight: 400;
      font-size: 12px;`,
  codeRegular: `
      font-family: Source Code Pro;
      font-weight: 400;
      font-size: 14px;`,
  windowsIcons: `
      font-family: Segoe MDL2 Assets;
      font-weight: 400;
      font-size: 10px;`,
};

const sharedBreakpoints: DefaultTheme['breakpoints'] = {
  smallScreen: 'screen and (max-width: 1366px)',
  dataBox422: 'screen and (max-width: 1393px)',
};

const sharedSizes: DefaultTheme['sizes'] = {
  full: { min: 244, max: 1024, middle: 100 },
  half: { min: 504, max: 504, middle: 50 },
  fourth: { min: 244, max: 504, middle: 25 },
  default: { min: 504, max: 708, middle: 100 },
};

const sharedCalc: DefaultTheme['calc'] = {
  height: window.api.platform === 'win32' ? 'calc(100vh - 26px)' : '100vh',
  titleBarHeight: window.api.platform === 'win32' ? '26px' : '0',
};

export const darkTheme: DefaultTheme = {
  colors: darkColors,
  fonts: sharedFonts,
  breakpoints: sharedBreakpoints,
  sizes: sharedSizes,
  calc: sharedCalc,
};

export const lightTheme: DefaultTheme = {
  colors: lightColors,
  fonts: sharedFonts,
  breakpoints: sharedBreakpoints,
  sizes: sharedSizes,
  calc: sharedCalc,
};

export const themesByMode: Record<ThemeMode, DefaultTheme> = {
  dark: darkTheme,
  light: lightTheme,
};

export const getActiveTheme = (): DefaultTheme => themesByMode[activeMode];

/**
 * Legacy default export. ~36 modules still import `theme` directly instead of
 * pulling it from styled-components' ThemeProvider. They read `theme.colors.X`
 * inside the render function, so a Proxy that delegates to the currently
 * active theme keeps them in sync whenever the user toggles modes (React
 * re-renders after the mode changes, and the proxy then returns the fresh
 * palette).
 */
const theme = new Proxy({} as DefaultTheme, {
  get: (_target, prop) => getActiveTheme()[prop as keyof DefaultTheme],
}) as DefaultTheme;

export default theme;
