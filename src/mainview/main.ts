// @ts-nocheck
import "./style.css";
import { Electroview } from "electrobun/view";
import { EditorState, Compartment, EditorSelection } from "@codemirror/state";
import { EditorView, keymap, highlightActiveLine, lineNumbers } from "@codemirror/view";
import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import { completionKeymap } from "@codemirror/autocomplete";
import { syntaxHighlighting, HighlightStyle, bracketMatching } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

import { daad } from "../language/language.js";
import { THEME_CATALOG, UI_THEMES } from "./themes.js";
import type { DADDElectroviewRPC, FileEntry, Settings } from "../shared/types";

const rpc = Electroview.defineRPC<DADDElectroviewRPC>({
	handlers: {
		requests: {},
		messages: {
			terminalOutput: ({ type, data }) => appendTerminalOutput(type, data),
		},
	},
});

const view = new Electroview({ rpc });
const api = view.rpc.request;

const editorThemeCompartment = new Compartment();
const daadHighlight = HighlightStyle.define([
	{ tag: t.keyword, color: "#c586c0", fontWeight: "600" },
	{ tag: [t.comment], color: "#6a9955", fontStyle: "italic" },
	{ tag: [t.string, t.special(t.string)], color: "#ce9178" },
	{ tag: [t.number, t.bool, t.atom], color: "#b5cea8" },
	{ tag: t.function(t.variableName), color: "#dcdcaa" },
	{ tag: [t.variableName, t.propertyName], color: "#9cdcfe" },
	{ tag: [t.operator, t.separator, t.punctuation], color: "#d4d4d4" },
]);

const state = {
	currentFile: null,
	currentFolder: null,
	editorView: null,
	isModified: false,
	openTabs: [],
	activeTabId: null,
	suppressDocChange: false,
	currentSettings: {
		projectPath: "",
		theme: "vsCodeDark",
		themeCategory: "dark",
	},
	recentProjects: loadRecentProjects(),
};

function $(id) {
	return document.getElementById(id);
}

