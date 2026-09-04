const { app, BrowserWindow, Tray, Menu, ipcMain, screen } = require("electron");
const path = require("path");

app.disableHardwareAcceleration();
app.commandLine.appendSwitch("enable-transparent-visuals");

let win = null;
let tray = null;
let optionsWin = null;
let isQuitting = false;
let bluetoothCallback = null;
let autoConnectTries = 0;

const startAutoConnect = () => {
  const attempt = async () => {
    if (!win || win.isDestroyed() || autoConnectTries > 50) {
      return;
    }

    autoConnectTries += 1;

    try {
      const ready = await win.webContents.executeJavaScript(
        "!!(window.app && window.app.trySilentReconnect)",
        false,
      );

      if (!ready) {
        setTimeout(attempt, 100);
        return;
      }

      // userGesture=true is required for requestDevice; mounted() has none.
      await win.webContents.executeJavaScript(
        "window.app.trySilentReconnect()",
        true,
      );
    } catch (e) {
      setTimeout(attempt, 100);
    }
  };

  attempt();
};

const finishBluetoothSelect = (deviceId) => {
  if (!bluetoothCallback) {
    return;
  }

  const callback = bluetoothCallback;
  bluetoothCallback = null;

  try {
    callback(deviceId);
  } catch (e) {
    // Calling the chooser callback twice crashes Electron; ignore repeats.
  }
};

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
    frame: false,
    icon: path.join(__dirname, "src/icons/LogoIdasenCtrl.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  optionsWin.loadFile("src/options.html");

  optionsWin.on("closed", () => {
    optionsWin = null;
  });
};

const BOTTOM_MARGIN = 12;

const centerBottom = () => {
  const { width, height } = win.getBounds();
  const { width: screenWidth, height: screenHeight } =
    screen.getPrimaryDisplay().workAreaSize;

  const x = Math.floor((screenWidth - width) / 2);
  const y = screenHeight - height - BOTTOM_MARGIN;

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
    icon: path.join(__dirname, "src/icons/LogoIdasenCtrl.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.webContents.on("select-bluetooth-device", (event, devices, callback) => {
    event.preventDefault();
    bluetoothCallback = callback;

    if (devices?.length) {
      finishBluetoothSelect(devices[0].deviceId);
    }
  });

  // The settings button must never spawn a framed popup window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.includes("options.html")) {
      openSettings();
    }

    return { action: "deny" };
  });

  win.loadFile("src/index.html");

  win.once("ready-to-show", () => {
    centerBottom();
    win.show();
    startAutoConnect();
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

ipcMain.on("open-options", () => openSettings());

ipcMain.on("cancel-bluetooth-scan", () => finishBluetoothSelect(""));

// In dev mode the executable is electron.exe, so the app directory is passed
// as an argument so the app (not the default Electron demo) is launched.
const loginItemArgs = app.isPackaged ? [] : [path.resolve()];

ipcMain.handle(
  "get-launch-at-login",
  () => app.getLoginItemSettings({ args: loginItemArgs }).openAtLogin,
);

ipcMain.handle("set-launch-at-login", (event, value) => {
  try {
    app.setLoginItemSettings({
      openAtLogin: !!value,
      args: loginItemArgs,
    });
  } catch (e) {
    // Launch-at-login is not supported on this platform (e.g. Linux).
  }

  return app.getLoginItemSettings({ args: loginItemArgs }).openAtLogin;
});

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
