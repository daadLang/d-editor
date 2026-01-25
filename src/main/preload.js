const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('api', {
  // File system operations
  readDirectory: (dirPath) => ipcRenderer.invoke('read-directory', dirPath),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('write-file', filePath, content),
  createFile: (filePath) => ipcRenderer.invoke('create-file', filePath),
  deletePath: (targetPath) => ipcRenderer.invoke('delete-path', targetPath),
  renamePath: (oldPath, newPath) => ipcRenderer.invoke('rename-path', oldPath, newPath),
  
  // Dialog operations
  openFolderDialog: () => ipcRenderer.invoke('open-folder-dialog'),
  
  // Code execution
  runDaad: (filePath) => ipcRenderer.invoke('run-daad', filePath),
  onDaadOutput: (callback) => {
    ipcRenderer.on('daad-output', (event, data) => callback(data));
  }
});