function loadRecentProjects() {
	try {
		const raw = localStorage.getItem("recentProjects");
		const parsed = raw ? JSON.parse(raw) : [];
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

function saveRecentProjects(list) {
	try {
		localStorage.setItem("recentProjects", JSON.stringify(list.slice(0, 5)));
	} catch {
		/* ignore */
	}
}

function addRecentProject(projectPath) {
	if (!projectPath) return;
	const list = state.recentProjects.filter((item) => item !== projectPath);
	list.unshift(projectPath);
	state.recentProjects = list;
	saveRecentProjects(list);
	renderWelcomeRecents();
}

function getThemeConfig(themeKey) {
	return THEME_CATALOG.find((theme) => theme.key === themeKey) || THEME_CATALOG.find((theme) => theme.key === "vsCodeDark");
}

function applyThemeToIDE(themeKey) {
	const palette = UI_THEMES[themeKey] || UI_THEMES.vsCodeDark;
	const root = document.documentElement;
	root.style.setProperty("--bg-primary", palette.bg);
	root.style.setProperty("--bg-secondary", palette.bg2);
	root.style.setProperty("--bg-tertiary", palette.bg3);
	root.style.setProperty("--bg-hover", palette.hover);
	root.style.setProperty("--text-primary", palette.text);
	root.style.setProperty("--text-secondary", palette.text2);
	root.style.setProperty("--text-tertiary", palette.text3);
	root.style.setProperty("--accent-primary", palette.accent);
	root.style.setProperty("--accent-secondary", palette.accent2);
	root.style.setProperty("--accent-success", palette.success);
	root.style.setProperty("--border-color", palette.border);
	root.style.setProperty("--shadow", palette.shadow);
}

function applyThemeToEditor(themeKey) {
	const themeConfig = getThemeConfig(themeKey);
	if (!themeConfig || !state.editorView) return;
	state.editorView.dispatch({ effects: editorThemeCompartment.reconfigure(themeConfig.cm) });
}

function updateWelcomeLogoByCategory(category) {
	const logo = $("welcomeLogo");
	if (!logo) return;
	logo.src = category === "light" ? logo.getAttribute("data-light-src") : logo.getAttribute("data-dark-src");
}

function applyCurrentTheme() {
	applyThemeToIDE(state.currentSettings.theme);
	updateWelcomeLogoByCategory(state.currentSettings.themeCategory);
	applyThemeToEditor(state.currentSettings.theme);
}

function populateThemeSelect() {
	const select = $("themeSelect");
	if (!select) return;
	select.innerHTML = "";
	const darkGroup = document.createElement("optgroup");
	darkGroup.label = "Dark Themes";
	const lightGroup = document.createElement("optgroup");
	lightGroup.label = "Light Themes";
	for (const theme of THEME_CATALOG) {
		const option = document.createElement("option");
		option.value = theme.key;
		option.textContent = theme.label;
		(theme.category === "light" ? lightGroup : darkGroup).appendChild(option);
	}
	select.append(darkGroup, lightGroup);
	select.value = state.currentSettings.theme;
}

async function loadSettings() {
	try {
		const loaded = await api.loadSettings();
		const theme = getThemeConfig(loaded?.theme || "vsCodeDark");
		state.currentSettings = {
			projectPath: loaded?.projectPath || "",
			theme: theme.key,
			themeCategory: theme.category,
		};
	} catch {
		const theme = getThemeConfig("vsCodeDark");
		state.currentSettings = { projectPath: "", theme: theme.key, themeCategory: theme.category };
	}
	$("projectPathInput").value = state.currentSettings.projectPath;
	populateThemeSelect();
	applyCurrentTheme();
}

async function saveSettings() {
	await api.saveSettings({ settings: state.currentSettings });
	alert("تم حفظ الإعدادات");
}

async function chooseProjectPath() {
	const selectedPath = await api.selectProjectPath();
	if (!selectedPath) return;
	state.currentSettings.projectPath = selectedPath;
	$("projectPathInput").value = selectedPath;
}

function handleThemeSelection(themeKey) {
	const selectedTheme = getThemeConfig(themeKey);
	state.currentSettings.theme = selectedTheme.key;
	state.currentSettings.themeCategory = selectedTheme.category;
	applyCurrentTheme();
	api.saveSettings({ settings: state.currentSettings }).catch(() => undefined);
}

function getTabById(id) {
	return state.openTabs.find((tab) => tab.id === id);
}

function getActiveTab() {
	return getTabById(state.activeTabId);
}

function snapshotActiveTab() {
	const activeTab = getActiveTab();
	if (!activeTab || activeTab.type !== "file" || !state.editorView) return;
	activeTab.doc = state.editorView.state.doc.toString();
	activeTab.isDirty = state.isModified;
}

function renderTabs() {
	const tabsEl = $("tabs");
	tabsEl.innerHTML = "";
	for (const tab of state.openTabs) {
		const tabEl = document.createElement("div");
		tabEl.className = "tab";
		if (tab.id === state.activeTabId) tabEl.classList.add("active");
		if (tab.isDirty) tabEl.classList.add("dirty");
		const title = document.createElement("span");
		title.className = "tab-title";
		title.textContent = tab.title;
		const closeBtn = document.createElement("button");
		closeBtn.className = "tab-close";
		closeBtn.type = "button";
		closeBtn.textContent = "×";
		closeBtn.addEventListener("click", async (e) => {
			e.stopPropagation();
			await closeTab(tab.id);
		});
		tabEl.addEventListener("click", () => setActiveTab(tab.id));
		tabEl.append(title, closeBtn);
		tabsEl.appendChild(tabEl);
	}
	$("closeAllTabsBtn").disabled = state.openTabs.length === 0;
}

function showWelcomeView() {
	$("welcome").classList.remove("view-hidden");
	$("editor").classList.add("view-hidden");
	$("settingsPane").classList.add("view-hidden");
}

function showEditorView() {
	$("welcome").classList.add("view-hidden");
	$("editor").classList.remove("view-hidden");
	$("settingsPane").classList.add("view-hidden");
}

function showSettingsView() {
	$("welcome").classList.add("view-hidden");
	$("editor").classList.add("view-hidden");
	$("settingsPane").classList.remove("view-hidden");
}

function ensureActiveView() {
	if (state.openTabs.length === 0) {
		showWelcomeView();
		return;
	}
	const activeTab = getActiveTab();
	if (!activeTab || activeTab.type === "welcome") {
		showWelcomeView();
		return;
	}
	if (activeTab.type === "settings") showSettingsView(); else showEditorView();
}

function renderWelcomeRecents() {
	const recentsEl = $("welcomeRecents");
	recentsEl.innerHTML = "";
	if (!state.recentProjects.length) {
		const empty = document.createElement("div");
		empty.className = "welcome-empty";
		empty.textContent = "لا توجد مشاريع سابقة بعد.";
		recentsEl.appendChild(empty);
		return;
	}
	for (const projectPath of state.recentProjects.slice(0, 5)) {
		const item = document.createElement("div");
		item.className = "welcome-recent";
		const name = projectPath.split("/").pop();
		item.innerHTML = `<div class="name">${name}</div><div class="path">${projectPath}</div>`;
		item.title = projectPath;
		item.addEventListener("click", async () => {
			state.currentFolder = projectPath;
			await loadFileTree(projectPath);
			addRecentProject(projectPath);
		});
		recentsEl.appendChild(item);
	}
}

function updateWelcomeMode() {
	$("welcome").classList.toggle("project-open", Boolean(state.currentFolder));
}

function initEditor() {
	const stateDoc = EditorState.create({
		doc: "",
		extensions: [
			lineNumbers(),
			highlightActiveLine(),
			bracketMatching(),
			EditorView.lineWrapping,
			EditorView.theme({
				"&": { height: "100%", direction: "rtl" },
				".cm-scroller": { fontFamily: "IBM Plex Mono, monospace", direction: "rtl" },
				".cm-gutters": { borderRight: "none", direction: "ltr", minWidth: "40px" },
				".cm-content": { direction: "rtl", unicodeBidi: "plaintext" },
				".cm-line": { direction: "rtl", unicodeBidi: "plaintext" },
			}),
			editorThemeCompartment.of(getThemeConfig(state.currentSettings.theme).cm),
			daad(),
			syntaxHighlighting(daadHighlight),
			keymap.of([
				...defaultKeymap,
				...completionKeymap,
				indentWithTab,
				{ key: "Mod-p", run: () => { toggleSettingsTab(); return true; } },
				{ key: "Mod-`", run: () => { toggleTerminalPanel(); return true; } },
				{ key: "Mod-b", run: () => { toggleSidebar(); return true; } },
				{ key: "Ctrl-s", run: () => { saveCurrentFile(); return true; } },
				{ key: "F5", run: () => { runCurrentFile(); return true; } },
			]),
			EditorView.updateListener.of((update) => {
				if (update.docChanged && !state.suppressDocChange) {
					const activeTab = getActiveTab();
					if (activeTab && activeTab.type === "file") {
						state.isModified = true;
						activeTab.isDirty = true;
						updateSaveButton();
						renderTabs();
					}
				}
			}),
		],
	});
	state.editorView = new EditorView({ state: stateDoc, parent: $("editor") });
}

function updateSaveButton() {
	const hasDirty = state.openTabs.some((tab) => tab.isDirty);
	$("saveBtn").disabled = !hasDirty;
	$("closeAllTabsBtn").disabled = state.openTabs.length === 0;
}

function toggleSidebar() {
	const sidebar = document.querySelector(".sidebar");
	const isCollapsed = sidebar.classList.toggle("collapsed");
	$("toggleSidebarBtn").setAttribute("aria-pressed", String(!isCollapsed));
}

function toggleTerminalPanel() {
	$("terminalPanel").classList.toggle("hidden");
}

function setActiveTab(tabId) {
	const nextTab = getTabById(tabId);
	if (!nextTab) return;
	snapshotActiveTab();
	state.activeTabId = tabId;
	state.isModified = Boolean(nextTab.isDirty);
	if (nextTab.type === "file") {
		state.currentFile = nextTab.path;
		showEditorView();
		if (state.editorView) {
			state.suppressDocChange = true;
			try {
				state.editorView.dispatch({ changes: { from: 0, to: state.editorView.state.doc.length, insert: nextTab.doc || "" } });
			} finally {
				state.suppressDocChange = false;
			}
		}
		document.querySelectorAll(".tree-item").forEach((item) => {
			item.classList.toggle("selected", item.dataset.path === nextTab.path);
		});
	} else if (nextTab.type === "settings") {
		state.currentFile = null;
		showSettingsView();
	} else {
		state.currentFile = null;
		showWelcomeView();
	}
	renderTabs();
	updateSaveButton();
}

function openSettingsTab() {
	const existing = state.openTabs.find((tab) => tab.type === "settings");
	if (existing) return setActiveTab(existing.id);
	const tab = { id: "settings", type: "settings", title: "الإعدادات" };
	state.openTabs.push(tab);
	setActiveTab(tab.id);
}

function toggleSettingsTab() {
	const activeTab = getActiveTab();
	if (activeTab?.type === "settings") {
		closeTab(activeTab.id);
		return;
	}
	openSettingsTab();
}

async function saveTab(tab) {
	if (!tab || tab.type !== "file") return;
	const content = tab.id === state.activeTabId && state.editorView ? state.editorView.state.doc.toString() : tab.doc || "";
	await api.writeFile({ filePath: tab.path, content });
	tab.doc = content;
	tab.isDirty = false;
	state.isModified = false;
	updateSaveButton();
	renderTabs();
}

async function closeTab(tabId) {
	const index = state.openTabs.findIndex((tab) => tab.id === tabId);
	if (index === -1) return;
	const tab = state.openTabs[index];
	if (tab.isDirty && confirm("هل تريد حفظ التغييرات قبل الإغلاق؟")) {
		await saveTab(tab);
	}
	state.openTabs.splice(index, 1);
	if (state.activeTabId === tabId) {
		const nextTab = state.openTabs[index] || state.openTabs[index - 1];
		if (nextTab) setActiveTab(nextTab.id); else {
			state.activeTabId = null;
			state.currentFile = null;
			state.isModified = false;
			renderTabs();
			updateSaveButton();
			ensureActiveView();
		}
	} else {
		renderTabs();
	}
}

async function closeAllTabs() {
	const dirtyTabs = state.openTabs.filter((tab) => tab.isDirty);
	if (dirtyTabs.length && confirm("هل تريد حفظ جميع التغييرات قبل الإغلاق؟")) {
		for (const tab of dirtyTabs) await saveTab(tab);
	}
	state.openTabs = [];
	state.activeTabId = null;
	state.currentFile = null;
	state.isModified = false;
	renderTabs();
	updateSaveButton();
	ensureActiveView();
}

async function openFolder() {
	const folderPath = await api.openFolderDialog();
	if (!folderPath) return;
	state.currentFolder = folderPath;
	await loadFileTree(folderPath);
	addRecentProject(folderPath);
	updateWelcomeMode();
}

function showProjectNameModal() {
	$("projectNameInput").value = "";
	$("projectNameModal").classList.remove("hidden");
	$("projectNameInput").focus();
}

function hideProjectNameModal() {
	$("projectNameModal").classList.add("hidden");
}

async function submitProjectName() {
	const projectName = $("projectNameInput").value.trim();
	if (!projectName) return alert("يرجى إدخال اسم المشروع");
	hideProjectNameModal();
	const folderPath = await api.createProjectFolder({ projectName, basePath: state.currentSettings.projectPath });
	state.currentFolder = folderPath;
	await loadFileTree(folderPath);
	addRecentProject(folderPath);
	updateWelcomeMode();
}

function createNewProject() {
	showProjectNameModal();
}

async function loadFileTree(dirPath) {
	const treeElement = $("fileTree");
	treeElement.innerHTML = "";
	const entries = await api.readDirectory({ dirPath });
	entries.sort((a, b) => {
		if (a.isDirectory && !b.isDirectory) return -1;
		if (!a.isDirectory && b.isDirectory) return 1;
		return a.name.localeCompare(b.name, "ar");
	});
	for (const entry of entries) {
		if (entry.name.startsWith(".")) continue;
		const { wrapper } = createTreeItem(entry);
		treeElement.appendChild(wrapper);
		if (entry.isDirectory) await loadDirectoryRecursive(entry.path, wrapper);
	}
	updateWelcomeMode();
}

async function loadDirectoryRecursive(dirPath, parentWrapper, depth = 0) {
	if (depth > 2) return;
	const entries = await api.readDirectory({ dirPath });
	const childContainer = document.createElement("div");
	childContainer.className = "tree-children";
	childContainer.style.display = "none";
	entries.sort((a, b) => {
		if (a.isDirectory && !b.isDirectory) return -1;
		if (!a.isDirectory && b.isDirectory) return 1;
		return a.name.localeCompare(b.name, "ar");
	});
	for (const entry of entries) {
		if (entry.name.startsWith(".")) continue;
		const { wrapper } = createTreeItem(entry);
		childContainer.appendChild(wrapper);
		if (entry.isDirectory) await loadDirectoryRecursive(entry.path, wrapper, depth + 1);
	}
	if (childContainer.children.length) {
		parentWrapper.appendChild(childContainer);
		const parentItem = parentWrapper.querySelector(":scope > .tree-item");
		parentItem.addEventListener("click", (e) => {
			e.stopPropagation();
			const isExpanded = childContainer.style.display !== "none";
			childContainer.style.display = isExpanded ? "none" : "block";
			parentItem.classList.toggle("expanded", !isExpanded);
		});
	}
}

function createTreeItem(entry) {
	const wrapper = document.createElement("div");
	wrapper.className = "tree-entry";
	wrapper.dataset.path = entry.path;
	const item = document.createElement("div");
	item.className = "tree-item";
	item.dataset.path = entry.path;
	item.textContent = entry.isDirectory ? `📁 ${entry.name}` : `📄 ${entry.name}`;
	if (!entry.isDirectory) item.addEventListener("click", (e) => { e.stopPropagation(); openFile(entry.path); });
	wrapper.appendChild(item);
	return { wrapper, item };
}

async function openFile(filePath) {
	const existing = state.openTabs.find((tab) => tab.type === "file" && tab.path === filePath);
	if (existing) {
		setActiveTab(existing.id);
		return;
	}
	const content = await api.readFile({ filePath });
	const title = filePath.split("/").pop();
	const tab = { id: filePath, type: "file", title, path: filePath, doc: content, isDirty: false };
	state.openTabs.push(tab);
	setActiveTab(tab.id);
	addRecentProject(state.currentFolder || filePath);
}

async function saveCurrentFile() {
	const activeTab = getActiveTab();
	if (!activeTab || activeTab.type !== "file") return;
	await saveTab(activeTab);
}

function getCurrentRunPath() {
	const activeTab = getActiveTab();
	if (activeTab?.type === "file") return activeTab.path;
	return state.currentFolder ? `${state.currentFolder}/main.daad` : null;
}

async function runCurrentFile() {
	const path = getCurrentRunPath();
	if (!path) return alert("افتح ملفًا للتشغيل");
	await saveCurrentFile();
	$("terminalOutput").innerHTML = "";
	$("terminalPanel").classList.remove("hidden");
	await api.runDaad({ filePath: path });
}

async function sendStdin() {
	const input = $("terminalInput");
	if (!input.value) return;
	await api.writeDaadStdin({ data: `${input.value}\n` });
	input.value = "";
}

async function endStdin() {
	await api.endDaadStdin();
}

function appendTerminalOutput(type, data) {
	const output = $("terminalOutput");
	const line = document.createElement("div");
	line.className = `terminal-line ${type}`;
	line.textContent = data;
	output.appendChild(line);
	output.scrollTop = output.scrollHeight;
}

function wireEvents() {
	$("toggleSidebarBtn").addEventListener("click", toggleSidebar);
	$("runBtn").addEventListener("click", runCurrentFile);
	$("openFolderBtn").addEventListener("click", openFolder);
	$("welcomeOpenFolderBtn").addEventListener("click", openFolder);
	$("welcomeSettingsBtn").addEventListener("click", openSettingsTab);
	$("openSettingsTabBtn").addEventListener("click", toggleSettingsTab);
	$("saveBtn").addEventListener("click", saveCurrentFile);
	$("closeAllTabsBtn").addEventListener("click", closeAllTabs);
	$("projectPathBtn").addEventListener("click", chooseProjectPath);
	$("saveSettingsBtn").addEventListener("click", saveSettings);
	$("themeSelect").addEventListener("change", (e) => handleThemeSelection(e.target.value));
	$("projectNameCancel").addEventListener("click", hideProjectNameModal);
	$("projectNameSubmit").addEventListener("click", submitProjectName);
	$("projectNameInput").addEventListener("keydown", (e) => { if (e.key === "Enter") submitProjectName(); });
	$("closeTerminalBtn").addEventListener("click", () => $("terminalPanel").classList.add("hidden"));
	$("sendStdinBtn").addEventListener("click", sendStdin);
	$("terminalInput").addEventListener("keydown", (e) => { if (e.key === "Enter") sendStdin(); });
	document.addEventListener("keydown", (e) => {
		if (e.key === "Escape" && !$("projectNameModal").classList.contains("hidden")) hideProjectNameModal();
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") { e.preventDefault(); toggleSidebar(); }
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") { e.preventDefault(); toggleSettingsTab(); }
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); saveCurrentFile(); }
		if ((e.ctrlKey || e.metaKey) && e.key === "`") { e.preventDefault(); toggleTerminalPanel(); }
	});
}

async function init() {
	await loadSettings();
	populateThemeSelect();
	initEditor();
	renderWelcomeRecents();
	wireEvents();
	ensureActiveView();
	updateSaveButton();
	if (state.currentSettings.projectPath) {
		$("projectPathInput").value = state.currentSettings.projectPath;
	}
}

init().catch((error) => {
	console.error(error);
	alert(`فشل تشغيل الواجهة: ${error.message}`);
});