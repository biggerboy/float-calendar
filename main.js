const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, session } = require('electron');
const path = require('path');
const fs = require('fs');
const records = require('./records');
const dingtalk = require('./dingtalk');

// 窗口引用
let floatWindow = null;
let mainWindow = null;
let tray = null;
let syncTimer = null;

// 配置文件路径（延迟到 app ready 后再取）
let configPath = '';

// 默认配置
const defaultConfig = {
  customText: '今天也要元气满满！',
  checkInTime: '09:00',
  checkOutTime: '18:00',
  fontSize: 14,
  opacity: 0.88,
  bgColor: '#1a1a2e',
  textColor: '#ffffff',
  accentColor: '#ff5d7a',
  floatPos: { x: -1, y: -1 }, // -1 表示默认位置（右下角）
  showSeconds: true,
  showDate: true,

  // 弹性工作制：上班弹性 08:30–09:00，工作满 9.5h 可下班（→ 下班弹性 18:00–18:30）
  flex: {
    enabled: true,
    startBegin: '08:30',
    startEnd: '09:00',
    workMinutes: 570,
  },

  // 钉钉考勤 API（需要企业管理员建应用并授权后填写）
  dingtalk: {
    enabled: false,
    appKey: '',
    appSecret: '',
    userId: '',
    autoSync: true,
    syncIntervalMin: 10,
  },
};

// 加载配置
function loadConfig() {
  let cfg = { ...defaultConfig };
  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf-8');
      const saved = JSON.parse(data);
      cfg = {
        ...defaultConfig,
        ...saved,
        // 嵌套对象单独合并，避免旧配置缺字段
        dingtalk: { ...defaultConfig.dingtalk, ...(saved.dingtalk || {}) },
        flex: { ...defaultConfig.flex, ...(saved.flex || {}) },
      };

      // 迁移：旧版默认的暗淡配色升级为高对比配色（仅在用户未自定义过颜色时）
      if (cfg.textColor.toLowerCase() === '#e0e0e0' && cfg.accentColor.toLowerCase() === '#e94560') {
        cfg.textColor = defaultConfig.textColor;
        cfg.accentColor = defaultConfig.accentColor;
      }
    }
  } catch (e) {
    console.error('加载配置失败:', e);
  }
  return cfg;
}

// 保存配置
function saveConfig(cfg) {
  try {
    fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), 'utf-8');
  } catch (e) {
    console.error('保存配置失败:', e);
  }
}

let currentConfig = null;

// 打卡记录变化时通知所有窗口
function broadcastRecords() {
  const today = records.getToday();
  for (const win of [floatWindow, mainWindow]) {
    if (win && !win.isDestroyed()) {
      win.webContents.send('records:updated', today);
    }
  }
}

// 向主窗口推送同步状态
function sendSyncStatus(text, ok) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('dingtalk:status', { text, ok });
  }
}

// 从钉钉同步当天打卡数据
async function syncFromDingtalk(silent = false) {
  const cfg = currentConfig.dingtalk || {};
  if (!cfg.enabled) {
    if (!silent) return { ok: false, error: '钉钉同步未启用' };
    return { ok: false };
  }
  try {
    const result = await dingtalk.fetchTodayRecords(cfg);
    records.mergeFromDingtalk(result, 'dingtalk');
    broadcastRecords();
    const msg = `同步成功 · 上班 ${result.onDuty || '未打卡'} / 下班 ${result.offDuty || '未打卡'}`;
    sendSyncStatus(msg, true);
    return { ok: true, records: records.getToday(), message: msg };
  } catch (e) {
    const msg = `同步失败：${e.message}`;
    sendSyncStatus(msg, false);
    console.error(msg);
    return { ok: false, error: e.message };
  }
}

// 定时自动同步
function scheduleSync() {
  if (syncTimer) clearInterval(syncTimer);
  const cfg = currentConfig.dingtalk || {};
  if (!cfg.enabled || !cfg.autoSync) return;
  const minutes = Math.max(1, Number(cfg.syncIntervalMin) || 10);
  syncTimer = setInterval(() => syncFromDingtalk(true), minutes * 60 * 1000);
  syncTimer.unref();
}

