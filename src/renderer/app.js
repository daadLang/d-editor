import { EditorView, keymap, highlightActiveLine, lineNumbers } from '@codemirror/view';
import { EditorState, Compartment, EditorSelection } from '@codemirror/state';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';
import { completionKeymap } from '@codemirror/autocomplete';
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching } from '@codemirror/language';
import {
  abcdef,
  abyss,
  androidStudio,
  andromeda,
  basicDark,
  basicLight,
  catppuccinMocha,
  cobalt2,
  forest,
  githubDark,
  githubLight,
  gruvboxDark,
  gruvboxLight,
  highContrastDark,
  highContrastLight,
  materialDark,
  materialLight,
  materialOcean,
  monokai,
  nord,
  palenight,
  solarizedDark,
  solarizedLight,
  synthwave84,
  tokyoNightDay,
  tokyoNightStorm,
  volcano,
  vsCodeDark,
  vsCodeLight
} from '@fsegurai/codemirror-theme-bundle';
import { daad } from '../language/language.js';

// State
let currentFile = null;
let currentFolder = null;
let editorView = null;
let fileTree = {};
let isModified = false;
let daadOutputUnsub = null;
let openTabs = [];
let activeTabId = null;
let suppressDocChange = false;

// Recent projects (stored in localStorage)
const RECENTS_KEY = 'recentProjects';

// Editor theme compartment for runtime switching
const editorThemeCompartment = new Compartment();

const THEME_CATALOG = [
  { key: 'abcdef', label: 'Abcdef', category: 'dark', cm: abcdef },
  { key: 'abyss', label: 'Abyss', category: 'dark', cm: abyss },
  { key: 'androidStudio', label: 'Android Studio', category: 'dark', cm: androidStudio },
  { key: 'andromeda', label: 'Andromeda', category: 'dark', cm: andromeda },
  { key: 'basicDark', label: 'Basic Dark', category: 'dark', cm: basicDark },
  { key: 'basicLight', label: 'Basic Light', category: 'light', cm: basicLight },
  { key: 'catppuccinMocha', label: 'Catppuccin Mocha', category: 'dark', cm: catppuccinMocha },
  { key: 'cobalt2', label: 'Cobalt2', category: 'dark', cm: cobalt2 },
  { key: 'forest', label: 'Forest', category: 'dark', cm: forest },
  { key: 'githubDark', label: 'GitHub Dark', category: 'dark', cm: githubDark },
  { key: 'githubLight', label: 'GitHub Light', category: 'light', cm: githubLight },
  { key: 'gruvboxDark', label: 'Gruvbox Dark', category: 'dark', cm: gruvboxDark },
  { key: 'gruvboxLight', label: 'Gruvbox Light', category: 'light', cm: gruvboxLight },
  { key: 'highContrastDark', label: 'High Contrast Dark', category: 'dark', cm: highContrastDark },
  { key: 'highContrastLight', label: 'High Contrast Light', category: 'light', cm: highContrastLight },
  { key: 'materialDark', label: 'Material Dark', category: 'dark', cm: materialDark },
  { key: 'materialLight', label: 'Material Light', category: 'light', cm: materialLight },
  { key: 'materialOcean', label: 'Material Ocean', category: 'dark', cm: materialOcean },
  { key: 'monokai', label: 'Monokai', category: 'dark', cm: monokai },
  { key: 'nord', label: 'Nord', category: 'dark', cm: nord },
  { key: 'palenight', label: 'Palenight', category: 'dark', cm: palenight },
  { key: 'solarizedDark', label: 'Solarized Dark', category: 'dark', cm: solarizedDark },
  { key: 'solarizedLight', label: 'Solarized Light', category: 'light', cm: solarizedLight },
  { key: 'synthwave84', label: 'Synthwave 84', category: 'dark', cm: synthwave84 },
  { key: 'tokyoNightDay', label: 'Tokyo Night Day', category: 'light', cm: tokyoNightDay },
  { key: 'tokyoNightStorm', label: 'Tokyo Night Storm', category: 'dark', cm: tokyoNightStorm },
  { key: 'volcano', label: 'Volcano', category: 'dark', cm: volcano },
  { key: 'vsCodeDark', label: 'VS Code Dark', category: 'dark', cm: vsCodeDark },
  { key: 'vsCodeLight', label: 'VS Code Light', category: 'light', cm: vsCodeLight }
];

