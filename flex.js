// 弹性工作制计算（纯浏览器脚本，float.html / main.html 共用）
// 规则：上班弹性 [startBegin, startEnd]，工作满 workMinutes 即可下班。
//   例：08:30–09:00 弹性 + 9.5h  →  08:31 打卡则 18:01 可下班。
// 早于 startBegin 打卡按 startBegin 算（早到不加时长）；
// 晚于 startEnd 打卡视为迟到，按实际时间顺延（9:15 → 18:45）。
(function () {
  function toMin(hhmm) {
    if (!hhmm || typeof hhmm !== 'string') return null;
    const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const h = Number(m[1]);
    const mi = Number(m[2]);
    if (!Number.isFinite(h) || !Number.isFinite(mi)) return null;
    return h * 60 + mi;
  }

  function toHHmm(min) {
    let v = Math.round(min);
    v = ((v % 1440) + 1440) % 1440;
    return String(Math.floor(v / 60)).padStart(2, '0') + ':' + String(v % 60).padStart(2, '0');
  }

  // 从配置里取出弹性参数，缺省即用户给定的一套
  function cfgOf(config) {
    const f = (config && config.flex) || {};
    return {
      enabled: f.enabled !== false,
      startBegin: f.startBegin || '08:30',
      startEnd: f.startEnd || '09:00',
      workMinutes: Number(f.workMinutes) || 570, // 9.5 小时
    };
  }

  // 根据实际上班时间推算应下班时间
  function computeOffDuty(onDutyHHmm, config) {
    const f = cfgOf(config);
    if (!f.enabled) return (config && config.checkOutTime) || '18:00';
    const begin = toMin(f.startBegin);
    const start = toMin(onDutyHHmm);
    const base = start == null ? begin : Math.max(start, begin);
    return toHHmm(base + f.workMinutes);
  }

  // 下班弹性窗口（最早可下班 / 最晚标准可下班）
  function offDutyWindow(config) {
    const f = cfgOf(config);
    const begin = toMin(f.startBegin);
    const end = toMin(f.startEnd);
    return {
      from: toHHmm(begin + f.workMinutes),
      to: toHHmm(end + f.workMinutes),
    };
  }

  // 是否迟到（晚于上班弹性结束时间）
  function isLate(onDutyHHmm, config) {
    const f = cfgOf(config);
    const end = toMin(f.enabled ? f.startEnd : (config && config.checkInTime) || '09:00');
    const t = toMin(onDutyHHmm);
    return t != null && end != null && t > end;
  }

  // 距离可下班还剩多少秒（负数表示已过点）
  function remainingSeconds(onDutyHHmm, config, now) {
    const target = computeOffDuty(onDutyHHmm, config);
    const tm = toMin(target);
    if (tm == null) return null;
    const n = now || new Date();
    const nowSec = n.getHours() * 3600 + n.getMinutes() * 60 + n.getSeconds();
    return tm * 60 - nowSec;
  }

  // 把秒数格式化成 “2小时29分” / “45秒”
  function formatRemain(sec) {
    if (sec == null) return '';
    if (sec <= 0) return '可以下班了';
    const total = Math.floor(sec);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    if (h > 0) return `还有 ${h}小时${m}分`;
    if (m > 0) return `还有 ${m}分`;
    return `还有 ${total}秒`;
  }

  window.Flex = {
    toMin,
    toHHmm,
    cfgOf,
    computeOffDuty,
    offDutyWindow,
    isLate,
    remainingSeconds,
    formatRemain,
  };
})();
