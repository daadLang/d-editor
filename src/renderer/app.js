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

const UI_PALETTES = {
  dark: {
    '--bg-primary': '#0f1117',
    '--bg-secondary': '#171b24',
    '--bg-tertiary': '#1e2430',
    '--bg-hover': '#273042',
    '--text-primary': '#e6edf3',
    '--text-secondary': '#b8c0cc',
    '--text-tertiary': '#8b96a7',
    '--accent-primary': '#4ea1ff',
    '--accent-secondary': '#2f81f7',
    '--accent-success': '#3fb950',
    '--border-color': '#30363d',
    '--shadow': '0 2px 8px rgba(0, 0, 0, 0.35)'
  },
  light: {
    '--bg-primary': '#ffffff',
    '--bg-secondary': '#f6f8fa',
    '--bg-tertiary': '#eef2f7',
    '--bg-hover': '#e6ebf2',
    '--text-primary': '#1f2328',
    '--text-secondary': '#57606a',
    '--text-tertiary': '#6e7781',
    '--accent-primary': '#0969da',
    '--accent-secondary': '#0550ae',
    '--accent-success': '#1a7f37',
    '--border-color': '#d0d7de',
    '--shadow': '0 2px 8px rgba(31, 35, 40, 0.15)'
  }
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

function applyThemeToIDE(category) {
  const palette = UI_PALETTES[category] || UI_PALETTES.dark;
  const root = document.documentElement;
  for (const [varName, value] of Object.entries(palette)) {
    root.style.setProperty(varName, value);
  }
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
  applyThemeToIDE(currentSettings.themeCategory);
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