const UI_THEMES = {
  abcdef: { bg: '#0f1218', bg2: '#171c24', bg3: '#202636', hover: '#273043', text: '#ecf2ff', text2: '#b9c4dd', text3: '#8792ab', accent: '#7c9dff', accent2: '#617dff', success: '#34d399', border: '#2f3646', shadow: '0 2px 8px rgba(0, 0, 0, 0.35)' },
  abyss: { bg: '#0b1118', bg2: '#121b26', bg3: '#192534', hover: '#203146', text: '#d9e7f5', text2: '#a9bfd3', text3: '#7e93a8', accent: '#58a6ff', accent2: '#1f6feb', success: '#3fb950', border: '#263246', shadow: '0 2px 8px rgba(0, 0, 0, 0.35)' },
  androidStudio: { bg: '#1f1f1f', bg2: '#252526', bg3: '#2d2d30', hover: '#333337', text: '#e7e7e7', text2: '#bababa', text3: '#8f8f8f', accent: '#3ddc84', accent2: '#1faa59', success: '#3ddc84', border: '#3c3c3c', shadow: '0 2px 8px rgba(0, 0, 0, 0.35)' },
  andromeda: { bg: '#23262e', bg2: '#2b2f3a', bg3: '#333846', hover: '#3c4252', text: '#f0f3f8', text2: '#c3c9d6', text3: '#9097a6', accent: '#ffb86c', accent2: '#8be9fd', success: '#50fa7b', border: '#3a4050', shadow: '0 2px 8px rgba(0, 0, 0, 0.35)' },
  basicDark: { bg: '#1e1e1e', bg2: '#252526', bg3: '#2d2d30', hover: '#35363a', text: '#d4d4d4', text2: '#b3b3b3', text3: '#8c8c8c', accent: '#569cd6', accent2: '#4fc1ff', success: '#6a9955', border: '#3c3c3c', shadow: '0 2px 8px rgba(0, 0, 0, 0.35)' },
  basicLight: { bg: '#ffffff', bg2: '#f3f3f3', bg3: '#e9eef5', hover: '#dde6f0', text: '#1f1f1f', text2: '#4b5563', text3: '#6b7280', accent: '#0060c0', accent2: '#0b6cf0', success: '#1a7f37', border: '#c8d1dc', shadow: '0 2px 8px rgba(31, 35, 40, 0.15)' },
  catppuccinMocha: { bg: '#1e1e2e', bg2: '#25263a', bg3: '#2b2d42', hover: '#33354d', text: '#cdd6f4', text2: '#a6adc8', text3: '#7f849c', accent: '#f5c2e7', accent2: '#cba6f7', success: '#a6e3a1', border: '#313244', shadow: '0 2px 8px rgba(0, 0, 0, 0.35)' },
  cobalt2: { bg: '#1b2b34', bg2: '#223542', bg3: '#2b4354', hover: '#345165', text: '#c0d2df', text2: '#9fb3c2', text3: '#7f96a4', accent: '#ff9d00', accent2: '#ffb347', success: '#8cc84b', border: '#334e60', shadow: '0 2px 8px rgba(0, 0, 0, 0.35)' },
  forest: { bg: '#1c2418', bg2: '#263221', bg3: '#31402b', hover: '#3a4b33', text: '#e2eadb', text2: '#b9c5b0', text3: '#8d9a83', accent: '#8bc34a', accent2: '#4caf50', success: '#66bb6a', border: '#324228', shadow: '0 2px 8px rgba(0, 0, 0, 0.35)' },
  githubDark: { bg: '#0d1117', bg2: '#161b22', bg3: '#1f2630', hover: '#28303a', text: '#c9d1d9', text2: '#8b949e', text3: '#6e7681', accent: '#58a6ff', accent2: '#1f6feb', success: '#3fb950', border: '#30363d', shadow: '0 2px 8px rgba(0, 0, 0, 0.35)' },
  githubLight: { bg: '#ffffff', bg2: '#f6f8fa', bg3: '#eef3f8', hover: '#e5edf5', text: '#24292f', text2: '#57606a', text3: '#6e7781', accent: '#0969da', accent2: '#0550ae', success: '#1a7f37', border: '#d0d7de', shadow: '0 2px 8px rgba(31, 35, 40, 0.15)' },
  gruvboxDark: { bg: '#282828', bg2: '#32302f', bg3: '#3c3836', hover: '#45403d', text: '#ebdbb2', text2: '#d5c4a1', text3: '#bdae93', accent: '#fe8019', accent2: '#fabd2f', success: '#b8bb26', border: '#504945', shadow: '0 2px 8px rgba(0, 0, 0, 0.35)' },
  gruvboxLight: { bg: '#fbf1c7', bg2: '#f2e5bc', bg3: '#ebdbb2', hover: '#d5c4a1', text: '#3c3836', text2: '#504945', text3: '#665c54', accent: '#af3a03', accent2: '#b57614', success: '#79740e', border: '#d5c4a1', shadow: '0 2px 8px rgba(60, 56, 54, 0.15)' },
  highContrastDark: { bg: '#000000', bg2: '#111111', bg3: '#1b1b1b', hover: '#262626', text: '#ffffff', text2: '#d9d9d9', text3: '#a6a6a6', accent: '#00ffff', accent2: '#ff00ff', success: '#00ff00', border: '#444444', shadow: '0 2px 8px rgba(0, 0, 0, 0.5)' },
  highContrastLight: { bg: '#ffffff', bg2: '#f8f8f8', bg3: '#eeeeee', hover: '#e0e0e0', text: '#000000', text2: '#222222', text3: '#444444', accent: '#0000ff', accent2: '#cc0000', success: '#008000', border: '#bdbdbd', shadow: '0 2px 8px rgba(0, 0, 0, 0.15)' },
  materialDark: { bg: '#263238', bg2: '#2c3943', bg3: '#344955', hover: '#3d5666', text: '#eceff1', text2: '#b0bec5', text3: '#90a4ae', accent: '#80cbc4', accent2: '#4dd0e1', success: '#81c784', border: '#455a64', shadow: '0 2px 8px rgba(0, 0, 0, 0.35)' },
  materialLight: { bg: '#fafafa', bg2: '#f4f7fb', bg3: '#e9eef5', hover: '#dfe7ef', text: '#263238', text2: '#546e7a', text3: '#78909c', accent: '#00897b', accent2: '#0277bd', success: '#2e7d32', border: '#cfd8dc', shadow: '0 2px 8px rgba(31, 35, 40, 0.15)' },
  materialOcean: { bg: '#263238', bg2: '#2a3a43', bg3: '#31424b', hover: '#3b4d58', text: '#eceff1', text2: '#b0bec5', text3: '#90a4ae', accent: '#82aaff', accent2: '#7fdbca', success: '#c3e88d', border: '#40515c', shadow: '0 2px 8px rgba(0, 0, 0, 0.35)' },
  monokai: { bg: '#272822', bg2: '#2d2e27', bg3: '#383a2f', hover: '#44453b', text: '#f8f8f2', text2: '#cfcfc2', text3: '#8f908a', accent: '#f92672', accent2: '#a6e22e', success: '#a6e22e', border: '#3e3d32', shadow: '0 2px 8px rgba(0, 0, 0, 0.35)' },
  nord: { bg: '#2e3440', bg2: '#3b4252', bg3: '#434c5e', hover: '#4c566a', text: '#eceff4', text2: '#d8dee9', text3: '#81a1c1', accent: '#88c0d0', accent2: '#81a1c1', success: '#a3be8c', border: '#4c566a', shadow: '0 2px 8px rgba(0, 0, 0, 0.35)' },
  palenight: { bg: '#292d3e', bg2: '#31364a', bg3: '#3b4060', hover: '#454a6a', text: '#a6accd', text2: '#8f97b2', text3: '#676e95', accent: '#c792ea', accent2: '#82aaff', success: '#c3e88d', border: '#3c4155', shadow: '0 2px 8px rgba(0, 0, 0, 0.35)' },
  solarizedDark: { bg: '#002b36', bg2: '#073642', bg3: '#0b3a47', hover: '#124957', text: '#eee8d5', text2: '#93a1a1', text3: '#586e75', accent: '#268bd2', accent2: '#2aa198', success: '#859900', border: '#0f4c5c', shadow: '0 2px 8px rgba(0, 0, 0, 0.35)' },
  solarizedLight: { bg: '#fdf6e3', bg2: '#eee8d5', bg3: '#e6d8b1', hover: '#e0cda0', text: '#657b83', text2: '#586e75', text3: '#93a1a1', accent: '#268bd2', accent2: '#2aa198', success: '#859900', border: '#d8caa8', shadow: '0 2px 8px rgba(31, 35, 40, 0.15)' },
  synthwave84: { bg: '#2b213a', bg2: '#35274a', bg3: '#3f2d58', hover: '#4a3567', text: '#f2f4ff', text2: '#c7c5e1', text3: '#9a95c4', accent: '#f92aad', accent2: '#36f9f6', success: '#5ad1aa', border: '#513a6b', shadow: '0 2px 8px rgba(0, 0, 0, 0.35)' },
  tokyoNightDay: { bg: '#dfe5f2', bg2: '#cfd7ea', bg3: '#c0cae0', hover: '#b1bdd5', text: '#1f2335', text2: '#444b6a', text3: '#565f89', accent: '#2e7de9', accent2: '#8c6ff7', success: '#1d7a5f', border: '#b6c1d5', shadow: '0 2px 8px rgba(31, 35, 40, 0.15)' },
  tokyoNightStorm: { bg: '#1a1b26', bg2: '#24283b', bg3: '#2f334d', hover: '#393f5a', text: '#c0caf5', text2: '#a9b1d6', text3: '#747cb8', accent: '#7aa2f7', accent2: '#bb9af7', success: '#9ece6a', border: '#363b54', shadow: '0 2px 8px rgba(0, 0, 0, 0.35)' },
  volcano: { bg: '#1f1f28', bg2: '#2a2a38', bg3: '#343445', hover: '#3e3e53', text: '#dcd7ba', text2: '#a5a9c8', text3: '#6a6f93', accent: '#ff9e64', accent2: '#7dcfff', success: '#98bb6c', border: '#3a3a4d', shadow: '0 2px 8px rgba(0, 0, 0, 0.35)' },
  vsCodeDark: { bg: '#1e1e1e', bg2: '#252526', bg3: '#2d2d30', hover: '#3c3c3c', text: '#d4d4d4', text2: '#b3b3b3', text3: '#8c8c8c', accent: '#007acc', accent2: '#0e639c', success: '#6a9955', border: '#3c3c3c', shadow: '0 2px 8px rgba(0, 0, 0, 0.35)' },
  vsCodeLight: { bg: '#ffffff', bg2: '#f3f3f3', bg3: '#e8eef5', hover: '#dce4ed', text: '#1f1f1f', text2: '#4f4f4f', text3: '#707070', accent: '#007acc', accent2: '#005a9e', success: '#22863a', border: '#d0d7de', shadow: '0 2px 8px rgba(31, 35, 40, 0.15)' }
};

