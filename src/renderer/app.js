import { EditorView, keymap, highlightActiveLine, lineNumbers } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';
import { autocompletion, completionKeymap } from '@codemirror/autocomplete';
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching } from '@codemirror/language';
import { python } from '@codemirror/lang-python';
import { oneDark } from '@codemirror/theme-one-dark';
import { daadCompletions } from '../language/autocomplete.js';

// State
let currentFile = null;
let currentFolder = null;
let editorView = null;
let fileTree = {};
let isModified = false;

function getFolderIcon(isExpanded) {
  if (isExpanded) {
    return '<svg class="tree-item-icon" fill="currentColor" viewBox="0 0 16 16"><path d="M.54 3.87L.5 3a2 2 0 0 1 2-2h3.672a2 2 0 0 1 1.414.586l.828.828A2 2 0 0 0 9.828 3h3.982a2 2 0 0 1 1.992 2.181L14.65 8H2.826a2 2 0 0 0-1.991 1.819l-.637 7a1.99 1.99 0 0 1 .342-1.31zM1 8.5A1.5 1.5 0 0 1 2.5 7h11A1.5 1.5 0 0 1 15 8.5v5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 13.5v-5z"/></svg>';
  }
  return '<svg class="tree-item-icon" fill="currentColor" viewBox="0 0 16 16"><path d="M.54 3.87L.5 3a2 2 0 0 1 2-2h3.672a2 2 0 0 1 1.414.586l.828.828A2 2 0 0 0 9.828 3h3.982a2 2 0 0 1 1.992 2.181l-.637 7A2 2 0 0 1 13.174 14H2.826a2 2 0 0 1-1.991-1.819l-.637-7a1.99 1.99 0 0 1 .342-1.31zM2.19 4a1 1 0 0 0-.996 1.09l.637 7a1 1 0 0 0 .995.91h10.348a1 1 0 0 0 .995-.91l.637-7A1 1 0 0 0 13.81 4H2.19z"/></svg>';
}

// Initialize editor
function initEditor() {
  const rtlCompartment = new Compartment();
  
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
          backgroundColor: '#1a1a1a',
          borderLeft: '1px solid #333',
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
        },
        '.cm-gutters': {
          direction: 'ltr',
          backgroundColor: 'var(--bg-secondary)',
          borderRight: 'none',
          borderLeft: '1px solid var(--border-color)'
        }
      }),
      oneDark,
      python(), // Using Python for indentation logic
      autocompletion({
        override: [daadCompletions],
        activateOnTyping: true,
        closeOnBlur: true
      }),
      syntaxHighlighting(defaultHighlightStyle),
      keymap.of([
        ...defaultKeymap,
        ...completionKeymap,
        indentWithTab,
        {
          key: 'Ctrl-s',
          run: () => {
            saveCurrentFile();
            return true;
          }
        },
        {
          key: 'F5',
          run: () => {
            runCurrentFile();
            return true;
          }
        }
      ]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged && currentFile) {
          isModified = true;
          updateSaveButton();
        }
      }),
      rtlCompartment.of([])
    ]
  });

  editorView = new EditorView({
    state,
    parent: document.getElementById('editor')
  });
}

// File operations
async function openFolder() {
  try {
    const folderPath = await window.api.openFolderDialog();
    if (folderPath) {
      currentFolder = folderPath;
      await loadFileTree(folderPath);
    }
  } catch (error) {
    console.error('Failed to open folder:', error);
    alert('فشل فتح المجلد: ' + error.message);
  }
}

async function loadFileTree(dirPath) {
  try {
    const entries = await window.api.readDirectory(dirPath);
    const treeElement = document.getElementById('fileTree');
    treeElement.innerHTML = '';
    
    fileTree = {};
    
    // Sort: directories first, then files
    entries.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name, 'ar');
    });
    
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue; // Skip hidden files
      
      const { wrapper, item } = createTreeItem(entry);
      treeElement.appendChild(wrapper);
      
      if (entry.isDirectory) {
        await loadDirectoryRecursive(entry.path, wrapper);
      }
    }
  } catch (error) {
    console.error('Failed to load file tree:', error);
  }
}

