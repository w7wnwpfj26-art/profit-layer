const { app, BrowserWindow, shell, dialog, ipcMain } = require("electron");
const path = require("path");
const { autoUpdater } = require("electron-updater");
const store = require("./store.cjs");

const DEFAULT_DASHBOARD_URL = process.env.DASHBOARD_URL || "http://localhost:3002";
const isDev = !app.isPackaged;

let mainWindow = null;
let settings = {};

function loadSettings() {
  settings = store.load(app.getPath("userData"));
  if (!settings.dashboardUrl) settings.dashboardUrl = DEFAULT_DASHBOARD_URL;
  if (!settings.localAccount) settings.localAccount = { id: "", name: "" };
  return settings;
}

function saveSettings() {
  store.save(app.getPath("userData"), settings);
}

function createWindow() {
  loadSettings();
  const url = settings.dashboardUrl || DEFAULT_DASHBOARD_URL;
  const bounds = settings.windowBounds || { width: 1280, height: 800 };

  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    minWidth: 900,
    minHeight: 600,
    x: bounds.x,
    y: bounds.y,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
    },
    title: "ProfitLayer - Dashboard",
    show: false,
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("closed", () => { mainWindow = null; });
  mainWindow.on("close", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const b = mainWindow.getBounds();
      settings.windowBounds = { width: b.width, height: b.height, x: b.x, y: b.y };
      saveSettings();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url: u }) => {
    if (u.startsWith("http")) {
      shell.openExternal(u);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  mainWindow.loadURL(url).catch(() => {
    dialog.showMessageBox(mainWindow, {
      type: "warning",
      title: "无法连接",
      message: "请先启动本地服务或检查地址",
      detail: "当前尝试连接: " + url + "\n\n可在「设置」中修改服务地址。",
      buttons: ["重试", "退出"],
    }).then(({ response }) => {
      if (response === 0) mainWindow.loadURL(url);
      else app.quit();
    });
  });
}

// 供渲染进程读写设置（持久化，更新不丢失）
ipcMain.handle("get-settings", () => loadSettings());
ipcMain.handle("set-settings", (_, next) => {
  if (next && typeof next === "object") {
    settings = { ...settings, ...next };
    saveSettings();
  }
  return settings;
});

function setupAutoUpdate() {
  const pkg = require("./package.json");
  const publish = (pkg.build && pkg.build.publish) || {};
  const provider = publish.provider || process.env.UPDATE_PROVIDER || "";
  const isGeneric = provider === "generic";
  const genericUrl = publish.url || process.env.UPDATE_BASE_URL || "";

  if (provider === "github") {
    const owner = publish.owner || process.env.GITHUB_OWNER || "";
    const repo = publish.repo || process.env.GITHUB_REPO || "";
    if (!owner || !repo || owner === "YOUR_GITHUB_USERNAME") return;
    autoUpdater.setFeedURL({ provider: "github", owner, repo });
  } else if (isGeneric && genericUrl) {
    autoUpdater.setFeedURL({ provider: "generic", url: genericUrl });
  } else {
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("update-available", () => {
    if (mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: "info",
        title: "发现新版本",
        message: "正在后台下载，完成后将提示您重启应用以完成更新。",
        buttons: ["确定"],
      });
    }
  });
  autoUpdater.on("update-downloaded", () => {
    if (mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: "info",
        title: "更新已就绪",
        message: "是否现在重启应用以完成更新？",
        buttons: ["立即重启", "稍后"],
      }).then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall(false, true);
      });
    }
  });
  autoUpdater.on("error", (err) => console.error("Auto-update error:", err));

  setInterval(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !isDev) autoUpdater.checkForUpdates();
  }, 60 * 60 * 1000);
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !isDev) autoUpdater.checkForUpdates();
  }, 5000);
}

app.whenReady().then(() => {
  createWindow();
  setupAutoUpdate();
});

app.on("window-all-closed", () => app.quit());
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
