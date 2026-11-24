// 真实渲染主窗口并截图，用于验证打卡区块与钉钉配置区
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const outPath = path.join(__dirname, 'main-render.png');

const mockConfig = {
  customText: '今天也要元气满满！',
  checkInTime: '09:00',
  checkOutTime: '18:00',
  bgColor: '#1a1a2e',
  textColor: '#e0e0e0',
  accentColor: '#e94560',
  opacity: 0.85,
  showSeconds: true,
  showDate: true,
  floatPos: { x: -1, y: -1 },
  flex: { enabled: true, startBegin: '08:30', startEnd: '09:00', workMinutes: 570 },
  dingtalk: {
    enabled: false,
    appKey: '',
    appSecret: '',
    userId: '',
    autoSync: true,
    syncIntervalMin: 10,
  },
};

const mockRecords = {
  date: '2026-11-04',
  onDuty: '08:31',
  offDuty: null,
  source: 'manual',
};

const mockRecent = [
  { date: '2026-11-04', onDuty: '09:12', offDuty: null },
  { date: '2026-11-03', onDuty: '08:55', offDuty: '18:30' },
  { date: '2026-11-02', onDuty: '09:01', offDuty: '18:05' },
  { date: '2026-11-01', onDuty: '09:20', offDuty: '18:00' },
  { date: '2026-10-31', onDuty: '08:50', offDuty: '19:10' },
  { date: '2026-10-30', onDuty: null, offDuty: '18:00' },
  { date: '2026-10-29', onDuty: '09:05', offDuty: '18:20' },
];

ipcMain.handle('config:get', () => mockConfig);
ipcMain.handle('autolaunch:get', () => ({
  enabled: true,
  available: true,
  exePath: 'C:\\Users\\me\\AppData\\Local\\Programs\\FloatCalendar\\FloatCalendar.exe',
}));
ipcMain.handle('autolaunch:set', (e, v) => ({ enabled: !!v, available: true, ok: true }));
ipcMain.handle('records:get', () => mockRecords);
ipcMain.handle('records:recent', () => mockRecent);
ipcMain.handle('punch:record', (e, type) => {
  if (type === 'onDuty') mockRecords.onDuty = '09:15';
  else mockRecords.offDuty = '18:15';
  mockRecords.source = 'manual';
  return mockRecords;
});
ipcMain.handle('punch:clear', () => {
  mockRecords.onDuty = null;
  mockRecords.offDuty = null;
  return mockRecords;
});
ipcMain.handle('records:setTime', (e, type, time) => {
  mockRecords[type] = time || null;
  mockRecords.source = 'manual';
  return mockRecords;
});
ipcMain.handle('dingtalk:sync', () => ({ ok: true, message: '同步成功(模拟)' }));
ipcMain.handle('config:save', (e, cfg) => { Object.assign(mockConfig, cfg); return mockConfig; });
ipcMain.handle('float:expand', () => {});
ipcMain.handle('main:close', () => {});
ipcMain.handle('main:minimize', () => {});

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu-cache');

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 480,
    height: 800,
    frame: false,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, '..', 'main.html'), { query: { v: String(Date.now()) } });

  win.webContents.on('did-finish-load', async () => {
    await new Promise(r => setTimeout(r, 1200));
    // 临时把工作时长调成 12h，让剩余时间超过 1 小时，便于验证「时:分:秒.毫秒」格式
    try {
      await win.webContents.executeJavaScript(
        'config.flex = Object.assign({}, config.flex, { workMinutes: 720 }); updateInfoBar();'
      );
    } catch (e) {
      console.error('INJECT_FAIL', e.message);
    }
    await new Promise(r => setTimeout(r, 400));
    try {
      const img = await win.webContents.capturePage();
      fs.writeFileSync(outPath, img.toPNG());
      console.log('SCREENSHOT_OK ' + outPath);

      // 滚动到「启动与系统」区块
      await win.webContents.executeJavaScript(
        `document.getElementById('autoLaunchInput').closest('.dingtalk-section').scrollIntoView({ block: 'center' });`
      );
      await new Promise(r => setTimeout(r, 400));
      const imgSys = await win.webContents.capturePage();
      const outSys = path.join(__dirname, 'main-render-system.png');
      fs.writeFileSync(outSys, imgSys.toPNG());
      console.log('SCREENSHOT_OK ' + outSys);

      // 滚动到底部，截取钉钉配置区（body 是滚动容器）
      await win.webContents.executeJavaScript(
        'document.body.scrollTop = document.body.scrollHeight; document.documentElement.scrollTop = document.documentElement.scrollHeight;'
      );
      await new Promise(r => setTimeout(r, 600));
      const img2 = await win.webContents.capturePage();
      const out2 = path.join(__dirname, 'main-render-bottom.png');
      fs.writeFileSync(out2, img2.toPNG());
      console.log('SCREENSHOT_OK ' + out2);
    } catch (e) {
      console.error('SCREENSHOT_FAIL', e);
    }
    app.quit();
  });
});
