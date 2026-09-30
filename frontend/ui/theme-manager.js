import { THEME_CATALOG, UI_THEMES } from '../themes.js';

export function getThemeConfig(themeKey) {
  return THEME_CATALOG.find(theme => theme.key === themeKey)
    || THEME_CATALOG.find(theme => theme.key === 'vsCodeDark');
}

export function applyThemeToIDE(themeKey) {
  const palette = UI_THEMES[themeKey] || UI_THEMES.vsCodeDark;
  const root = document.documentElement;
  const variables = {
    '--bg-primary': palette.bg,
    '--bg-secondary': palette.bg2,
    '--bg-tertiary': palette.bg3,
    '--bg-hover': palette.hover,
    '--text-primary': palette.text,
    '--text-secondary': palette.text2,
    '--text-tertiary': palette.text3,
    '--accent-primary': palette.accent,
    '--accent-secondary': palette.accent2,
    '--accent-success': palette.success,
    '--border-color': palette.border,
    '--shadow': palette.shadow
  };

  for (const [name, value] of Object.entries(variables)) {
    root.style.setProperty(name, value);
  }
  root.dataset.theme = themeKey;
}

export function updateWelcomeLogoByCategory(category) {
  const logo = document.getElementById('welcomeLogo');
  if (!logo) return;
  logo.src = category === 'light' ? 'logo.png' : 'logo-dark.png';
}

export function populateThemeSelect(selectedTheme) {
  const select = document.getElementById('themeSelect');
  if (!select) return;
  const groups = {
    dark: document.createElement('optgroup'),
    light: document.createElement('optgroup')
  };
  groups.dark.label = 'Dark themes';
  groups.light.label = 'Light themes';

  for (const theme of THEME_CATALOG) {
    const option = new Option(theme.label, theme.key);
    groups[theme.category].appendChild(option);
  }

  select.replaceChildren(groups.dark, groups.light);
  select.value = selectedTheme;
}

export { THEME_CATALOG, UI_THEMES };