// ========== 悬浮小窗 ==========
function createFloatWindow() {
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;

  let x = currentConfig.floatPos.x;
  let y = currentConfig.floatPos.y;
  if (x < 0 || y < 0) {
    // 默认放在右下角
    x = screenWidth - 236;
    y = screenHeight - 156;
  }

  floatWindow = new BrowserWindow({
    width: 220,
    height: 140,
    x: x,
    y: y,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    type: 'toolbar',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 加时间戳参数，避免 Electron 复用旧的渲染缓存
  floatWindow.loadFile('float.html', { query: { v: String(Date.now()) } });

  if (process.argv.includes('--dev')) {
    floatWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // 记录拖动后的位置
  floatWindow.on('move', () => {
    const [px, py] = floatWindow.getPosition();
    currentConfig.floatPos = { x: px, y: py };
    saveConfig(currentConfig);
  });

  floatWindow.on('closed', () => {
    floatWindow = null;
  });
}

// ========== 主窗口（点击展开） ==========
function createMainWindow() {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    return;
  }

  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;

  const winW = 480;
  const winH = Math.min(760, Math.max(560, screenHeight - 100));

  mainWindow = new BrowserWindow({
    width: winW,
    height: winH,
    x: Math.round((screenWidth - winW) / 2),
    y: Math.round((screenHeight - winH) / 2),
    frame: false,
    resizable: true,
    minWidth: 400,
    minHeight: 500,
    alwaysOnTop: false,
    skipTaskbar: false,
    hasShadow: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile('main.html', { query: { v: String(Date.now()) } });

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ========== 系统托盘 ==========
function buildTrayMenu() {
  const today = records.getToday();
  return Menu.buildFromTemplate([
    {
      label: '显示主窗口',
      click: () => createMainWindow(),
    },
    {
      label: today.onDuty ? `✓ 上班已打卡 ${today.onDuty}` : '记录上班打卡（当前时间）',
      click: () => recordPunch('onDuty'),
    },
    {
      label: today.offDuty ? `✓ 下班已打卡 ${today.offDuty}` : '记录下班打卡（当前时间）',
      click: () => recordPunch('offDuty'),
    },
    { type: 'separator' },
    {
      label: '从钉钉同步今天',
      click: () => syncFromDingtalk(),
    },
    {
      label: '显示/隐藏悬浮窗',
      click: () => {
        if (floatWindow) {
          floatWindow.isVisible() ? floatWindow.hide() : floatWindow.show();
        }
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => app.quit(),
    },
  ]);
}

function recordPunch(type) {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const rec = records.punch(type, `${hh}:${mm}`, 'manual');
  broadcastRecords();
  if (tray) tray.setContextMenu(buildTrayMenu());
  return rec;
}

function createTray() {
  // 用一个简单的 1x1 透明图标占位（避免没有图标文件报错）
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);

  tray.setToolTip('悬浮台历');
  tray.setContextMenu(buildTrayMenu());

  tray.on('click', () => {
    createMainWindow();
  });
}

// ========== IPC 通信 ==========

// 获取配置
ipcMain.handle('config:get', () => {
  return currentConfig;
});

// 保存配置
ipcMain.handle('config:save', (event, newConfig) => {
  currentConfig = {
    ...currentConfig,
    ...newConfig,
    dingtalk: { ...(currentConfig.dingtalk || {}), ...(newConfig.dingtalk || {}) },
    flex: { ...(currentConfig.flex || {}), ...(newConfig.flex || {}) },
  };
  saveConfig(currentConfig);
  scheduleSync(); // 钉钉配置可能变化，重建定时器
  // 通知悬浮窗更新
  if (floatWindow) {
    floatWindow.webContents.send('config:updated', currentConfig);
  }
  return currentConfig;
});

// ===== 打卡记录 =====
ipcMain.handle('records:get', () => records.getToday());
ipcMain.handle('records:recent', (event, days) => records.getRecent(days || 7));
ipcMain.handle('records:setTime', (event, type, time) => {
  const rec = records.setTime(type, time);
  broadcastRecords();
  if (tray) tray.setContextMenu(buildTrayMenu());
  return rec;
});
ipcMain.handle('punch:record', (event, type) => {
  const rec = recordPunch(type);
  return rec;
});
ipcMain.handle('punch:clear', () => {
  const rec = records.clearToday();
  broadcastRecords();
  if (tray) tray.setContextMenu(buildTrayMenu());
  return rec;
});

// ===== 钉钉同步 =====
ipcMain.handle('dingtalk:sync', async () => {
  const result = await syncFromDingtalk();
  if (tray) tray.setContextMenu(buildTrayMenu());
  return result;
});

// 点击悬浮窗 -> 展开主窗口
ipcMain.handle('float:expand', () => {
  createMainWindow();
});

// 关闭主窗口
ipcMain.handle('main:close', () => {
  if (mainWindow) {
    mainWindow.close();
  }
});

// 最小化主窗口
ipcMain.handle('main:minimize', () => {
  if (mainWindow) {
    mainWindow.minimize();
  }
});

// 禁用 GPU 磁盘缓存（Windows 上透明窗口容易出现合成层缓存错乱）
app.commandLine.appendSwitch('disable-gpu-cache');
app.commandLine.appendSwitch('disable-http-cache');

// ========== App 生命周期 ==========
app.whenReady().then(async () => {
  // 启动时清一次渲染缓存，保证 HTML/CSS 改动立即生效
  try {
    await session.defaultSession.clearCache();
  } catch (e) {
    console.warn('清理缓存失败:', e);
  }

  const userData = app.getPath('userData');
  configPath = path.join(userData, 'config.json');
  records.init(userData);
  currentConfig = loadConfig();
  createFloatWindow();
  createTray();
  scheduleSync();

  // 启动时若已配置钉钉，立即同步一次
  if (currentConfig.dingtalk && currentConfig.dingtalk.enabled) {
    syncFromDingtalk(true);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createFloatWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // macOS 上关闭窗口不退出应用
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 防止应用被意外关闭时丢失配置
app.on('before-quit', () => {
  if (floatWindow) {
    const [px, py] = floatWindow.getPosition();
    currentConfig.floatPos = { x: px, y: py };
    saveConfig(currentConfig);
  }
});