async function loadDirectoryRecursive(dirPath, parentWrapper, depth = 0) {
  if (depth > 2) return; // Limit depth
  
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
      
      const { wrapper, item } = createTreeItem(entry);
      childContainer.appendChild(wrapper);
      
      if (entry.isDirectory) {
        await loadDirectoryRecursive(entry.path, wrapper, depth + 1);
      }
    }
    
    if (childContainer.children.length > 0) {
      parentWrapper.appendChild(childContainer);
      
      // Get the tree-item header inside the parent wrapper
      const parentItem = parentWrapper.querySelector(':scope > .tree-item');
      if (parentItem) {
        parentItem.addEventListener('click', (e) => {
          e.stopPropagation();
          const isExpanded = childContainer.style.display !== 'none';
          childContainer.style.display = isExpanded ? 'none' : 'block';
          parentItem.classList.toggle('expanded', !isExpanded);
          
          // Update folder icon
          const iconSvg = parentItem.querySelector('.tree-item-icon');
          if (iconSvg) {
            iconSvg.outerHTML = getFolderIcon(!isExpanded);
          }
        });
      }
    }
  } catch (error) {
    console.error('Failed to load directory:', error);
  }
}

function createTreeItem(entry) {
  // Create a wrapper for each entry (for directories, this will contain both header and children)
  const wrapper = document.createElement('div');
  wrapper.className = 'tree-entry';
  wrapper.dataset.path = entry.path;
  
  const item = document.createElement('div');
  item.className = 'tree-item';
  
  if (entry.isDirectory) {
    item.classList.add('directory');
    item.innerHTML = `
      ${getFolderIcon(false)}
      <span>${entry.name}</span>
    `;
  } else {
    const icon = {
    svg: 'M6 2h9l5 5v13a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2zm8 1v5h5M8 11h8v2H8v-2zm0 4h8v2H8v-2z',
    color: '#777777'
  };
    item.innerHTML = `
      <svg class="tree-item-icon file-icon" fill="${icon.color}" viewBox="0 0 24 24">
        <path d="${icon.svg}"/>
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
    if (isModified && currentFile) {
      const shouldSave = confirm('هل تريد حفظ التغييرات؟');
      if (shouldSave) {
        await saveCurrentFile();
      }
    }
    
    const content = await window.api.readFile(filePath);
    
    currentFile = filePath;
    
    editorView.dispatch({
      changes: {
        from: 0,
        to: editorView.state.doc.length,
        insert: content
      }
    });
    
    // Reset isModified AFTER dispatch to prevent false positive from updateListener
    isModified = false;
    
    document.getElementById('currentFile').textContent = filePath.split('/').pop();
    updateSaveButton();
    
    // Update selection in tree
    document.querySelectorAll('.tree-item').forEach(item => {
      item.classList.remove('selected');
      if (item.dataset.path === filePath) {
        item.classList.add('selected');
      }
    });
    
  } catch (error) {
    console.error('Failed to open file:', error);
    alert('فشل فتح الملف: ' + error.message);
  }
}

async function saveCurrentFile() {
  if (!currentFile) return;
  
  try {
    const content = editorView.state.doc.toString();
    await window.api.writeFile(currentFile, content);
    isModified = false;
    updateSaveButton();
  } catch (error) {
    console.error('Failed to save file:', error);
    alert('فشل حفظ الملف: ' + error.message);
  }
}

function updateSaveButton() {
  const saveBtn = document.getElementById('saveBtn');
  saveBtn.disabled = !isModified;
}

// Code execution
async function runCurrentFile() {
  if (!currentFile) {
    alert('لا يوجد ملف مفتوح للتشغيل');
    return;
  }
  
  // Save file first if modified
  if (isModified) {
    await saveCurrentFile();
  }
  
  // Show terminal
  const terminal = document.getElementById('terminalPanel');
  const output = document.getElementById('terminalOutput');
  terminal.classList.remove('hidden');
  output.innerHTML = '<div class="terminal-line terminal-stdout">جاري التشغيل...</div>';
  
  try {
    // Set up output listener
    window.api.onDaadOutput((data) => {
      const line = document.createElement('div');
      line.className = `terminal-line terminal-${data.type}`;
      line.textContent = data.data;
      output.appendChild(line);
      output.scrollTop = output.scrollHeight;
    });
    
    // Execute
    const result = await window.api.runDaad(currentFile);
    
    // Show completion message
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

// Event listeners
document.getElementById('openFolderBtn').addEventListener('click', openFolder);
document.getElementById('runBtn').addEventListener('click', runCurrentFile);
document.getElementById('saveBtn').addEventListener('click', saveCurrentFile);
document.getElementById('closeTerminalBtn').addEventListener('click', () => {
  document.getElementById('terminalPanel').classList.add('hidden');
});

// Initialize
initEditor();
