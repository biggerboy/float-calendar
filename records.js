// 打卡记录存储：按日期归档真实打卡时间
const fs = require('fs');
const path = require('path');

let filePath = '';

function init(userDataPath) {
  filePath = path.join(userDataPath, 'records.json');
}

function dateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function readAll() {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch (e) {
    console.error('读取打卡记录失败:', e);
  }
  return {};
}

function writeAll(data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error('写入打卡记录失败:', e);
  }
}

function getToday() {
  const rec = readAll()[dateKey()] || {};
  return {
    date: dateKey(),
    onDuty: rec.onDuty || null,
    offDuty: rec.offDuty || null,
    source: rec.source || null,
  };
}

// 手动记录一次打卡（type: 'onDuty' | 'offDuty'）
function punch(type, time, source = 'manual') {
  if (type !== 'onDuty' && type !== 'offDuty') return getToday();
  const data = readAll();
  const key = dateKey();
  const rec = data[key] || {};
  rec[type] = time;
  rec.source = source;
  rec.updatedAt = Date.now();
  data[key] = rec;
  writeAll(data);
  return getToday();
}

// 合并钉钉同步回来的数据（只填空值，不覆盖手动记录）
function mergeFromDingtalk(result, source = 'dingtalk') {
  const data = readAll();
  const key = dateKey();
  const rec = data[key] || {};
  let changed = false;

  if (result.onDuty && !rec.onDuty) {
    rec.onDuty = result.onDuty;
    changed = true;
  }
  if (result.offDuty && !rec.offDuty) {
    rec.offDuty = result.offDuty;
    changed = true;
  }
  if (changed) {
    rec.source = source;
    rec.updatedAt = Date.now();
    data[key] = rec;
    writeAll(data);
  }
  return getToday();
}

// 手动设置/修改某次打卡时间（time 为空表示清除该项）
function setTime(type, time) {
  if (type !== 'onDuty' && type !== 'offDuty') return getToday();
  const data = readAll();
  const key = dateKey();
  const rec = data[key] || {};
  if (!time) {
    delete rec[type];
  } else {
    rec[type] = time;
  }
  rec.source = 'manual';
  rec.updatedAt = Date.now();
  data[key] = rec;
  writeAll(data);
  return getToday();
}

// 清除今日记录（重新打卡用）
function clearToday() {
  const data = readAll();
  delete data[dateKey()];
  writeAll(data);
  return getToday();
}

function getRecent(days = 7) {
  const all = readAll();
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = dateKey(d);
    const rec = all[key] || {};
    out.push({ date: key, onDuty: rec.onDuty || null, offDuty: rec.offDuty || null });
  }
  return out;
}

module.exports = { init, getToday, punch, setTime, mergeFromDingtalk, clearToday, getRecent, dateKey };
