# AGENTS.md

悬浮台历（FloatCalendar）的开发与打包说明。改代码前先看这一页。

## 项目概览

- Electron 33 桌面悬浮窗，纯 HTML/CSS/JS，没有框架，也没有前端构建步骤。
- 进程与模块：`main.js` 主进程（窗口、IPC、托盘、配置、定时同步）；`preload.js` 的 contextBridge；`records.js` 打卡记录（按天归档到 `records.json`）；`dingtalk.js` 钉钉考勤接口；`flex.js` 弹性工时计算（两个页面共用的纯浏览器脚本）。
- 页面：`float.html` 悬浮窗，`main.html` 主窗口（日历 + 今日打卡 + 钉钉配置 + 弹性设置）。
- 打包配置全部写在 `package.json` 的 `build` 字段里，没有独立的 `electron-builder.yml`。
- 运行数据目录：开发模式是 `%APPDATA%\float-calendar\`，打包版跟随 `productName`，是 `%APPDATA%\FloatCalendar\`；`main.js` 的 `migrateLegacyUserData()` 会在打包版首次启动时把旧目录的 `config.json`、`records.json` 搬过来。换机器只要拷这两个文件。

## 环境

- Node 18 以上（本机实测 v24.19.0）。
- 依赖只有两个 devDependencies：`electron ^33.0.0`、`electron-builder ^26.18.0`。
- 安装：`npm install`。国内慢时加镜像：

  ```bash
  ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install --registry=https://registry.npmmirror.com
  ```

## 开发调试

| 命令 | 作用 |
| --- | --- |
| `npm start` | `electron .`，起本地悬浮窗 |
| `npm run dev` | `electron . --dev` |
| `npm run icon` | 生成图标：`assets/icon.png`、`assets/icon.ico`、`assets/tray.png` |

**改完 HTML/CSS 必须完全退出旧实例再启动。** `main.js` 用 `app.requestSingleInstanceLock()` 做单实例锁，旧进程还在时新进程会直接退出，界面上看到的还是旧样式，容易被误判成"改动没生效"。退出方式：托盘右键 → 退出，或任务管理器结束所有 `electron.exe`（打包版是 `FloatCalendar.exe`）。启动时主进程会 `session.defaultSession.clearCache()`，正常重启就能加载到新文件，不需要手动清缓存。

**渲染与回归校验**（都以 Electron 入口运行，不是纯 node 脚本）：

```bash
npx electron .preview/render-main.js           # 主窗口截图 → .preview/main-render*.png
npx electron .preview/render-float.js          # 悬浮窗截图 → .preview/float-render.png
npx electron .preview/test-time-edit.js        # 回归测试：11 条断言，全过打印 RESULT 11/11 passed
```

`test-time-edit.js` 覆盖手动改打卡时间后推算下班时间的三种触发路径、悬浮窗广播、弹性设置自动保存与保存按钮两条路径；有一处失败就以退出码 1 结束。`package.json` 里没有 `test` 脚本，需要像上面那样直接指定入口。其它校验脚本：`.preview/check-collapse.js`（钉钉区块折叠与徽标状态）、`.preview/test-dingtalk.js`（钉钉打卡详情解析单测）、`.preview/test-autolaunch.js`（开机自启）。

**跑打包产物前先去掉 `ELECTRON_RUN_AS_NODE`**，否则 exe 会以纯 Node 模式启动，表现为进程在、没有窗口：

```powershell
$env:ELECTRON_RUN_AS_NODE = $null
```

## 打包

| 命令 | 产物 |
| --- | --- |
| `npm run build` | `electron-builder --win`，同时出 nsis 安装包和 portable 便携版，x64，输出到 `dist\` |
| `npm run build:dir` | `electron-builder --win --dir`，只出解包目录 `dist\win-unpacked`，调试用 |

- 产物文件名由 `build.nsis.artifactName`（`FloatCalendar-Setup-${version}.exe`）和 `build.portable.artifactName`（`FloatCalendar-Portable-${version}.exe`）的 `${version}` 模板决定。
- 首次打包要下载 Electron 和 NSIS、7zip 等构建资源；本机构建缓存里缺 `winCodeSign`，第一次打可能联网下载，网络不通会失败。国内可加镜像（PowerShell 用 `$env:` 赋值）：

  ```bash
  ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ \
  ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/ \
  npm run build
  ```

- 没有配代码签名（`build.win` 下没有证书配置），也没有配 `publish` 自动更新。安装时 Windows 提示"未知发布者"属于预期。
- 安装包特性：`oneClick: false`、`perMachine: false`、允许改安装目录、建桌面和开始菜单快捷方式（名称「悬浮台历」）。

## 版本号规则（打包前必做）

1. **每次打包前先改 `package.json` 的 `version`，再执行 `npm run build`。** 当前版本 `1.0.1`。
2. 不改版本直接打包，会**覆盖** `dist\` 里同名的旧产物（`FloatCalendar-Setup-<version>.exe`、`FloatCalendar-Portable-<version>.exe`），旧包直接丢失，无法回退对比。
3. **不要用改 exe 文件名的方式冒充新版本。** 重命名只改外层文件名，exe 内部版本仍是打包时 `package.json` 里的值，安装包和便携版会对不上，用户装完看到的还是旧版本号。`dist` 里历史遗留的 `FloatCalendar-Portable-1.0.1.exe` 就是这么来的——文件名 1.0.1，内部版本仍是 1.0.0。
4. 升版本后的核对方式：看 `dist\` 产物的文件名，或右键 exe → 属性 → 详细信息里的产品版本。
5. `README.md` 的产物表格里写死了 `1.0.0`，升版本后要同步改，否则文档和产物对不上。
6. 版本号按语义化来：界面或功能有改动升 minor（`1.0.0` → `1.1.0`），纯 bug 修复升 patch（`1.0.0` → `1.0.1`）。

## 改文件前的备份约定

- 动 HTML/CSS/JS 之前，先把要改的文件复制到 `backup\<日期>-<主题>\`，例如 `backup\20261124-ui-redesign\float.html`、`backup\20261124-ui-redesign\main.html`。
- 小范围追加修改可以在同一目录下再留一份 `<文件名>.bak-<说明>`，例如 `float.html.bak-fontfix`。
- 回退就是把这些文件复制回根目录覆盖。
- `backup/` 不在 `.gitignore` 里，仓库提交时注意别把备份目录一起提交。

## 改样式时不要碰的东西

- 打卡逻辑、`records` 存储、窗口行为（置顶、拖动、单实例、开机自启）属于功能层，改视觉时不要顺手改。开发模式下开机自启开关是禁用的，因为那时路径指向 `electron.exe`。
- 悬浮窗容器不要加 CSS `opacity`：Windows 的 `transparent: true` 窗口下整层半透明会导致合成错乱，出现文字被色块盖住。半透明只作用在背景 `rgba` 上，文字保持不透明。
- 行数多时窗口高度要给足，每行加 `flex-shrink: 0` 和固定 `line-height`，否则 flex 会压缩行高造成文字重叠。
- 主进程开了 `app.disableHardwareAcceleration()` + `disable-gpu-cache`，是拿软件渲染换内存（GPU 进程 122MB → 19MB）。删掉能省电，但内存会回到 283MB 左右。
