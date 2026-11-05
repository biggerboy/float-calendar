// 用 mock fetch 验证 dingtalk.js 的解析逻辑
const path = require('path');
const dingtalk = require(path.join(__dirname, '..', 'dingtalk.js'));

const calls = [];
global.fetch = async (url, opts) => {
  calls.push({ url, opts });
  if (url.includes('gettoken')) {
    return { json: async () => ({ errcode: 0, access_token: 'mock-token' }) };
  }
  if (url.includes('listRecord')) {
    return {
      json: async () => ({
        errcode: 0,
        recordresult: [
          { checkType: 'OnDuty', userCheckTime: new Date(2026, 10, 4, 9, 12).getTime() },
          { checkType: 'OnDuty', userCheckTime: new Date(2026, 10, 4, 8, 58).getTime() },
          { checkType: 'OffDuty', userCheckTime: new Date(2026, 10, 4, 18, 30).getTime() },
          { checkType: 'OffDuty', userCheckTime: new Date(2026, 10, 4, 18, 5).getTime() },
        ],
      }),
    };
  }
  throw new Error('unexpected url ' + url);
};

(async () => {
  const res = await dingtalk.fetchTodayRecords(
    { appKey: 'k', appSecret: 's', userId: 'u' },
    new Date(2026, 10, 4, 12, 0)
  );
  console.log('RESULT', JSON.stringify(res));

  const ok =
    res.onDuty === '08:58' &&
    res.offDuty === '18:30' &&
    calls.length === 2 &&
    calls[0].url.includes('appkey=k') &&
    calls[1].opts.method === 'POST';

  // 缺配置应抛错
  let missingErr = '';
  try {
    await dingtalk.fetchTodayRecords({ appKey: 'k' });
  } catch (e) {
    missingErr = e.message;
  }

  console.log(ok ? 'TEST_PASS' : 'TEST_FAIL', '| missing:', missingErr);
  process.exit(ok && missingErr.includes('AppSecret') ? 0 : 1);
})();