let currentSettings = {
  projectPath: '',
  theme: 'vsCodeDark',
  themeCategory: 'dark'
};

function getRecentProjects() {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function saveRecentProjects(list) {
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(list.slice(0, 5)));
  } catch (e) {
    // ignore
  }
}

function addRecentProject(p) {
  if (!p) return;
  const list = getRecentProjects().filter(x => x !== p);
  list.unshift(p);
  saveRecentProjects(list);
}

function renderRecentProjects() {
  const treeElement = document.getElementById('fileTree');
  if (!treeElement) return;
  
  treeElement.innerHTML = '';
  const container = document.createElement('div');
  container.className = 'recent-projects';

  const buttonsRow = document.createElement('div');
  buttonsRow.style.display = 'flex';
  buttonsRow.style.flexDirection = 'column';
  buttonsRow.style.gap = '8px';
  buttonsRow.style.padding = '12px 8px';

  const openBtn = document.createElement('button');
  openBtn.className = 'btn-header open-project-btn';
  openBtn.textContent = 'فتح مشروع...';
  openBtn.addEventListener('click', async () => {
    await openFolder();
  });

  const createBtn = document.createElement('button');
  createBtn.className = 'btn-header open-project-btn';
  createBtn.textContent = 'إنشاء مشروع جديد...';
  createBtn.addEventListener('click', async () => {
    await createNewProject();
  });

  buttonsRow.appendChild(openBtn);
  buttonsRow.appendChild(createBtn);
  container.appendChild(buttonsRow);
  treeElement.appendChild(container);
}

