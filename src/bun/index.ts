import { BrowserView, BrowserWindow, app, Utils } from "electrobun/bun";
import { join, dirname } from "node:path";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { exec } from "node:child_process";
import { type DADDElectroviewRPC, type FileEntry, type Settings } from "../shared/types";

const settingsPath = join(Utils.paths.userData, "settings.json");
const defaultSettings: Settings = {
	projectPath: Utils.paths.documents,
	theme: "vsCodeDark",
	themeCategory: "dark",
};

let mainWindow: BrowserWindow | null = null;
const runningProcesses = new Map<number, ReturnType<typeof exec>>();

async function ensureSettingsDir() {
	await mkdir(Utils.paths.userData, { recursive: true });
}

async function readSettings(): Promise<Settings> {
	try {
		await ensureSettingsDir();
		const raw = await readFile(settingsPath, "utf-8");
		const parsed = JSON.parse(raw) as Partial<Settings>;
		return {
			projectPath: parsed.projectPath || defaultSettings.projectPath,
			theme: parsed.theme || defaultSettings.theme,
			themeCategory: parsed.themeCategory === "light" ? "light" : "dark",
		};
	} catch {
		return defaultSettings;
	}
}

async function saveSettings(settings: Settings) {
	await ensureSettingsDir();
	await writeFile(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
	return true;
}

async function readDirectory(dirPath: string): Promise<FileEntry[]> {
	const entries = await readdir(dirPath, { withFileTypes: true });
	return entries.map((entry) => ({
		name: entry.name,
		path: join(dirPath, entry.name),
		isDirectory: entry.isDirectory(),
	}));
}

async function createProjectFolder(projectName: string, basePath?: string) {
	const targetBasePath = basePath || Utils.paths.documents;
	await mkdir(targetBasePath, { recursive: true });
	const projectPath = join(targetBasePath, projectName);
	await mkdir(projectPath, { recursive: true });
	const mainDaadPath = join(projectPath, "main.daad");
	const mainContent = `دالة جمع(أ, ب) -> عدد:\n    ارجع أ + ب\n\nنتيجة = جمع(5, 10)\n\nاطبع(نتيجة)\n`;
	await writeFile(mainDaadPath, mainContent, "utf-8");
	return projectPath;
}

function getSelectedProjectPath() {
	return Utils.openFileDialog({
		startingFolder: Utils.paths.documents,
		canChooseDirectory: true,
		canChooseFiles: false,
		allowsMultipleSelection: false,
	});
}

function sendTerminalOutput(type: "stdout" | "stderr" | "info" | "exit", data: string) {
	mainWindow?.webview.rpc.send.terminalOutput({ type, data });
}

async function runDaad(filePath: string) {
	return await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
		const proc = exec(`daad "${filePath}"`, {
			cwd: dirname(filePath),
			maxBuffer: 10 * 1024 * 1024,
		});

		if (!mainWindow) {
			reject(new Error("No active window"));
			return;
		}

		runningProcesses.set(mainWindow.id, proc);
		let stdout = "";
		let stderr = "";

		proc.stdout?.on("data", (chunk) => {
			const text = chunk.toString();
			stdout += text;
			sendTerminalOutput("stdout", text);
		});

		proc.stderr?.on("data", (chunk) => {
			const text = chunk.toString();
			stderr += text;
			sendTerminalOutput("stderr", text);
		});

		proc.on("close", (code) => {
			runningProcesses.delete(mainWindow!.id);
			sendTerminalOutput("exit", `Process exited with code ${code}\n`);
			resolve({ code, stdout, stderr });
		});

		proc.on("error", (error) => {
			runningProcesses.delete(mainWindow!.id);
			reject(new Error(`Failed to execute: ${error.message}`));
		});
	});
}

const rpc = BrowserView.defineRPC<DADDElectroviewRPC>({
	handlers: {
		requests: {
			loadSettings: async () => readSettings(),
			saveSettings: async ({ settings }) => saveSettings(settings),
			readDirectory: async ({ dirPath }) => readDirectory(dirPath),
			readFile: async ({ filePath }) => readFile(filePath, "utf-8"),
			writeFile: async ({ filePath, content }) => {
				await writeFile(filePath, content, "utf-8");
				return true;
			},
			createProjectFolder: async ({ projectName, basePath }) => createProjectFolder(projectName, basePath),
			openFolderDialog: async () => {
				const chosen = await Utils.openFileDialog({
					startingFolder: Utils.paths.documents,
					canChooseDirectory: true,
					canChooseFiles: false,
					allowsMultipleSelection: false,
				});
				return chosen?.[0] || null;
			},
			selectProjectPath: async () => {
				const chosen = await getSelectedProjectPath();
				return chosen?.[0] || null;
			},
			runDaad: async ({ filePath }) => runDaad(filePath),
			writeDaadStdin: async ({ data }) => {
				const proc = mainWindow ? runningProcesses.get(mainWindow.id) : undefined;
				if (!proc?.stdin || proc.stdin.destroyed) return false;
				try {
					proc.stdin.write(data);
					return true;
				} catch {
					return false;
				}
			},
			endDaadStdin: async () => {
				const proc = mainWindow ? runningProcesses.get(mainWindow.id) : undefined;
				if (!proc?.stdin || proc.stdin.destroyed) return false;
				try {
					proc.stdin.end();
					return true;
				} catch {
					return false;
				}
			},
		},
		messages: {},
	},
});

function createWindow() {
	mainWindow = new BrowserWindow({
		title: "Ḍād IDE",
		url: "views://mainview/index.html",
		frame: { width: 1400, height: 900 },
		titleBarStyle: "hidden",
		rpc,
	});
}

app.on("before-quit", () => {
	runningProcesses.forEach((proc) => proc.kill());
	runningProcesses.clear();
});

createWindow();
