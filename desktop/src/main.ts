import {
  app,
  BrowserWindow,
  Menu,
  globalShortcut,
  type MenuItemConstructorOptions,
} from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';

import { config } from './config/config';
import { localComputationWorker } from './workers/localComputation';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string;

let mainWindow: BrowserWindow | null = null;

if (config.main.isDev) {
  // Hot-reload main process during development
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('electron-reloader')(module, { ignore: [/\.vite/] });
}

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

app.disableHardwareAcceleration();

const createWindow = () => {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
    title: 'Дослідницька панель',
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  // Open the DevTools.
  mainWindow.webContents.openDevTools();
};

const buildMenu = () => {
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'Вигляд',
      submenu: [
        {
          label: 'Перезавантажити',
          accelerator: 'CmdOrCtrl+R',
          click: () => mainWindow?.reload(),
        },
        {
          label: 'Форс-перезавантажити',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => mainWindow?.webContents.reloadIgnoringCache(),
        },
        { type: 'separator' },
        {
          label: 'Закрити вікно',
          accelerator: process.platform === 'darwin' ? 'Cmd+W' : 'Alt+F4',
          click: () => mainWindow?.close(),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};

const handleReady = () => {
  createWindow();
  buildMenu();
  // Keep handy reload shortcuts even without menu bar.
  if (mainWindow) {
    globalShortcut.register('CommandOrControl+R', () => mainWindow?.reload());
    globalShortcut.register('CommandOrControl+Shift+R', () =>
      mainWindow?.webContents.reloadIgnoringCache()
    );
  }
  if (process.env.LOCAL_WORKER_ENABLED !== 'false') {
    localComputationWorker.start();
  }
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', handleReady);
app.on('before-quit', () => {
  localComputationWorker.stop();
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
