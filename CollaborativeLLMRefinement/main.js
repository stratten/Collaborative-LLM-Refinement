const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { RefinementOrchestrator } = require('./backend/refinement-orchestrator');

// Keep a global reference of the window object
let mainWindow;

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    titleBarStyle: 'default',
    title: 'Collaborative LLM Refinement - POC'
  });

  // Load the app
  mainWindow.loadFile('renderer/index.html');

  // Open DevTools in development
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  // Handle window closed
  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

// This method will be called when Electron has finished initialization
app.whenReady().then(createWindow);

// Quit when all windows are closed
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', function () {
  if (mainWindow === null) createWindow();
});

// Initialize the refinement orchestrator
const orchestrator = new RefinementOrchestrator();

// IPC handlers for communication with renderer process
ipcMain.handle('start-refinement', async (event, initialPrompt, models, iterations) => {
  try {
    // Set up progress callback to send updates to renderer
    const progressCallback = (progressData) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('refinement-progress', progressData);
      }
    };
    
    return await orchestrator.startRefinementProcess(initialPrompt, models, iterations, progressCallback);
  } catch (error) {
    console.error('Refinement error:', error);
    return { error: error.message };
  }
});

ipcMain.handle('submit-clarification', async (event, sessionId, answers) => {
  try {
    // Set up progress callback to send updates to renderer
    const progressCallback = (progressData) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('refinement-progress', progressData);
      }
    };
    
    return await orchestrator.submitClarification(sessionId, answers, progressCallback);
  } catch (error) {
    console.error('Clarification error:', error);
    return { error: error.message };
  }
});

ipcMain.handle('get-available-models', async () => {
  return orchestrator.getAvailableModels();
});

ipcMain.handle('set-api-keys', async (event, apiKeys) => {
  try {
    orchestrator.setApiKeys(apiKeys);
    return { success: true };
  } catch (error) {
    return { error: error.message };
  }
}); 