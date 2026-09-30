# Info Highlight：Firefox 本地开发指南（面向开发 agent）

## 项目概述
- **Info Lens**：用语言模型的 token surprisal（信息量）分析文本。仓库含 Python 后端（`run.py`/`server.py`/`backend/`）、前端（`client/`）和浏览器插件（`extension/`）。
- **Info Highlight**（`extension/info-highlight/`）：点工具栏图标，对当前网页/PDF 按段分析，并把 surprisal 画成热力高亮。两种引擎：
  - **本机**：Gemma 3 270M（ONNX q4），`@huggingface/transformers` + onnxruntime-web，WebGPU，无 WebGPU 时（仅 Firefox）退回 WASM。文本不出本机。
  - **云端**：`POST ${IL_API_BASE}/api/analyze`，默认 `https://api.info-lens.app`，可指向自建后端。
- `extension/shared/` 是两个插件共用的页面/PDF/service-worker 源码，构建时平铺进包；`semantic-highlight/` 是另一个插件，**没做 Firefox 适配**。
- 注释和 README 多为中文；改代码时保持原有风格与注释密度。

## 构建（Chrome 与 Firefox 共用同一份源码）
**加载的是 `extension/dist/`，不是源码目录。** 改源码后必须重新构建。
```bash
cd extension/info-highlight && npm install      # 首次；装 @huggingface/transformers，构建时拷进包
git lfs pull                                    # 图标是 LFS，未拉取则为指针文件
python3 extension/scripts/build_extension.py --firefox info-highlight   # → dist/info-highlight-firefox/
python3 extension/scripts/build_extension.py info-highlight             # → dist/info-highlight/（Chrome）
```
`--release` 写空 `config.js`（上架用）。`cd extension/info-highlight && npm test` 跑单测；已知 3 个失败在基线上就存在（`feedback-context` ×2 因 Node 的 `navigator` 只读；`i18n` 因 zh.js 多一条 "Edge server"），不要当作回归。

## Firefox 与 Chrome 的差异（`--firefox` 处理的部分）
| 项 | Chrome | Firefox 构建 |
|---|---|---|
| 后台 | `background.service_worker` + `importScripts` | `background.scripts`（event page），顺序取自 `background.js` 里的 `importScripts(...)` 行，首项为 `firefox-shim.js` |
| `importScripts` | 原生 | `firefox/shim.js` 置空（脚本由 manifest 加载） |
| offscreen 文档 | `chrome.offscreen` 承载模型页 | 无该 API；shim 在后台页里建隐藏 iframe 载入 `local/offscreen.html`，接口与 offscreen 对齐 |
| 设备 | 必须 WebGPU | WebGPU 优先，否则 WASM（`IH_localState.localDevice()`；`probeWebGPU()` 在 Firefox 上对有 WebAssembly 即返回 true） |
| manifest | — | 去掉 `offscreen` 权限；加 `browser_specific_settings.gecko`（id `info-highlight@infolens.local`，最低 140，`data_collection_permissions: websiteContent`）；可选主机权限加 localhost/127.0.0.1 及 `config.js` 里 `IL_API_BASE` 的 origin |

**约束：**
- 改 `background.js` 的 `importScripts` 列表要保持“每行一个 `importScripts('x.js');`”格式，否则 Firefox 的脚本顺序会漏项（构建脚本用正则提取）。
- Firefox 构建需要新增后台依赖时，按 `importScripts` 顺序加到 `background.js`，不要直接改 manifest。
- 用 `chrome.*`（Firefox 兼容），不要引入只在 Chrome 存在的 API；若必须，放进 `firefox/shim.js` 做垫片。
- `manifest.json` 里的 `"__MSG_*__"` 文案来自 `_locales/`；共享文案在 `shared/_locales`，同名 key 以插件自己的为准。

## 加载与调试
1. `about:debugging#/runtime/this-firefox` → Load Temporary Add-on → 选 `dist/info-highlight-firefox/manifest.json`；改完重新构建后点该条目的 Reload。
2. 后台日志：同页面点 **Inspect**。引擎 iframe 的日志也在这个控制台。内容脚本日志在网页自己的控制台。
3. 临时加载的扩展在 Firefox 重启后消失，仅用于开发。
4. Lint：`cd extension/dist/info-highlight-firefox && npx web-ext lint --source-dir .`。当前 0 error；已知警告来自 vendor 代码的 eval、`chrome.offscreen`（被垫片补上）、LFS 图标。

## 使用本机模型（默认，无需后端）
选项页 → 分析模式“仅本机”（或“自动”）→ “本地模型初始化” → 同意下载（Hugging Face 或 ModelScope，授权弹窗）。权重在 Cache API（`transformers-cache`），不进 `chrome.storage`。引擎在最后一段分析结束后闲置约 10 秒卸载；Firefox event page 空闲也会卸载，下一次分析会从缓存重载。

**Firefox WebGPU：** 取决于平台与版本，查 `about:support` → Graphics；`dom.webgpu.enabled` 可在 `about:config` 打开。没有 WebGPU 时自动走 WASM，结果应一致，只是慢。

## 使用自己的后端（可选）
```bash
pip install -r requirements.txt
python run.py --no-facade-token --base_model qwen3-0.6b     # 默认端口 5001，CORS 默认开
cp extension/info-highlight/config.example.js extension/info-highlight/config.js   # gitignore；含 IL_API_BASE
```
- `--no-facade-token` 必须：后端默认要 `X-Facade-Token`，扩展不发该头。只在本机/可信网络使用。
- 用不带 `--release` 的命令重新构建，选项页改为“仅云端”，授权弹出的主机权限。
- 局域网别机的后端更推荐 `ssh -L 5001:localhost:5001 <host>`，扩展里仍写 localhost。
- 云端模型下拉项（qwen3-0.6b、gemma-3-270m）在扩展里写死；服务端实际模型由 `--base_model` 决定，换非默认模型前先验证。
- 第三方聊天 API 不可用：需要逐 token 的 prompt logprobs，聊天 API 不提供。

## 关键文件
| 文件 | 作用 |
|---|---|
| `background.js` | 工具栏/右键入口、注入 content、云端请求、本机引擎调度与队列、init 窗口、`chrome.offscreen` 调用 |
| `local/offscreen.js` | 模型加载与逐 token 打分（WebGPU/WASM），空闲计时 |
| `local/state.js` | 偏好与本机状态（WebGPU 探测、模型 ID、缓存用量、下载源） |
| `local/init.js` / `init.html` | “本地模型初始化”窗口 |
| `firefox/shim.js` | Firefox 专用垫片（仅 Firefox 构建使用） |
| `analyzeRun.js`、`page-map.js` | 网页管线：分段、请求、把结果映射回 DOM 高亮 |
| `options.js` / `options.html` | 选项页 |
| `scripts/build_extension.py` | 构建（含 `--firefox`） |

## 未验证 / 待办
- 整个 Firefox 构建**未在真实 Firefox 中运行过**（仅构建 + `web-ext lint`）。首次实机验证重点：本机模型下载与权限弹窗、iframe 引擎的消息收发（`ih-local-engine`）、event page 卸载后的重载、PDF 流程、自动分析站点权限。
- `semantic-highlight` 未适配 Firefox。
- 上架 AMO、签名未做。
