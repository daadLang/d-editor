export type FileEntry = {
	name: string;
	path: string;
	isDirectory: boolean;
};

export type DADDElectroviewRPC = {
	bun: import("electrobun/view").RPCSchema<{
		requests: {
			loadSettings: {
				params: undefined;
				response: Settings;
			};
			saveSettings: {
				params: { settings: Settings };
				response: boolean;
			};
			readDirectory: {
				params: { dirPath: string };
				response: FileEntry[];
			};
			readFile: {
				params: { filePath: string };
				response: string;
			};
			writeFile: {
				params: { filePath: string; content: string };
				response: boolean;
			};
			createProjectFolder: {
				params: { projectName: string; basePath?: string };
				response: string;
			};
			openFolderDialog: {
				params: undefined;
				response: string | null;
			};
			selectProjectPath: {
				params: undefined;
				response: string | null;
			};
			runDaad: {
				params: { filePath: string };
				response: { code: number | null; stdout: string; stderr: string };
			};
			writeDaadStdin: {
				params: { data: string };
				response: boolean;
			};
			endDaadStdin: {
				params: undefined;
				response: boolean;
			};
		};
		messages: {
			terminalOutput: {
				type: "stdout" | "stderr" | "info" | "exit";
				data: string;
			};
		};
	}>;
	webview: import("electrobun/view").RPCSchema<{
		requests: Record<string, never>;
		messages: Record<string, never>;
	}>;
};

export type Settings = {
	projectPath: string;
	theme: string;
	themeCategory: "dark" | "light";
};