# FlowWhisper

**随想随说，自然成文。** Windows / macOS 桌面语音输入工具，灵感来自 [Jot](https://github.com/google-gemini/jot-gemini-transcribe-macOS)。采用 Electron + React + TypeScript 独立实现。

## 已实现

- **Gemini 真正实时转写**：持续发送 16 kHz 单声道 PCM，展示 `interimInputTranscription` 临时结果，合并 `inputTranscription` 最终结果。默认 `gemini-3.5-transcribe-live`，使用手动 activity 边界结束一段输入。麦克风采集与连接并行，连接中的声音在内存短暂缓冲。
- **多识别服务**：Gemini Live、Groq Whisper、火山引擎双向流式，以及兼容 `/audio/transcriptions` 的第三方或本地服务。
- **可选 AI 润色**：默认关闭；展示并允许直接编辑完整系统提示词，提供自然、专业、简洁模板与恢复默认。支持 Gemini 或兼容 `/chat/completions` 的服务，独立设置模型、地址与密钥。超时、空回复、数字变化及明显异常输出回退原文。
- **主题与语言**：跟随系统、浅色、暗色；简体中文与 English。界面语言独立于语音识别语言，切换不会覆盖自定义提示词。
- **全局输入**：默认 `Ctrl+Shift+Space` / `⌘+Shift+Space` 开始或结束，Esc 取消；支持点击「录制快捷键」后按组合键设置。托盘常驻，显示不抢焦点、可拖动并记住位置的 38px 状态圆球；保留目标窗口校验、剪贴板回退与恢复。
- **个人词典**：最多 100 个词条；传给 Gemini / Whisper 提示与润色模型。
- **本机历史**：最多 200 条，搜索、复制、查看原文、删除；可关闭保存。断线时保存已收到的部分转写并标记不完整。
- **密钥加密**：使用 Electron `safeStorage` 和操作系统的密钥保护；渲染页面只能查询密钥是否存在，不能读取已存的原始密钥。

## 本地运行

需要 Node.js 22.12+ 和 npm。在本项目目录执行：

```sh
npm ci
npm run dev
```

首次安装/启动会下载 Electron。打开「模型服务」，填写并保存凭据，然后点击麦克风试用。在其他应用中使用全局快捷键，完成后文字会粘贴到原窗口。点击应用内麦克风时，结果复制到剪贴板。

```sh
npm run dev:web       # 仅预览界面，不录音、不使用密钥
npm run build         # 类型检查 + 前端/主进程构建
npm start             # 运行构建后的桌面应用
npm test              # 协议和会话测试，不请求真实模型
npm run test:desktop  # Electron 端到端测试，需要先 build
npm run test:drag     # Windows 实际鼠标拖动、焦点与位置持久化测试
npm run test:preferences # 提示词迁移、主题/英文、重启持久化与滚动条布局回归
npm run dist:win      # 在 Windows 生成 NSIS 安装程序
npm run dist:mac      # 在 macOS 生成 arm64 / x64 DMG
```

安装包输出到 `release/`。本机开发构建未签名；正式发布需要 Windows 代码签名证书，以及 Apple Developer ID 签名、公证凭据。macOS 安装包应在 macOS 构建和测试，不能把 Windows 构建成功视为 macOS 验证完成。仓库提供双平台 GitHub Actions 构建流程。

## 发布安装包

仓库的 GitHub Actions 会在推送 `v*` 标签时自动构建并发布安装包：

```sh
npm version patch        # 例如 0.1.7 -> 0.1.8，并创建 v0.1.8 标签
git push origin main --follow-tags
```

发布完成后，GitHub 会创建对应的 Release，并附加 Windows NSIS 安装包、macOS arm64/x64 DMG，以及 Linux AppImage 和 deb 安装包。普通推送和 Pull Request 仍会执行测试与构建检查，但不会创建 Release。

当前工作流生成未签名安装包。正式面向公众分发前，应在 GitHub Actions Secrets 中配置 Windows 代码签名和 Apple Developer ID 公证凭据，并相应启用 Electron Builder 的签名配置。

## 模型配置

| 服务        | 凭据与默认模型                                                                                                         | 文字何时出现   |
| ----------- | ---------------------------------------------------------------------------------------------------------------------- | -------------- |
| Gemini Live | [Google AI Studio Key](https://aistudio.google.com/apikey)，`gemini-3.5-transcribe-live`                               | 说话中实时更新 |
| Groq        | [Groq Key](https://console.groq.com/keys)，`whisper-large-v3-turbo` 或 `whisper-large-v3`                              | 结束录音后     |
| 火山引擎    | [豆包语音控制台](https://console.volcengine.com/speech/new/setting/apikeys)，新版 API Key 或旧版 App ID + Access Token | 说话中实时更新 |
| 自定义      | 兼容识别接口的 Base URL、模型名、可选 Key                                                                              | 结束录音后     |

火山默认接口 `wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async`，资源 ID `volc.bigasr.sauc.duration`。按控制台实际开通资源调整 ID，支持新版 `X-Api-Key` 和旧版双凭据。火山的语言范围由资源决定，当前未传递本地词典。

模型权限、试用额度、免费层和限速由服务商决定；应用不会将“免费”视为无限额度。所有请求从本机直达所选服务，没有 FlowWhisper 中转服务器。

润色支持 Groq、DeepSeek、火山方舟或本机兼容服务：填写对应 Base URL（不含 `/chat/completions`）、模型名与独立 Key。Gemini 润色未设置独立 Key 时复用 Gemini 识别 Key；兼容服务不会隐式复用其他平台的 Key。

「AI 润色」中的编辑框就是完整系统提示词，保存后直接发送给模型；不会在其后追加隐藏的风格或编辑要求。可选的 `{{dictionary}}` 占位符会替换为个人词典，删除占位符即可不使用词典。切换模板或恢复默认会替换自定义内容，并先显示确认。升级时旧版的补充要求会迁移到完整提示词中；切换界面语言只翻译未修改过的默认模板。

在「偏好设置 → 外观与语言」选择主题和界面语言，点击「保存设置」后在重启时恢复。界面预览即时变化，原生标题栏、托盘菜单及跟随系统主题在保存后同步。

## 权限与行为

- Windows：允许桌面应用使用麦克风。普通权限程序无法保证向管理员权限窗口输入；可手动粘贴。
- macOS：允许麦克风、辅助功能，以及控制 System Events 的自动化权限。在「偏好设置」检查辅助功能权限。安装到 Applications 后再授权。
- 快捷键是**按一次开始、再按一次结束**，当前不实现 Jot 的 `fn` 按住说话或全局按键监听。
- 在「偏好设置」点击「录制快捷键」，按下并松开 Ctrl / Command / Alt 等修饰键与其他键的组合，再点击「保存设置」。录制期间暂停原快捷键；Esc、切换窗口、离开设置页面或超时会退出录制。被其他应用占用的组合无法保存。
- 流式转写在主界面预览，录音时的小圆球只显示状态。识别及可选润色结束后一次性输入，不在外部输入框中反复插入、删除临时文字。
- 按住小圆球可拖动位置，松手后自动保存，下次录音或重启继续使用该位置。初始位置在屏幕右侧；屏幕移除或分辨率变化时会限制到可见工作区。小球接收鼠标操作，不再启用整个浮层的鼠标穿透。
- 自动粘贴检查原窗口仍在前台，不主动切换焦点。Windows 使用受校验的前台句柄与 Ctrl+V，macOS 使用前台进程检查与 Cmd+V。应用只确认快捷键已发送，无法保证所有第三方输入框接收成功；历史和复制功能可取回文字。
- 自动粘贴后尝试恢复原剪贴板内容；如果剪贴板已被其他操作更新则不覆盖。正在进行的输入可按 Esc 取消。
- 关闭主窗口后继续驻留托盘；从托盘菜单退出。录音中不会采集屏幕、上下文或其他按键。
- 当前为单次最长 5 分钟的短语音输入。没有录音磁盘恢复或离线重试队列；断电、退出、识别服务未返回的音频无法恢复。批量识别失败时也无法从文字历史重试音频。
- 网络请求使用 Node 直连；尚未提供应用内 HTTP/SOCKS 代理设置，系统代理不一定被继承。网络环境必须能访问所选接口。
- 润色校验是保守启发式，不能保证完全不改变含义。重要文本应复核；原始转写保存在历史中。

## 本机数据

Electron `app.getPath('userData')` 目录下：

- `settings.json`：模型、界面、输入偏好，不含密钥。
- `window-state.json`：小圆球的位置，独立保存，不受设置页面的保存操作影响。
- `secrets.enc`：操作系统保护的加密密钥，不能当作可跨机器搬运的配置。
- `history.json`：明文文字历史，包含原文与润色结果。关闭历史只影响新记录，清空已有记录需在「输入历史」操作。

音频不写入磁盘，内存音频在结束或取消后释放。开启润色会将转写文本发送给所选润色服务。

## 工程结构与验证

```text
electron/             主进程、IPC、存储、平台输入、录音状态机
electron/providers/   Gemini / 火山流式协议、Whisper 文件上传
src/                  React 界面、麦克风生命周期
public/pcm-worklet.js  AudioWorklet PCM 分片和结束时尾包 flush
shared/               类型、默认配置、输入校验
tests/                本地 WebSocket、协议、会话与润色测试
scripts/smoke.mjs     真实 Electron + 模拟麦克风 + 本地 HTTP 模型服务
.github/workflows/    Windows / macOS 检查与安装包构建
```

桌面测试使用独立临时配置和虚拟麦克风，不依赖真实账户，会验证 PCM 采集、WAV 上传、润色、剪贴板、密钥加密、历史与取消。Gemini 已使用真实接口和合成语音验证流式转写收尾；Groq / 火山服务仍需真实账户联调。具体覆盖范围和限制见 [验证记录](VALIDATION.md)。应用不将模拟服务测试表述为真实模型识别效果验证。

## 接口依据

- [Gemini Live Transcription 官方文档](https://ai.google.dev/gemini-api/docs/live-api/live-transcribe)
- [Groq Speech to Text 官方文档](https://console.groq.com/docs/speech-to-text)
- [火山引擎大模型流式识别官方文档](https://www.volcengine.com/docs/6561/1354869)
- [Electron 安全建议](https://www.electronjs.org/docs/latest/tutorial/security)

参考 Jot 的语音输入体验，未复制其 Swift 代码或视觉资源。FlowWhisper 独立实现，MIT 许可；与 Google、Groq、火山引擎无隶属关系。
