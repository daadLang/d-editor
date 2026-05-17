const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { exec } = require('child_process');

const isDev = !app.isPackaged;


let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#1a1a1a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    titleBarStyle: 'hiddenInset',
    frame: true
  });

  // Load from dist/renderer (built by Vite)
  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(
      path.join(__dirname, '../../dist/renderer/index.html')
    );
  }
  
  // Open DevTools in development
  // mainWindow.webContents.openDevTools();
}

function registerContentSecurityPolicy() {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'"
  ].join('; ');

  app.whenReady().then(() => {
    const filter = { urls: ['file://*/*'] };
    app.session.defaultSession.webRequest.onHeadersReceived(filter, (details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [csp]
        }
      });
    });
  });
}

registerContentSecurityPolicy();
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC Handlers

// Read directory contents
ipcMain.handle('read-directory', async (event, dirPath) => {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries.map(entry => ({
      name: entry.name,
      path: path.join(dirPath, entry.name),
      isDirectory: entry.isDirectory()
    }));
  } catch (error) {
    throw new Error(`Failed to read directory: ${error.message}`);
  }
});

// Read file contents
ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content;
  } catch (error) {
    throw new Error(`Failed to read file: ${error.message}`);
  }
});

// Write file contents
ipcMain.handle('write-file', async (event, filePath, content) => {
  try {
    await fs.writeFile(filePath, content, 'utf-8');
    return true;
  } catch (error) {
    throw new Error(`Failed to write file: ${error.message}`);
  }
});

// Create new file
ipcMain.handle('create-file', async (event, filePath) => {
  try {
    await fs.writeFile(filePath, '', 'utf-8');
    return true;
  } catch (error) {
    throw new Error(`Failed to create file: ${error.message}`);
  }
});

// Delete file or directory
ipcMain.handle('delete-path', async (event, targetPath) => {
  try {
    const stat = await fs.stat(targetPath);
    if (stat.isDirectory()) {
      await fs.rmdir(targetPath, { recursive: true });
    } else {
      await fs.unlink(targetPath);
    }
    return true;
  } catch (error) {
    throw new Error(`Failed to delete: ${error.message}`);
  }
});

// Rename file or directory
ipcMain.handle('rename-path', async (event, oldPath, newPath) => {
  try {
    await fs.rename(oldPath, newPath);
    return true;
  } catch (error) {
    throw new Error(`Failed to rename: ${error.message}`);
  }
});

// Open folder dialog
ipcMain.handle('open-folder-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

// Create new project folder with main.daad template
ipcMain.handle('create-project-folder', async (event, projectName, basePath) => {
  try {
    const os = require('os');
    const homePath = os.homedir();
    const targetBasePath = basePath || path.join(homePath, 'Documents');
    
    // Ensure base folder exists
    await fs.mkdir(targetBasePath, { recursive: true });
    
    // Create project folder
    const projectPath = path.join(targetBasePath, projectName);
    await fs.mkdir(projectPath, { recursive: true });
    
    // Create main.daad template file
    const mainDaadPath = path.join(projectPath, 'main.daad');
    const mainContent = `دالة جمع(أ, ب) -> عدد:
    ارجع أ + ب

نتيجة = جمع(5, 10)

اطبع(نتيجة)
`;
    await fs.writeFile(mainDaadPath, mainContent, 'utf-8');
    
    return projectPath;
  } catch (error) {
    console.error('Create project folder error:', error);
    throw new Error(`Failed to create project: ${error.message}`);
  }
});

// Track running processes per renderer (by webContents id)
const runningProcesses = new Map();

// Execute daad command
ipcMain.handle('run-daad', async (event, filePath) => {
  return new Promise((resolve, reject) => {
    const process = exec(`daad "${filePath}"`, {
      cwd: path.dirname(filePath),
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer
    });

    // Store process so renderer can write to stdin
    runningProcesses.set(event.sender.id, process);

    let stdout = '';
    let stderr = '';

    process.stdout.on('data', (data) => {
      stdout += data;
      event.sender.send('daad-output', { type: 'stdout', data: data.toString() });
    });

    process.stderr.on('data', (data) => {
      stderr += data;
      event.sender.send('daad-output', { type: 'stderr', data: data.toString() });
    });

    process.on('close', (code) => {
      // Remove process when finished
      runningProcesses.delete(event.sender.id);
      resolve({ code, stdout, stderr });
    });

    process.on('error', (error) => {
      runningProcesses.delete(event.sender.id);
      reject(new Error(`Failed to execute: ${error.message}`));
    });
  });
});

// Write to stdin of running daad process
ipcMain.handle('write-daad-stdin', (event, data) => {
  const proc = runningProcesses.get(event.sender.id);
  if (!proc || !proc.stdin || proc.stdin.destroyed) {
    // No running process: return false instead of throwing
    return false;
  }
  try {
    proc.stdin.write(data);
    return true;
  } catch (err) {
    // If write fails, return false rather than throwing to avoid renderer errors
    return false;
  }
});

// Close stdin (send EOF)
ipcMain.handle('end-daad-stdin', (event) => {
  const proc = runningProcesses.get(event.sender.id);
  if (!proc || !proc.stdin || proc.stdin.destroyed) {
    return false;
  }
  try {
    proc.stdin.end();
    return true;
  } catch (err) {
    return false;
  }
});

// Settings management (persist like VS Code-style JSON)
const settingsDir = path.join(require('os').homedir(), '.daad-ide');
const settingsFile = path.join(settingsDir, 'settings.json');

async function ensureSettingsDir() {
  await fs.mkdir(settingsDir, { recursive: true });
}

ipcMain.handle('read-settings', async () => {
  try {
    await ensureSettingsDir();
    const raw = await fs.readFile(settingsFile, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    return {
      projectPath: path.join(require('os').homedir(), 'Documents'),
      theme: 'vsCodeDark',
      themeCategory: 'dark'
    };
  }
});

ipcMain.handle('write-settings', async (event, settings) => {
  try {
    await ensureSettingsDir();
    await fs.writeFile(settingsFile, JSON.stringify(settings, null, 2), 'utf-8');
    return true;
  } catch (error) {
    throw new Error(`Failed to write settings: ${error.message}`);
  }
});

ipcMain.handle('select-project-path', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });

  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});
