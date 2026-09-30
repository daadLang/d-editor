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
import { daad } from './language/language.js';
import { api } from './wails-api.js';
import {
  applyThemeToIDE,
  getThemeConfig,
  populateThemeSelect,
  updateWelcomeLogoByCategory
} from './ui/theme-manager.js';
import { createInterpreterController } from './features/interpreter.js';
import { createProjectExplorer } from './features/project-explorer.js';

// State
let currentFile = null;
let currentFolder = null;
let editorView = null;
let isModified = false;
let daadOutputUnsub = null;
let openTabs = [];
let activeTabId = null;
let suppressDocChange = false;
let projectExplorer;

// Editor theme compartment for runtime switching
const editorThemeCompartment = new Compartment();


let currentSettings = {
  projectPath: '',
  theme: 'vsCodeDark',
  themeCategory: 'dark',
  interpreterPath: ''
};

const interpreterController = createInterpreterController({
  api,
  getSettings: () => currentSettings,
  onSettingsChanged: () => saveSettings()
});

function applyThemeToEditor(themeKey) {
  const themeConfig = getThemeConfig(themeKey);
  if (!themeConfig || !editorView) return;
  editorView.dispatch({
    effects: editorThemeCompartment.reconfigure(themeConfig.cm)
  });
}

function applyCurrentTheme() {
  applyThemeToIDE(currentSettings.theme);
  updateWelcomeLogoByCategory(currentSettings.themeCategory);
  applyThemeToEditor(currentSettings.theme);
}

async function loadSettings() {
  try {
    const loaded = await api.readSettings();
    const selectedTheme = getThemeConfig(loaded?.theme || 'vsCodeDark');
    currentSettings = {
      projectPath: loaded?.projectPath || '',
      theme: selectedTheme.key,
      themeCategory: selectedTheme.category,
      interpreterPath: loaded?.interpreterPath || ''
    };
  } catch (e) {
    const fallbackTheme = getThemeConfig('vsCodeDark');
    currentSettings = {
      projectPath: '',
      theme: fallbackTheme.key,
      themeCategory: fallbackTheme.category,
      interpreterPath: ''
    };
  }

  const projectPathInput = document.getElementById('projectPathInput');
  if (projectPathInput) projectPathInput.value = currentSettings.projectPath;
  populateThemeSelect(currentSettings.theme);
  applyCurrentTheme();
}

async function saveSettings() {
  try {
    await api.writeSettings(currentSettings);
    alert('تم حفظ الإعدادات');
  } catch (e) {
    console.error('Failed saving settings:', e);
    alert('تعذر حفظ الإعدادات');
  }
}

async function chooseProjectPath() {
  try {
    const selectedPath = await api.selectProjectPath();
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
  await api.writeFile(tab.path, content);
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
    const folderPath = await api.openFolderDialog();
    if (folderPath) {
      currentFolder = folderPath;
      await projectExplorer.loadFileTree(folderPath);
      projectExplorer.renderWelcomeRecents();
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
    const folderPath = await api.createProjectFolder(projectName, currentSettings.projectPath);
    if (folderPath) {
      currentFolder = folderPath;
      await projectExplorer.loadFileTree(folderPath);
      projectExplorer.renderWelcomeRecents();
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

    const content = await api.readFile(filePath);
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
    await api.writeFile(currentFile, content);
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
      daadOutputUnsub = api.onDaadOutput((data) => {
        const line = document.createElement('div');
        line.className = `terminal-line terminal-${data.type}`;
        line.textContent = data.data;
        output.appendChild(line);
        output.scrollTop = output.scrollHeight;
      });
    }

    const result = await api.runDaad(currentFile, currentSettings.interpreterPath);

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
    await api.writeToDaadStdin(val + '\n');
  } catch (err) {
    console.warn('writeToDaadStdin failed:', err);
  }
  terminalInput.value = '';
}

async function endStdin() {
  const output = document.getElementById('terminalOutput');
  try {
    const ok = await api.endDaadStdin();
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
  await interpreterController.refresh();
  initEditor();
  projectExplorer.renderRecentProjects(openFolder, createNewProject);
  projectExplorer.renderWelcomeRecents();
  renderTabs();
  ensureActiveView();
}

projectExplorer = createProjectExplorer({
  api,
  onOpenFile: openFile,
  onOpenProject: async projectPath => {
    currentFolder = projectPath;
    await projectExplorer.loadFileTree(projectPath);
    projectExplorer.renderWelcomeRecents();
    updateWelcomeMode();
  }
});

initApp().catch((error) => {
  console.error('Failed to initialize app:', error);
});