function getFolderIcon(isExpanded) {
  if (isExpanded) {
    return '<svg class="tree-item-icon" fill="currentColor" viewBox="0 0 16 16"><path d="M.54 3.87L.5 3a2 2 0 0 1 2-2h3.672a2 2 0 0 1 1.414.586l.828.828A2 2 0 0 0 9.828 3h3.982a2 2 0 0 1 1.992 2.181L14.65 8H2.826a2 2 0 0 0-1.991 1.819l-.637 7a1.99 1.99 0 0 1 .342-1.31zM1 8.5A1.5 1.5 0 0 1 2.5 7h11A1.5 1.5 0 0 1 15 8.5v5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 13.5v-5z"/></svg>';
  }
  return '<svg class="tree-item-icon" fill="currentColor" viewBox="0 0 16 16"><path d="M.54 3.87L.5 3a2 2 0 0 1 2-2h3.672a2 2 0 0 1 1.414.586l.828.828A2 2 0 0 0 9.828 3h3.982a2 2 0 0 1 1.992 2.181l-.637 7A2 2 0 0 1 13.174 14H2.826a2 2 0 0 1-1.991-1.819l-.637-7a1.99 1.99 0 0 1 .342-1.31zM2.19 4a1 1 0 0 0-.996 1.09l.637 7a1 1 0 0 0 .995.91h10.348a1 1 0 0 0 .995-.91l.637-7A1 1 0 0 0 13.81 4H2.19z"/></svg>';
}

function getThemeConfig(themeKey) {
  return THEME_CATALOG.find(t => t.key === themeKey) || THEME_CATALOG.find(t => t.key === 'vsCodeDark');
}

function applyThemeToIDE(themeKey) {
  const palette = UI_THEMES[themeKey] || UI_THEMES.vsCodeDark;
  const root = document.documentElement;
  root.style.setProperty('--bg-primary', palette.bg);
  root.style.setProperty('--bg-secondary', palette.bg2);
  root.style.setProperty('--bg-tertiary', palette.bg3);
  root.style.setProperty('--bg-hover', palette.hover);
  root.style.setProperty('--text-primary', palette.text);
  root.style.setProperty('--text-secondary', palette.text2);
  root.style.setProperty('--text-tertiary', palette.text3);
  root.style.setProperty('--accent-primary', palette.accent);
  root.style.setProperty('--accent-secondary', palette.accent2);
  root.style.setProperty('--accent-success', palette.success);
  root.style.setProperty('--border-color', palette.border);
  root.style.setProperty('--shadow', palette.shadow);
}

function applyThemeToEditor(themeKey) {
  const themeConfig = getThemeConfig(themeKey);
  if (!themeConfig || !editorView) return;
  editorView.dispatch({
    effects: editorThemeCompartment.reconfigure(themeConfig.cm)
  });
}

function updateWelcomeLogoByCategory(category) {
  const logo = document.getElementById('welcomeLogo');
  if (!logo) return;
  const darkSrc = logo.getAttribute('data-dark-src') || 'logo-dark.png';
  const lightSrc = logo.getAttribute('data-light-src') || 'logo.png';
  logo.src = category === 'light' ? lightSrc : darkSrc;
}

function applyCurrentTheme() {
  applyThemeToIDE(currentSettings.theme);
  updateWelcomeLogoByCategory(currentSettings.themeCategory);
  applyThemeToEditor(currentSettings.theme);
}

function populateThemeSelect() {
  const select = document.getElementById('themeSelect');
  if (!select) return;
  select.innerHTML = '';

  const groups = {
    dark: document.createElement('optgroup'),
    light: document.createElement('optgroup')
  };
  groups.dark.label = 'Dark Themes';
  groups.light.label = 'Light Themes';

  for (const theme of THEME_CATALOG) {
    const option = document.createElement('option');
    option.value = theme.key;
    option.textContent = theme.label;
    groups[theme.category].appendChild(option);
  }

  select.appendChild(groups.dark);
  select.appendChild(groups.light);
  select.value = currentSettings.theme;
}

async function loadSettings() {
  try {
    const loaded = await window.api.readSettings();
    const selectedTheme = getThemeConfig(loaded?.theme || 'vsCodeDark');
    currentSettings = {
      projectPath: loaded?.projectPath || '',
      theme: selectedTheme.key,
      themeCategory: selectedTheme.category
    };
  } catch (e) {
    const fallbackTheme = getThemeConfig('vsCodeDark');
    currentSettings = {
      projectPath: '',
      theme: fallbackTheme.key,
      themeCategory: fallbackTheme.category
    };
  }

  const projectPathInput = document.getElementById('projectPathInput');
  if (projectPathInput) projectPathInput.value = currentSettings.projectPath;
  populateThemeSelect();
  applyCurrentTheme();
}

async function saveSettings() {
  try {
    await window.api.writeSettings(currentSettings);
    alert('تم حفظ الإعدادات');
  } catch (e) {
    console.error('Failed saving settings:', e);
    alert('تعذر حفظ الإعدادات');
  }
}

async function chooseProjectPath() {
  try {
    const selectedPath = await window.api.selectProjectPath();
    if (!selectedPath) return;
    currentSettings.projectPath = selectedPath;
    const projectPathInput = document.getElementById('projectPathInput');
    if (projectPathInput) projectPathInput.value = selectedPath;
  } catch (e) {
    console.error('Failed selecting project path:', e);
    alert('تعذر اختيار المسار');
  }
}

function handleThemeSelection(themeKey) {
  const selectedTheme = getThemeConfig(themeKey);
  currentSettings.theme = selectedTheme.key;
  currentSettings.themeCategory = selectedTheme.category;
  applyCurrentTheme();
}

function getTabById(id) {
  return openTabs.find(tab => tab.id === id);
}

function getActiveTab() {
  return getTabById(activeTabId);
}

function snapshotActiveTab() {
  const activeTab = getActiveTab();
  if (!activeTab || activeTab.type !== 'file' || !editorView) return;
  activeTab.doc = editorView.state.doc.toString();
  activeTab.isDirty = isModified;
}

