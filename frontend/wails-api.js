function getApp() {
  const app = globalThis.go?.main?.App;
  if (!app) {
    throw new Error('Wails runtime is not available. Start the IDE with wails dev.');
  }
  return app;
}

export const api = {
  readDirectory: (dirPath) => getApp().ReadDirectory(dirPath),
  readFile: (filePath) => getApp().ReadFile(filePath),
  writeFile: (filePath, content) => getApp().WriteFile(filePath, content),
  createFile: (filePath) => getApp().CreateFile(filePath),
  deletePath: (targetPath) => getApp().DeletePath(targetPath),
  renamePath: (oldPath, newPath) => getApp().RenamePath(oldPath, newPath),
  openFolderDialog: () => getApp().OpenFolderDialog(),
  createProjectFolder: (projectName, basePath) => getApp().CreateProjectFolder(projectName, basePath),
  selectProjectPath: () => getApp().SelectProjectPath(),
  readSettings: () => getApp().ReadSettings(),
  writeSettings: (settings) => getApp().WriteSettings(settings),
  getInterpreterInfo: (configuredPath) => getApp().GetInterpreterInfo(configuredPath),
  listInterpreters: (configuredPath) => getApp().ListInterpreters(configuredPath),
  interpreterDirectory: () => getApp().InterpreterDirectory(),
  selectInterpreter: () => getApp().SelectInterpreter(),
  installLatestInterpreter: () => getApp().InstallLatestInterpreter(),
  installInterpreter: (releaseTag) => getApp().InstallInterpreter(releaseTag),
  openExternalUrl: (url) => getApp().OpenExternalURL(url),
  runDaad: (filePath, interpreterPath) => getApp().RunDaad(filePath, interpreterPath),
  onDaadOutput: (callback) => {
    const runtime = globalThis.runtime;
    if (!runtime?.EventsOn) {
      throw new Error('Wails runtime events are not available.');
    }
    runtime.EventsOn('daad-output', callback);
    return () => runtime.EventsOff?.('daad-output');
  },
  writeToDaadStdin: (data) => getApp().WriteDaadStdin(data),
  endDaadStdin: () => getApp().EndDaadStdin()
};