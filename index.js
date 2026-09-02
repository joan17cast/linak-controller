const { app, BrowserWindow, Tray, Menu, ipcMain, screen } = require("electron");
const path = require("path");

app.disableHardwareAcceleration();
app.commandLine.appendSwitch("enable-transparent-visuals");

let win = null;
let tray = null;
let optionsWin = null;
let isQuitting = false;

const showWindow = () => {
  if (!win) return;

  win.setSkipTaskbar(false);
  win.show();
  win.focus();
};

const hideWindow = () => {
  if (!win) return;

  win.hide();
  win.setSkipTaskbar(true);
};

const toggleWindow = () => {
  if (!win) return;

  win.isVisible() ? hideWindow() : showWindow();
};

const openSettings = () => {
  if (optionsWin && !optionsWin.isDestroyed()) {
    optionsWin.show();
    optionsWin.focus();
    return;
  }

  optionsWin = new BrowserWindow({
    width: 600,
    height: 600,
    title: "Settings",
  });

  optionsWin.loadFile("src/options.html");

  optionsWin.on("closed", () => {
    optionsWin = null;
  });
};

const centerBottom = () => {
  const { width, height } = win.getBounds();
  const { width: screenWidth, height: screenHeight } =
    screen.getPrimaryDisplay().workAreaSize;

  const x = Math.floor((screenWidth - width) / 2);
  const y = screenHeight - height;

  win.setPosition(x, y);
};

const createWindow = () => {
  win = new BrowserWindow({
    width: 560,
    minWidth: 560,
    maxWidth: 560,
    height: 56,
    minHeight: 56,
    maxHeight: 56,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    resizable: false,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.webContents.on("select-bluetooth-device", (e, devices, cb) => {
    e.preventDefault();

    devices?.length && cb(devices[0].deviceId);
  });

  win.loadFile("src/index.html");

  win.once("ready-to-show", () => {
    centerBottom();
    win.show();
  });

  win.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      hideWindow();
    }
  });

  // win.webContents.openDevTools({ mode: 'detach' })
};

const createTray = () => {
  const iconPath = path.join(__dirname, "src/icons/logoLC.png");

  tray = new Tray(iconPath);
  tray.setToolTip("IKEA LINAK CTRL");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show/Hide",
      click: () => toggleWindow(),
    },
    {
      label: "Settings",
      click: () => openSettings(),
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on("click", () => showWindow());
};

ipcMain.on("show-window", () => showWindow());

app.whenReady().then(() => {
  setTimeout(() => {
    createWindow();
    createTray();
  }, 100);

  app.on("activate", () => {
    if (!win) {
      createWindow();
    } else {
      showWindow();
    }
  });
});

app.on("before-quit", () => {
  isQuitting = true;
});