function renderTabs() {
  const tabsEl = document.getElementById('tabs');
  if (!tabsEl) return;
  tabsEl.innerHTML = '';

  for (const tab of openTabs) {
    const tabEl = document.createElement('div');
    tabEl.className = 'tab';
    if (tab.id === activeTabId) tabEl.classList.add('active');
    if (tab.isDirty) tabEl.classList.add('dirty');

    const title = document.createElement('span');
    title.className = 'tab-title';
    title.textContent = tab.title;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'tab-close';
    closeBtn.type = 'button';
    closeBtn.title = 'إغلاق';
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await closeTab(tab.id);
    });

    tabEl.addEventListener('click', () => {
      setActiveTab(tab.id);
    });

    tabEl.appendChild(title);
    tabEl.appendChild(closeBtn);
    tabsEl.appendChild(tabEl);
  }

  const closeAllBtn = document.getElementById('closeAllTabsBtn');
  if (closeAllBtn) closeAllBtn.disabled = openTabs.length === 0;
}

function showWelcomeView() {
  const welcome = document.getElementById('welcome');
  const editor = document.getElementById('editor');
  const settingsPane = document.getElementById('settingsPane');
  if (welcome) welcome.classList.remove('view-hidden');
  if (editor) editor.classList.add('view-hidden');
  if (settingsPane) settingsPane.classList.add('view-hidden');
}

function showEditorView() {
  const welcome = document.getElementById('welcome');
  const editor = document.getElementById('editor');
  const settingsPane = document.getElementById('settingsPane');
  if (welcome) welcome.classList.add('view-hidden');
  if (editor) editor.classList.remove('view-hidden');
  if (settingsPane) settingsPane.classList.add('view-hidden');
}

function showSettingsView() {
  const welcome = document.getElementById('welcome');
  const editor = document.getElementById('editor');
  const settingsPane = document.getElementById('settingsPane');
  if (welcome) welcome.classList.add('view-hidden');
  if (editor) editor.classList.add('view-hidden');
  if (settingsPane) settingsPane.classList.remove('view-hidden');
}

function renderWelcomeRecents() {
  const recentsEl = document.getElementById('welcomeRecents');
  if (!recentsEl) return;
  const recents = getRecentProjects();
  recentsEl.innerHTML = '';

  if (!recents || recents.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'welcome-empty';
    empty.textContent = 'لا توجد مشاريع سابقة بعد.';
    recentsEl.appendChild(empty);
    return;
  }

  for (const p of recents.slice(0, 5)) {
    const item = document.createElement('div');
    item.className = 'welcome-recent';
    const name = p.split('/').pop();
    item.innerHTML = `<div class="name">${name}</div><div class="path">${p}</div>`;
    item.title = p;
    item.addEventListener('click', async () => {
      try {
        currentFolder = p;
        await loadFileTree(p);
        addRecentProject(p);
        renderWelcomeRecents();
      } catch (err) {
        console.error('Failed opening recent project:', err);
        alert('فشل فتح المشروع: ' + err.message);
      }
    });
    recentsEl.appendChild(item);
  }
}

function updateWelcomeMode() {
  const welcome = document.getElementById('welcome');
  if (!welcome) return;
  const hasProject = Boolean(currentFolder);
  welcome.classList.toggle('project-open', hasProject);
}

function ensureActiveView() {
  if (openTabs.length === 0) {
    showWelcomeView();
    updateWelcomeMode();
    return;
  }

  const activeTab = getActiveTab();
  if (!activeTab) {
    showWelcomeView();
    return;
  }

  if (activeTab.type === 'settings') {
    showSettingsView();
  } else {
    showEditorView();
  }
}

// Initialize editor
function initEditor() {
  const state = EditorState.create({
    doc: '',
    extensions: [
      lineNumbers(),
      highlightActiveLine(),
      bracketMatching(),
      EditorView.lineWrapping,
      EditorView.theme({
        '&': {
          height: '100%',
          direction: 'rtl'
        },
        '.cm-scroller': {
          fontFamily: 'IBM Plex Mono, monospace',
          direction: 'rtl'
        },
        '.cm-gutters': {
          borderRight: 'none',
          direction: 'ltr',
          minWidth: '40px'
        },
        '.cm-lineNumbers .cm-gutterElement': {
          padding: '0 8px 0 4px',
          minWidth: '32px'
        },
        '.cm-content': {
          direction: 'rtl',
          unicodeBidi: 'plaintext'
        },
        '.cm-line': {
          direction: 'rtl',
          unicodeBidi: 'plaintext'
        }
      }),
      editorThemeCompartment.of(getThemeConfig(currentSettings.theme).cm),

      // ── Daad language: tokenizer + highlighting + autocomplete ──────────
      // This single call replaces both python() and the separate
      // autocompletion({ override: [daadCompletions] }) that was here before.
      daad(),

      syntaxHighlighting(defaultHighlightStyle),
      keymap.of([
        ...defaultKeymap,
        ...completionKeymap,
        indentWithTab,
        {
          key: 'Ctrl-d',
          run: () => { selectNextOccurrence(); return true; }
        },
        {
          key: 'Mod-d',
          run: () => { selectNextOccurrence(); return true; }
        },
        {
          key: 'Ctrl-Shift-k',
          run: () => { deleteLine(); return true; }
        },
        {
          key: 'Mod-/',
          run: () => { toggleLineComment(); return true; }
        },
        {
          key: 'Mod-p',
          run: () => { toggleSettingsTab(); return true; }
        },
        {
          key: 'Mod-`',
          run: () => { toggleTerminalPanel(); return true; }
        },
        {
          key: 'Mod-b',
          run: () => { toggleSidebar(); return true; }
        },
        {
          key: 'Mod-Shift-p',
          run: () => {
            const cmd = prompt('أدخل أمرًا (ميزة الاختصار غير مفعلة)');
            if (cmd) alert('أمر غير مدعوم: ' + cmd);
            return true;
          }
        },
        {
          key: 'Ctrl-s',
          run: () => { saveCurrentFile(); return true; }
        },
        {
          key: 'F5',
          run: () => { runCurrentFile(); return true; }
        }
      ]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged && !suppressDocChange) {
          const activeTab = getActiveTab();
          if (activeTab && activeTab.type === 'file') {
            isModified = true;
            activeTab.isDirty = true;
            updateSaveButton();
            renderTabs();
          }
        }
      })
    ]
  });

  editorView = new EditorView({
    state,
    parent: document.getElementById('editor')
  });
}

