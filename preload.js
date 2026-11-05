const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // 配置相关
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (cfg) => ipcRenderer.invoke('config:save', cfg),
  onConfigUpdated: (callback) => {
    ipcRenderer.on('config:updated', (event, config) => callback(config));
  },

  // 打卡记录
  getRecords: () => ipcRenderer.invoke('records:get'),
  getRecentRecords: (days) => ipcRenderer.invoke('records:recent', days),
  recordPunch: (type) => ipcRenderer.invoke('punch:record', type),
  setRecordTime: (type, time) => ipcRenderer.invoke('records:setTime', type, time),
  clearTodayRecords: () => ipcRenderer.invoke('punch:clear'),
  onRecordsUpdated: (callback) => {
    ipcRenderer.on('records:updated', (event, rec) => callback(rec));
  },

  // 钉钉同步
  syncDingtalk: () => ipcRenderer.invoke('dingtalk:sync'),
  onSyncStatus: (callback) => {
    ipcRenderer.on('dingtalk:status', (event, status) => callback(status));
  },

  // 悬浮窗操作
  expand: () => ipcRenderer.invoke('float:expand'),

  // 主窗口操作
  closeWindow: () => ipcRenderer.invoke('main:close'),
  minimizeWindow: () => ipcRenderer.invoke('main:minimize'),
});
