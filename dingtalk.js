// 钉钉官方考勤 API 封装
// 文档：https://open.dingtalk.com/document/development/attendance-clock-in-record-is-open
// 前置条件：企业主管理员在开放平台创建「企业内部应用」，申请「考勤数据读权限」，
//          拿到 AppKey / AppSecret，并查出自己的 userId。
const TOKEN_URL = 'https://oapi.dingtalk.com/gettoken';
const RECORD_URL = 'https://oapi.dingtalk.com/attendance/listRecord';

function pad(n) { return String(n).padStart(2, '0'); }

function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function tsToHHmm(ts) {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return null;
  const d = new Date(n);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function getToken(appKey, appSecret) {
  const url = `${TOKEN_URL}?appkey=${encodeURIComponent(appKey)}&appsecret=${encodeURIComponent(appSecret)}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.errcode !== 0 || !data.access_token) {
    throw new Error(`获取 access_token 失败：${data.errmsg || JSON.stringify(data)}`);
  }
  return data.access_token;
}

// 拉取某人当天的实际打卡时间
async function fetchTodayRecords(cfg, now = new Date()) {
  const missing = [];
  if (!cfg.appKey) missing.push('AppKey');
  if (!cfg.appSecret) missing.push('AppSecret');
  if (!cfg.userId) missing.push('userId');
  if (missing.length) {
    throw new Error(`缺少配置：${missing.join('、')}`);
  }

  const token = await getToken(cfg.appKey, cfg.appSecret);
  const day = dateKey(now);

  // 接口限制：起止时间最多相隔 7 天，这里只查当天
  const body = {
    userIds: [cfg.userId],
    checkDateFrom: `${day} 00:00:00`,
    checkDateTo: `${day} 23:59:59`,
  };

  const res = await fetch(`${RECORD_URL}?access_token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (data.errcode !== 0) {
    throw new Error(`获取打卡详情失败：${data.errmsg || JSON.stringify(data)}`);
  }

  const list = Array.isArray(data.recordresult) ? data.recordresult : [];
  const onTimes = [];
  const offTimes = [];

  for (const item of list) {
    const t = tsToHHmm(item.userCheckTime);
    if (!t) continue;
    if (item.checkType === 'OnDuty') onTimes.push(t);
    else if (item.checkType === 'OffDuty') offTimes.push(t);
  }

  // 上班取当天最早一次，下班取当天最晚一次
  onTimes.sort();
  offTimes.sort();

  return {
    date: day,
    onDuty: onTimes.length ? onTimes[0] : null,
    offDuty: offTimes.length ? offTimes[offTimes.length - 1] : null,
    rawCount: list.length,
  };
}

module.exports = { fetchTodayRecords, getToken };