// Editor helper commands
function deleteLine() {
  if (!editorView) return;
  const { state } = editorView;
  const tr = state.changeByRange(range => {
    const pos = range.from;
    const line = state.doc.lineAt(pos);
    const toRemove = line.to < state.doc.length ? line.to + 1 : line.to;
    return { changes: { from: line.from, to: toRemove }, range: EditorSelection.cursor(line.from) };
  });
  editorView.dispatch(tr);
}

function toggleLineComment() {
  if (!editorView) return;
  const { state } = editorView;
  const changes = [];
  const lines = [];
  const sel = state.selection.main;
  const startLine = state.doc.lineAt(sel.from).number;
  const endLine = state.doc.lineAt(sel.to).number;
  let allCommented = true;
  for (let n = startLine; n <= endLine; n++) {
    const line = state.doc.line(n);
    lines.push(line);
    if (!line.text.trim().startsWith('#')) allCommented = false;
  }
  for (const line of lines) {
    if (allCommented) {
      const idx = line.text.indexOf('#');
      if (idx !== -1) {
        changes.push({ from: line.from + idx, to: line.from + idx + 1, insert: '' });
      }
    } else {
      changes.push({ from: line.from, insert: '#' });
    }
  }
  if (changes.length > 0) editorView.dispatch({ changes });
}

function getWordRangeAt(state, pos) {
  const line = state.doc.lineAt(pos);
  let start = pos;
  let end = pos;
  while (start > line.from) {
    const ch = state.doc.sliceString(start - 1, start);
    if (/\w/.test(ch)) start--; else break;
  }
  while (end < line.to) {
    const ch = state.doc.sliceString(end, end + 1);
    if (/\w/.test(ch)) end++; else break;
  }
  return { from: start, to: end, text: state.doc.sliceString(start, end) };
}

function selectNextOccurrence() {
  if (!editorView) return;
  const state = editorView.state;
  const docText = state.doc.toString();
  const ranges = Array.from(state.selection.ranges);
  const last = ranges[ranges.length - 1];
  let selFrom = last.from, selTo = last.to;
  let selectedText = selFrom === selTo
    ? getWordRangeAt(state, selFrom).text
    : state.doc.sliceString(selFrom, selTo);
  if (!selectedText) return;

  let idx = docText.indexOf(selectedText, selTo);
  const isOverlapping = (start, end) => ranges.some(r => !(end <= r.from || start >= r.to));
  while (idx !== -1 && isOverlapping(idx, idx + selectedText.length)) {
    idx = docText.indexOf(selectedText, idx + 1);
  }
  if (idx === -1) {
    idx = docText.indexOf(selectedText, 0);
    while (idx !== -1 && isOverlapping(idx, idx + selectedText.length)) {
      idx = docText.indexOf(selectedText, idx + 1);
    }
  }
  if (idx === -1) return;

  const newRange = EditorSelection.range(idx, idx + selectedText.length);
  const newSelection = EditorSelection.create([...ranges, newRange]);
  editorView.dispatch({ selection: newSelection, scrollIntoView: true });
}

function toggleSidebar() {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;
  const isCollapsed = sidebar.classList.toggle('collapsed');
  const toggleBtn = document.getElementById('toggleSidebarBtn');
  if (toggleBtn) {
    toggleBtn.setAttribute('aria-pressed', String(!isCollapsed));
  }
}

function toggleTerminalPanel() {
  const terminal = document.getElementById('terminalPanel');
  if (!terminal) return;
  terminal.classList.toggle('hidden');
}

function setActiveTab(tabId) {
  const nextTab = getTabById(tabId);
  if (!nextTab) return;

  snapshotActiveTab();
  activeTabId = tabId;
  isModified = Boolean(nextTab.isDirty);

  if (nextTab.type === 'file') {
    currentFile = nextTab.path;
    showEditorView();

    if (editorView) {
      suppressDocChange = true;
      try {
        editorView.dispatch({
          changes: {
            from: 0,
            to: editorView.state.doc.length,
            insert: nextTab.doc || ''
          }
        });
      } finally {
        suppressDocChange = false;
      }
    }

    document.querySelectorAll('.tree-item').forEach(item => {
      item.classList.remove('selected');
      if (item.dataset.path === nextTab.path) {
        item.classList.add('selected');
      }
    });
  } else if (nextTab.type === 'settings') {
    currentFile = null;
    isModified = false;
    showSettingsView();
  } else {
    currentFile = null;
    isModified = false;
    showWelcomeView();
  }

  renderTabs();
  updateSaveButton();
}

function openSettingsTab() {
  const existing = openTabs.find(tab => tab.type === 'settings');
  if (existing) {
    setActiveTab(existing.id);
    return;
  }
  const tab = { id: 'settings', type: 'settings', title: 'الإعدادات' };
  openTabs.push(tab);
  setActiveTab(tab.id);
}

function toggleSettingsTab() {
  const activeTab = getActiveTab();
  if (activeTab && activeTab.type === 'settings') {
    closeTab(activeTab.id);
    return;
  }
  openSettingsTab();
}

async function saveTab(tab) {
  if (!tab || tab.type !== 'file') return;
  const content = tab.id === activeTabId && editorView
    ? editorView.state.doc.toString()
    : (tab.doc || '');
  await window.api.writeFile(tab.path, content);
  tab.doc = content;
  tab.isDirty = false;
  if (tab.id === activeTabId) {
    isModified = false;
    updateSaveButton();
  }
  renderTabs();
}

