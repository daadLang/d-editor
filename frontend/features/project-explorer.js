import { addRecentProject, getRecentProjects } from '../core/storage.js';

function folderIcon(isExpanded) {
  const path = isExpanded
    ? 'M.54 3.87L.5 3a2 2 0 0 1 2-2h3.672a2 2 0 0 1 1.414.586l.828.828A2 2 0 0 0 9.828 3h3.982a2 2 0 0 1 1.992 2.181L14.65 8H2.826a2 2 0 0 0-1.991 1.819l-.637 7a1.99 1.99 0 0 1 .342-1.31zM1 8.5A1.5 1.5 0 0 1 2.5 7h11A1.5 1.5 0 0 1 15 8.5v5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 13.5v-5z'
    : 'M.54 3.87L.5 3a2 2 0 0 1 2-2h3.672a2 2 0 0 1 1.414.586l.828.828A2 2 0 0 0 9.828 3h3.982a2 2 0 0 1 1.992 2.181l-.637 7A2 2 0 0 1 13.174 14H2.826a2 2 0 0 1-1.991-1.819l-.637-7a1.99 1.99 0 0 1 .342-1.31zM2.19 4a1 1 0 0 0-.996 1.09l.637 7a1 1 0 0 0 .995.91h10.348a1 1 0 0 0 .995-.91l.637-7A1 1 0 0 0 13.81 4H2.19z';
  return `<svg class="tree-item-icon" fill="currentColor" viewBox="0 0 16 16"><path d="${path}"/></svg>`;
}

function sortEntries(entries) {
  return entries
    .filter(entry => !entry.name.startsWith('.'))
    .sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name, 'ar');
    });
}

export function createProjectExplorer({ api, onOpenFile, onOpenProject }) {
  const treeElement = document.getElementById('fileTree');

  function renderRecentProjects(openFolder, createProject) {
    if (!treeElement) return;
    const container = document.createElement('div');
    container.className = 'recent-projects';

    const actions = document.createElement('div');
    actions.className = 'recent-project-actions';
    for (const [label, action] of [['فتح مشروع...', openFolder], ['إنشاء مشروع جديد...', createProject]]) {
      const button = document.createElement('button');
      button.className = 'btn-header open-project-btn';
      button.textContent = label;
      button.addEventListener('click', action);
      actions.appendChild(button);
    }
    container.appendChild(actions);
    treeElement.replaceChildren(container);
  }

  function renderWelcomeRecents() {
    const target = document.getElementById('welcomeRecents');
    if (!target) return;
    const projects = getRecentProjects();
    target.replaceChildren();
    if (projects.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'welcome-empty';
      empty.textContent = 'لا توجد مشاريع سابقة بعد.';
      target.appendChild(empty);
      return;
    }

    for (const projectPath of projects) {
      const item = document.createElement('button');
      item.className = 'welcome-recent';
      item.type = 'button';
      item.title = projectPath;
      const name = projectPath.split(/[\\/]/).pop();
      const nameElement = document.createElement('span');
      nameElement.className = 'name';
      nameElement.textContent = name;
      const pathElement = document.createElement('span');
      pathElement.className = 'path';
      pathElement.textContent = projectPath;
      item.replaceChildren(nameElement, pathElement);
      item.addEventListener('click', async () => {
        await onOpenProject(projectPath);
      });
      target.appendChild(item);
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
      item.innerHTML = folderIcon(false);
      const nameElement = document.createElement('span');
      nameElement.textContent = entry.name;
      item.appendChild(nameElement);
    } else {
      item.innerHTML = '<svg class="tree-item-icon file-icon" fill="currentColor" viewBox="0 0 24 24"><path d="M6 2h9l5 5v13a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 01 2-2zm8 1v5h5M8 11h8v2H8v-2zm0 4h8v2H8v-2z"/></svg><span></span>';
      item.lastElementChild.textContent = entry.name;
      item.addEventListener('click', event => {
        event.stopPropagation();
        onOpenFile(entry.path);
      });
    }
    wrapper.appendChild(item);
    return { wrapper, item };
  }

  async function loadDirectoryRecursive(dirPath, parentWrapper, depth = 0) {
    if (depth > 2) return;
    const entries = sortEntries(await api.readDirectory(dirPath));
    const childContainer = document.createElement('div');
    childContainer.className = 'tree-children';

    for (const entry of entries) {
      const { wrapper } = createTreeItem(entry);
      childContainer.appendChild(wrapper);
      if (entry.isDirectory) await loadDirectoryRecursive(entry.path, wrapper, depth + 1);
    }

    if (childContainer.children.length === 0) return;
    parentWrapper.appendChild(childContainer);
    const parentItem = parentWrapper.querySelector(':scope > .tree-item');
    parentItem?.addEventListener('click', event => {
      event.stopPropagation();
      const expanded = childContainer.hidden;
      childContainer.hidden = !expanded;
      parentItem.classList.toggle('expanded', expanded);
      const icon = parentItem.querySelector('.tree-item-icon');
      if (icon) icon.outerHTML = folderIcon(expanded);
    });
  }

  async function loadFileTree(dirPath) {
    if (!treeElement) return;
    try {
      treeElement.replaceChildren();
      for (const entry of sortEntries(await api.readDirectory(dirPath))) {
        const { wrapper } = createTreeItem(entry);
        treeElement.appendChild(wrapper);
        if (entry.isDirectory) await loadDirectoryRecursive(entry.path, wrapper);
      }
      addRecentProject(dirPath);
    } catch (error) {
      console.error('Failed to load file tree:', error);
      treeElement.innerHTML = '<div class="empty-state">تعذر قراءة محتويات المشروع</div>';
      throw error;
    }
  }

  return { loadFileTree, renderRecentProjects, renderWelcomeRecents };
}