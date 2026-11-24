// 真实渲染悬浮窗并截图，用于验证文字可读性 + 弹性下班推算
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const outPath = path.join(__dirname, 'float-render.png');

const mockConfig = {
  customText: '今天也要元气满满！',
  checkInTime: '09:00',
  checkOutTime: '18:00',
  bgColor: '#1a1a2e',
  textColor: '#ffffff',
  accentColor: '#ff5d7a',
  opacity: 0.88,
  showSeconds: true,
  showDate: true,
  floatPos: { x: -1, y: -1 },
  flex: { enabled: true, startBegin: '08:30', startEnd: '09:00', workMinutes: 570 },
};

// 8:31 打卡 → 应 18:01 可下班
const mockRecords = { date: '2026-11-04', onDuty: '08:31', offDuty: null, source: 'manual' };

ipcMain.handle('config:get', () => mockConfig);
ipcMain.handle('records:get', () => mockRecords);

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu-cache');

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 220,
    height: 140,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: false,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, '..', 'float.html'), { query: { v: String(Date.now()) } });

  win.webContents.on('did-finish-load', async () => {
    await new Promise(r => setTimeout(r, 800));
    // 临时把工作时长调成 12h，让剩余时间超过 1 小时，便于验证「时:分:秒.毫秒」格式
    try {
      await win.webContents.executeJavaScript(
        'config.flex = Object.assign({}, config.flex, { workMinutes: 720 }); updateCheckin();'
      );
    } catch (e) {
      console.error('INJECT_FAIL', e.message);
    }
    await new Promise(r => setTimeout(r, 400));
    try {
      const img = await win.webContents.capturePage();
      fs.writeFileSync(outPath, img.toPNG());
      console.log('SCREENSHOT_OK ' + outPath);
    } catch (e) {
      console.error('SCREENSHOT_FAIL', e);
    }
    app.quit();
  });
});