async function closeTab(tabId) {
  const tabIndex = openTabs.findIndex(tab => tab.id === tabId);
  if (tabIndex === -1) return;
  const tab = openTabs[tabIndex];

  if (tab.isDirty) {
    const shouldSave = confirm('هل تريد حفظ التغييرات قبل الإغلاق؟');
    if (shouldSave) await saveTab(tab);
  }

  openTabs.splice(tabIndex, 1);

  if (activeTabId === tabId) {
    const nextTab = openTabs[tabIndex] || openTabs[tabIndex - 1];
    if (nextTab) {
      setActiveTab(nextTab.id);
    } else {
      activeTabId = null;
      currentFile = null;
      isModified = false;
      renderTabs();
      updateSaveButton();
      ensureActiveView();
    }
  } else {
    renderTabs();
  }
}

async function closeAllTabs() {
  const dirtyTabs = openTabs.filter(tab => tab.isDirty);
  if (dirtyTabs.length > 0) {
    const shouldSave = confirm('هل تريد حفظ جميع التغييرات قبل الإغلاق؟');
    if (shouldSave) {
      for (const tab of dirtyTabs) await saveTab(tab);
    }
  }
  openTabs = [];
  activeTabId = null;
  currentFile = null;
  isModified = false;
  renderTabs();
  updateSaveButton();
  ensureActiveView();
}

async function openFolder() {
  try {
    const folderPath = await window.api.openFolderDialog();
    if (folderPath) {
      currentFolder = folderPath;
      await loadFileTree(folderPath);
      addRecentProject(folderPath);
      renderWelcomeRecents();
      updateWelcomeMode();
    }
  } catch (error) {
    console.error('Failed to open folder:', error);
    alert('فشل فتح المجلد: ' + error.message);
  }
}

function showProjectNameModal() {
  const modal = document.getElementById('projectNameModal');
  const input = document.getElementById('projectNameInput');
  input.value = '';
  input.focus();
  modal.classList.remove('hidden');
}

function hideProjectNameModal() {
  document.getElementById('projectNameModal').classList.add('hidden');
}

async function submitProjectName() {
  const input = document.getElementById('projectNameInput');
  const projectName = input.value.trim();
  if (!projectName) {
    alert('يرجى إدخال اسم المشروع');
    return;
  }
  hideProjectNameModal();
  try {
    const folderPath = await window.api.createProjectFolder(projectName, currentSettings.projectPath);
    if (folderPath) {
      currentFolder = folderPath;
      await loadFileTree(folderPath);
      addRecentProject(folderPath);
      renderWelcomeRecents();
      updateWelcomeMode();
    }
  } catch (error) {
    console.error('Failed to create project:', error);
    alert('فشل إنشاء المشروع: ' + error.message);
  }
}

function createNewProject() {
  showProjectNameModal();
}

async function loadFileTree(dirPath) {
  try {
    const entries = await window.api.readDirectory(dirPath);
    const treeElement = document.getElementById('fileTree');
    treeElement.innerHTML = '';
    fileTree = {};

    entries.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name, 'ar');
    });

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const { wrapper } = createTreeItem(entry);
      treeElement.appendChild(wrapper);
      if (entry.isDirectory) {
        await loadDirectoryRecursive(entry.path, wrapper);
      }
    }
    updateWelcomeMode();
  } catch (error) {
    console.error('Failed to load file tree:', error);
  }
}

async function loadDirectoryRecursive(dirPath, parentWrapper, depth = 0) {
  if (depth > 2) return;
  try {
    const entries = await window.api.readDirectory(dirPath);
    const childContainer = document.createElement('div');
    childContainer.className = 'tree-children';
    childContainer.style.display = 'none';

    entries.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name, 'ar');
    });

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const { wrapper } = createTreeItem(entry);
      childContainer.appendChild(wrapper);
      if (entry.isDirectory) {
        await loadDirectoryRecursive(entry.path, wrapper, depth + 1);
      }
    }

    if (childContainer.children.length > 0) {
      parentWrapper.appendChild(childContainer);
      const parentItem = parentWrapper.querySelector(':scope > .tree-item');
      if (parentItem) {
        parentItem.addEventListener('click', (e) => {
          e.stopPropagation();
          const isExpanded = childContainer.style.display !== 'none';
          childContainer.style.display = isExpanded ? 'none' : 'block';
          parentItem.classList.toggle('expanded', !isExpanded);
          const iconSvg = parentItem.querySelector('.tree-item-icon');
          if (iconSvg) iconSvg.outerHTML = getFolderIcon(!isExpanded);
        });
      }
    }
  } catch (error) {
    console.error('Failed to load directory:', error);
  }
}

function createTreeItem(entry) {
  const wrapper = document.createElement('div');
  wrapper.className = 'tree-entry';
  wrapper.dataset.path = entry.path;

  const item = document.createElement('div');
  item.className = 'tree-item';

  if (entry.isDirectory) {
    item.classList.add('directory');
    item.innerHTML = `${getFolderIcon(false)}<span>${entry.name}</span>`;
  } else {
    item.innerHTML = `
      <svg class="tree-item-icon file-icon" fill="#777777" viewBox="0 0 24 24">
        <path d="M6 2h9l5 5v13a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2zm8 1v5h5M8 11h8v2H8v-2zm0 4h8v2H8v-2z"/>
      </svg>
      <span>${entry.name}</span>
    `;
    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      await openFile(entry.path);
    });
  }

  wrapper.appendChild(item);
  return { wrapper, item };
}

async function openFile(filePath) {
  try {
    const existing = openTabs.find(tab => tab.type === 'file' && tab.path === filePath);
    if (existing) {
      setActiveTab(existing.id);
      return;
    }

    const activeTab = getActiveTab();
    if (activeTab && activeTab.type === 'file' && activeTab.isDirty) {
      const shouldSave = confirm('هل تريد حفظ التغييرات؟');
      if (shouldSave) await saveCurrentFile();
    }

    const content = await window.api.readFile(filePath);
    const name = filePath.split('/').pop();

    const newTab = {
      id: filePath,
      type: 'file',
      title: name,
      path: filePath,
      doc: content,
      isDirty: false
    };

    openTabs.push(newTab);
    setActiveTab(newTab.id);
  } catch (error) {
    console.error('Failed to open file:', error);
    alert('فشل فتح الملف: ' + error.message);
  }
}

async function saveCurrentFile() {
  const activeTab = getActiveTab();
  if (!activeTab || activeTab.type !== 'file' || !currentFile) return;
  try {
    const content = editorView.state.doc.toString();
    await window.api.writeFile(currentFile, content);
    activeTab.doc = content;
    activeTab.isDirty = false;
    isModified = false;
    updateSaveButton();
    renderTabs();
  } catch (error) {
    console.error('Failed to save file:', error);
    alert('فشل حفظ الملف: ' + error.message);
  }
}

function updateSaveButton() {
  const saveBtn = document.getElementById('saveBtn');
  saveBtn.disabled = !isModified;
}

async function runCurrentFile() {
  if (!currentFile) {
    alert('لا يوجد ملف مفتوح للتشغيل');
    return;
  }
  if (isModified) await saveCurrentFile();

  const terminal = document.getElementById('terminalPanel');
  const output = document.getElementById('terminalOutput');
  terminal.classList.remove('hidden');
  output.innerHTML = '<div class="terminal-line terminal-stdout">جاري التشغيل...</div>';

  try {
    if (!daadOutputUnsub) {
      daadOutputUnsub = window.api.onDaadOutput((data) => {
        const line = document.createElement('div');
        line.className = `terminal-line terminal-${data.type}`;
        line.textContent = data.data;
        output.appendChild(line);
        output.scrollTop = output.scrollHeight;
      });
    }

    const result = await window.api.runDaad(currentFile);

    const completionLine = document.createElement('div');
    completionLine.className = 'terminal-line terminal-stdout';
    completionLine.textContent = `\nانتهى التشغيل برمز الخروج: ${result.code}`;
    output.appendChild(completionLine);
    output.scrollTop = output.scrollHeight;
  } catch (error) {
    const errorLine = document.createElement('div');
    errorLine.className = 'terminal-line terminal-stderr';
    errorLine.textContent = 'خطأ في التشغيل: ' + error.message;
    output.appendChild(errorLine);
    output.scrollTop = output.scrollHeight;
  }
}

// ── Event listeners ──────────────────────────────────────────────────────────

document.getElementById('openFolderBtn').addEventListener('click', openFolder);
document.getElementById('runBtn').addEventListener('click', runCurrentFile);
document.getElementById('saveBtn').addEventListener('click', saveCurrentFile);
document.getElementById('toggleSidebarBtn').addEventListener('click', toggleSidebar);
document.getElementById('openSettingsTabBtn').addEventListener('click', toggleSettingsTab);
document.getElementById('closeAllTabsBtn').addEventListener('click', closeAllTabs);
document.getElementById('welcomeOpenFolderBtn').addEventListener('click', openFolder);
document.getElementById('welcomeSettingsBtn').addEventListener('click', toggleSettingsTab);
document.getElementById('closeTerminalBtn').addEventListener('click', () => {
  document.getElementById('terminalPanel').classList.add('hidden');
});

document.getElementById('projectPathBtn').addEventListener('click', chooseProjectPath);
document.getElementById('themeSelect').addEventListener('change', (e) => {
  handleThemeSelection(e.target.value);
});
document.getElementById('saveSettingsBtn').addEventListener('click', saveSettings);

document.getElementById('projectNameSubmit').addEventListener('click', submitProjectName);
document.getElementById('projectNameCancel').addEventListener('click', hideProjectNameModal);
document.getElementById('projectNameInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); submitProjectName(); }
  if (e.key === 'Escape') { e.preventDefault(); hideProjectNameModal(); }
});
document.getElementById('projectNameModal').addEventListener('click', (e) => {
  if (e.target.id === 'projectNameModal' || e.target.classList.contains('modal-overlay')) {
    hideProjectNameModal();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.defaultPrevented) return;
  const target = e.target;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
  const isMod = e.ctrlKey || e.metaKey;
  if (!isMod) return;

  if (e.key === 'b' || e.key === 'B') { e.preventDefault(); toggleSidebar(); return; }
  if (e.key === 'p' || e.key === 'P') { e.preventDefault(); toggleSettingsTab(); return; }
  if (e.key === '`') { e.preventDefault(); toggleTerminalPanel(); }
});

// ── Terminal stdin ────────────────────────────────────────────────────────────

const terminalInput = document.getElementById('terminalInput');
const sendStdinBtn = document.getElementById('sendStdinBtn');
const endStdinBtn = document.getElementById('endStdinBtn');

async function sendStdin() {
  const val = terminalInput.value;
  if (!val) return;
  const output = document.getElementById('terminalOutput');

  const line = document.createElement('div');
  line.className = 'terminal-line terminal-stdin';
  line.textContent = val;
  output.appendChild(line);
  output.scrollTop = output.scrollHeight;

  try {
    await window.api.writeToDaadStdin(val + '\n');
  } catch (err) {
    console.warn('writeToDaadStdin failed:', err);
  }
  terminalInput.value = '';
}

async function endStdin() {
  const output = document.getElementById('terminalOutput');
  try {
    const ok = await window.api.endDaadStdin();
    if (ok) {
      const line = document.createElement('div');
      line.className = 'terminal-line terminal-stdin';
      line.textContent = '<EOF>';
      output.appendChild(line);
      output.scrollTop = output.scrollHeight;
    }
  } catch (err) {
    console.warn('endDaadStdin failed:', err);
  }
}

sendStdinBtn.addEventListener('click', sendStdin);
if (endStdinBtn) endStdinBtn.addEventListener('click', endStdin);
terminalInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); sendStdin(); }
});

// ── Boot ─────────────────────────────────────────────────────────────────────
async function initApp() {
  await loadSettings();
  initEditor();
  renderRecentProjects();
  renderWelcomeRecents();
  renderTabs();
  ensureActiveView();
}

initApp().catch((error) => {
  console.error('Failed to initialize app:', error);
});