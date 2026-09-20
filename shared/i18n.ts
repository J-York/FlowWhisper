import type { UiLanguage } from "./polish-prompt";

// Chinese source strings are stable message keys. User text and prompts are
// never translated; only interface strings and application status messages are.
export const english: Record<string, string> = {
  语音工作台: "Voice input",
  输入历史: "History",
  模型服务: "Providers",
  "AI 润色": "AI polish",
  个人词典: "Dictionary",
  偏好设置: "Preferences",
  语音输入: "Voice input",
  空格: "Space",
  秒: "s",
  条记录: "records",
  配置: "settings",
  中文: "Chinese",
  日本語: "Japanese",
  火山引擎: "Volcengine",
  自定义服务: "Custom service",
  "无法读取麦克风列表，请检查系统权限。":
    "Unable to list microphones. Check system permissions.",
  "连接等待过久，请检查网络后重试。":
    "Connection timed out. Check your network and try again.",
  "麦克风已断开，请重新连接设备。":
    "Microphone disconnected. Reconnect your device.",
  "无法使用麦克风，请检查权限或选择其他输入设备。":
    "Microphone unavailable. Check permissions or choose another device.",
  设置已保存: "Settings saved",
  已复制到剪贴板: "Copied to clipboard",
  "已安全保存 · 留空保持不变": "Saved securely · Leave blank to keep",
  "粘贴你的 API Key": "Paste your API key",
  "清除此密钥（保存后生效）": "Clear this key (applied on save)",
  "正在打开 FlowWhisper…": "Opening FlowWhisper…",
  已润色: "Polished",
  部分转写: "Partial transcript",
  原文回退: "Original kept",
  收起原文: "Hide original",
  查看原始转写: "Show original",
  复制文字: "Copy text",
  删除记录: "Delete entry",
  有未保存的设置: "Unsaved changes",
  保存设置: "Save settings",
  清空历史: "Clear history",
  请先连接语音模型: "Connect a speech model to get started",
  连接模型: "Connect model",
  "这是浏览器界面预览。录音、密钥存储与全局输入请使用桌面应用。":
    "Browser preview. Use the desktop app to record, store keys, and type into other apps.",
  "全局快捷键未注册成功，请在偏好设置中更换组合；仍可点击按钮录音。":
    "Shortcut unavailable. Choose another in Preferences, or use the record button.",
  输入设置: "Input options",
  语音识别模型: "Speech model",
  "启用 AI 润色": "Enable AI polish",
  自动输入: "Auto-paste",
  结束录音: "Stop recording",
  开始录音: "Start recording",
  "正在录音…": "Recording…",
  "正在连接模型…": "Connecting…",
  "正在转写…": "Transcribing…",
  "正在润色…": "Polishing…",
  开始语音输入: "Start voice input",
  本次输入: "Your text",
  转写结果: "Transcript",
  实时转写: "Live transcript",
  复制: "Copy",
  取消: "Cancel",
  录音结束后显示转写结果: "Your transcript appears after recording",
  "等待语音输入…": "Waiting for speech…",
  最近输入: "Recent input",
  全部历史: "View history",
  搜索历史: "Search history",
  "搜索你的文字…": "Search your text…",
  没有找到相关文字: "No matching entries",
  还没有输入记录: "No input history yet",
  前往语音工作台: "Go to voice input",
  实时流式: "Live streaming",
  结束后转写: "After recording",
  "获取 API Key": "Get API key",
  实时转写模型: "Live transcription model",
  "默认使用专门的实时转写模型，API Key 需要相应访问权限。":
    "Uses a dedicated live transcription model. Your API key needs access to this model.",
  "Whisper 模型": "Whisper model",
  "Whisper Large V3 Turbo · 更快": "Whisper Large V3 Turbo · Faster",
  "Whisper Large V3 · 更准": "Whisper Large V3 · More accurate",
  鉴权方式: "Authentication",
  "新版控制台 · API Key": "New console · API key",
  "旧版控制台 · App ID + Access Token": "Legacy · App ID + Access Token",
  "资源 ID": "Resource ID",
  "填写控制台已开通的流式识别资源，可使用试用额度。":
    "Enter an enabled streaming resource from your console. Trial credits may apply.",
  "WebSocket 接口": "WebSocket endpoint",
  "兼容 /audio/transcriptions；本地服务支持 http://localhost。":
    "Must support /audio/transcriptions. Local services can use http://localhost.",
  模型名称: "Model name",
  "API Key（可选）": "API key (optional)",
  识别语言: "Speech language",
  "自动识别 / 中英混合": "Auto-detect / Multilingual",
  配置说明: "Setup notes",
  "密钥由系统加密后保存在本机。音频直接发往你选择的服务商。":
    "Keys are encrypted by your system and stored locally. Audio is sent directly to your provider.",
  "火山流式识别的语言支持由所开通的资源决定；此处的语言提示不覆盖服务端设置。":
    "Volcengine language support depends on your resource. The language hint does not override server settings.",
  "免费额度、限速与模型权限由服务商决定。FlowWhisper 不承诺永久免费，也不收取中转费用。":
    "Free quotas, rate limits, and model access depend on your provider. FlowWhisper does not guarantee free usage or charge relay fees.",
  输入完成后自动润色: "Polish after recording",
  自然表达: "Natural",
  专业沟通: "Professional",
  简洁利落: "Concise",
  润色模型: "Polish model",
  服务类型: "Provider type",
  "兼容接口（Groq / DeepSeek / 火山方舟 / 本地）":
    "Compatible API (Groq / DeepSeek / Ark / Local)",
  "填写兼容 /chat/completions 的接口前缀。":
    "Enter a base URL compatible with /chat/completions.",
  "润色 API Key": "Polish API key",
  "未单独配置时，使用已保存的 Gemini Key。":
    "Leave blank to use your saved Gemini key.",
  "单独配置此服务的密钥；本地无鉴权服务可留空。":
    "Use this provider's key. Leave blank for local services without authentication.",
  润色说明: "Polish notes",
  "文字将发送给所选润色服务，失败时保留原文。":
    "Text is sent to your polish provider. If polishing fails, the original is kept.",
  系统提示词: "System prompt",
  恢复默认: "Restore default",
  提示词模板: "Prompt template",
  自定义: "Custom",
  "直接编辑完整提示词。{{dictionary}} 会替换为个人词典；不需要时可删除。":
    "Edit the complete prompt. {{dictionary}} expands to your dictionary; remove it if not needed.",
  提示词不能为空: "The prompt cannot be empty",
  "提示词过长，最多 20,000 字符。":
    "The prompt is too long (20,000 characters maximum).",
  "加载模板会替换当前提示词。":
    "Loading a template replaces the current prompt.",
  "加载此模板？": "Load this template?",
  "当前自定义提示词将被替换。": "Your custom prompt will be replaced.",
  替换提示词: "Replace prompt",
  保留当前提示词: "Keep current prompt",
  词条: "Terms",
  新词条: "New term",
  "例如：FlowWhisper、Kubernetes、张小明": "e.g. FlowWhisper, Kubernetes, Alex",
  添加词条: "Add term",
  暂无词条: "No terms yet",
  词典适用范围: "Dictionary usage",
  "用于 Gemini 识别提示、Groq / 兼容接口的 prompt 和 AI 润色。火山识别暂不传递个人词典。":
    "Used for Gemini speech hints, Groq / compatible API prompts, and AI polish. Not currently sent to Volcengine.",
  输入与快捷键: "Input & shortcuts",
  全局快捷键: "Global shortcut",
  自动粘贴到原应用: "Paste into the original app",
  麦克风: "Microphone",
  输入设备: "Input device",
  "首次录音授权后可显示完整设备名称。":
    "Full device names appear after granting microphone permission.",
  跟随系统默认麦克风: "System default microphone",
  刷新设备列表: "Refresh devices",
  "自动输入需要 macOS 辅助功能与自动化权限。":
    "Auto-paste requires macOS Accessibility and Automation permissions.",
  辅助功能权限已开启: "Accessibility permission granted",
  "请在系统设置中允许 FlowWhisper 的辅助功能权限":
    "Allow FlowWhisper in System Settings → Accessibility",
  检查权限: "Check permissions",
  隐私与历史: "Privacy & history",
  在本机保留文字历史: "Save text history locally",
  使用与隐私说明: "Usage & privacy",
  "全局快捷键开始录音后，文字会输入到原应用；切换窗口后请手动粘贴。单次录音最长 5 分钟。":
    "Start with the global shortcut to paste into your original app. Paste manually if you switch windows. Recordings are limited to 5 minutes.",
  "最多保留 200 条文字历史。关闭历史后不再保存新记录，已有记录需在历史页清空。":
    "Keeps up to 200 entries. Disabling history stops saving new entries. Clear existing entries on the History page.",
  "音频仅在内存中处理，文字历史为本机明文，密钥由系统加密。关闭窗口后驻留托盘，退出请使用托盘菜单。":
    "Audio is processed in memory. Text history is stored locally without encryption; keys use system encryption. Closing the window keeps the app in the tray. Use the tray menu to quit.",
  外观与语言: "Appearance & language",
  主题: "Theme",
  跟随系统: "System",
  浅色: "Light",
  暗色: "Dark",
  界面语言: "Interface language",
  简体中文: "简体中文",
  "灵感来自 Jot": "Inspired by Jot",
  关闭通知: "Dismiss notification",
  "清空所有输入历史？": "Clear all input history?",
  "本机保存的 {count} 条文字记录将被删除，此操作无法撤销。":
    "This will delete all {count} local entries. This cannot be undone.",
  保留记录: "Keep entries",
  历史记录已清空: "History cleared",
  "清除 {label}": "Clear {label}",
  "删除 {word}": "Delete {word}",
  "麦克风 {index}": "Microphone {index}",
  "已取消录制，原快捷键不变。":
    "Recording canceled. Your shortcut is unchanged.",
  "请按 Ctrl / Command / Alt 与其他按键的组合。":
    "Press Ctrl / Command / Alt with another key.",
  "已捕获组合键，松开按键即可完成。":
    "Shortcut captured. Release all keys to finish.",
  "已记录，点击「保存设置」生效。": "Captured. Click Save settings to apply.",
  "请先结束录音，再录制快捷键。": "Stop recording before capturing a shortcut.",
  当前快捷键: "Current shortcut",
  "请按下组合键…": "Press a key combination…",
  取消录制: "Cancel capture",
  录制快捷键: "Record shortcut",
  "Esc 取消 · 30 秒无操作自动退出": "Esc to cancel · Ends after 30 seconds",
  "按住拖动 · 自动记住位置": "Drag to move · Position is saved",
  "{status}，按住小球可拖动位置": "{status}. Drag the orb to move it.",
  "打开 FlowWhisper": "Open FlowWhisper",
  "开始 / 结束语音输入": "Start / stop voice input",
  退出: "Quit",
  "FlowWhisper 启动失败": "FlowWhisper could not start",
  "无法加载本地设置。请检查用户数据目录。":
    "Unable to load local settings. Check the user data folder.",
  "请先在模型服务中保存 Gemini API Key。":
    "Save your Gemini API key in Providers first.",
  "请先配置火山引擎的凭据。": "Set up your Volcengine credentials first.",
  "请先在模型服务中保存 Groq API Key。":
    "Save your Groq API key in Providers first.",
  "已有录音或文字处理正在进行。":
    "Recording or text processing is already in progress.",
  "正在连接语音服务…": "Connecting to the speech service…",
  已取消: "Canceled",
  正在聆听: "Listening",
  "已达到单次 5 分钟上限，请分段输入。":
    "The 5-minute limit has been reached. Please record in shorter segments.",
  "正在确认最后一句…": "Finalizing the transcript…",
  "没有识别到语音，请靠近麦克风后重试。":
    "No speech detected. Move closer to the microphone and try again.",
  "正在润色，让表达更流畅…": "Polishing your text…",
  "缺少润色 API Key": "Missing polish API key",
  "润色未完成或结果未通过检查，已保留原文。":
    "Polishing failed or did not pass validation. The original text was kept.",
  "无法访问系统剪贴板，文字已保留在本次输入中，可重新复制。":
    "Clipboard unavailable. Your text is kept in the transcript; try copying it again.",
  "部分转写，录音未完整处理。":
    "Partial transcript. The recording was not fully processed.",
  已取消本次输入: "Voice input canceled",
  "已复制到剪贴板，可粘贴到任意应用。":
    "Copied to clipboard. Paste into any app.",
  "文字已复制；无法备份原剪贴板，请手动粘贴。":
    "Copied. The previous clipboard could not be backed up; paste manually.",
  "文字已复制；目标窗口已改变或无法自动输入，请手动粘贴。":
    "Copied. The target window changed or auto-paste is unavailable; paste manually.",
  "已发送粘贴快捷键，原剪贴板已恢复。":
    "Paste shortcut sent. Original clipboard restored.",
  "已发送粘贴快捷键。": "Paste shortcut sent.",
  "已发送粘贴快捷键，但未能恢复原剪贴板。":
    "Paste shortcut sent, but the original clipboard could not be restored.",
  "文字已复制，自动输入不可用，请手动粘贴。":
    "Copied. Auto-paste unavailable; paste manually.",
  "系统密钥存储不可用，无法读取 API Key。":
    "System key storage is unavailable. Unable to read API keys.",
  "系统密钥存储不可用。为保护 API Key，未保存明文凭据。":
    "System key storage is unavailable. Keys were not saved as plain text.",
  "请先结束本次输入再保存设置。": "Finish voice input before saving settings.",
  "快捷键已被占用或无效，请换一个组合。":
    "Shortcut is taken or invalid. Choose another combination.",
  "请先结束录音并打开偏好设置。": "Stop recording and open Preferences first.",
  "麦克风权限未开启，请在系统设置中允许 FlowWhisper 使用麦克风。":
    "Allow FlowWhisper to use your microphone in System Settings.",
  麦克风录音失败: "Microphone recording failed",
  "当前设备无法提供 16 kHz 音频。": "This device cannot provide 16 kHz audio.",
  "录音收尾超时，最后一小段音频可能不完整。":
    "Recording finalization timed out. The last audio segment may be incomplete.",
  "请在桌面应用中使用此功能（npm run dev）。":
    "This feature is available in the desktop app.",
  润色结果长度异常: "Unexpected polish result length",
  润色改变了原文中的数字: "Polishing changed numbers in the original text",
  润色模型未按要求返回正文:
    "The polish model did not return plain text as requested",
  润色未返回文字: "The polish model returned no text",
  "录音超过 20 MB，请分段输入。":
    "Recording exceeds 20 MB. Please record in shorter segments.",
  "语音服务没有返回有效的 text 字段。":
    "The speech service returned no valid text field.",
  "请求超过额度或频率限制 (429)，请稍后重试或切换服务。":
    "Quota or rate limit reached (429). Try later or switch providers.",
  "Gemini 返回了无法解析的数据。": "Gemini returned unreadable data.",
  "无法连接 Gemini，请检查网络、API Key 和模型权限。":
    "Cannot connect to Gemini. Check your network, API key, and model access.",
  "Gemini 连接超时，请检查网络。":
    "Gemini connection timed out. Check your network.",
  "网络上传速度不足，录音已停止并保留已识别文字。":
    "Upload too slow. Recording stopped; recognized text was kept.",
  "等待 Gemini 最终转写超时，当前文字可能不完整。":
    "Gemini finalization timed out. The current transcript may be incomplete.",
  "无法连接火山引擎，请检查凭据、资源 ID 和网络。":
    "Cannot connect to Volcengine. Check credentials, resource ID, and network.",
  "火山引擎连接超时。": "Volcengine connection timed out.",
  "网络上传速度不足，录音已停止。": "Upload too slow. Recording stopped.",
  "等待火山引擎最终转写超时，当前文字可能不完整。":
    "Volcengine finalization timed out. The current transcript may be incomplete.",
  火山引擎返回无效协议帧: "Volcengine returned an invalid protocol frame",
  火山引擎协议头长度无效: "Invalid Volcengine header length",
  火山引擎协议帧被截断: "Truncated Volcengine protocol frame",
  火山引擎数据长度不匹配: "Volcengine data length mismatch",
  不支持的火山引擎压缩方式: "Unsupported Volcengine compression",
  "火山引擎返回非 JSON 数据": "Volcengine returned non-JSON data",
  "接口地址必须使用 HTTPS / WSS，本机服务可使用 HTTP；不能包含密钥、查询参数或片段":
    "Use HTTPS / WSS (HTTP for localhost). URLs cannot include credentials, query parameters, or fragments.",
  "请使用带修饰键的组合，Esc 保留用于取消录音":
    "Use a modifier key combination. Esc is reserved for canceling recording.",
  无效参数: "Invalid argument",
  不允许的调用来源: "Unauthorized caller",
};

export function translator(language: UiLanguage) {
  return (key: string, values?: Record<string, string | number>) => {
    const translated = language === "en" ? (english[key] ?? key) : key;
    return values
      ? translated.replace(/\{(\w+)\}/g, (match, name) =>
          String(values[name] ?? match),
        )
      : translated;
  };
}

// Backend errors can include a status code or several application messages.
// Keep provider diagnostics intact and translate only known, stable fragments.
const fragments = Object.entries(english)
  .filter(([key]) => key.length > 5)
  .sort((a, b) => b[0].length - a[0].length);
export function localizeMessage(message: string, language: UiLanguage): string {
  if (language !== "en") return message;
  if (english[message]) return english[message];
  let output = message
    .replace(
      /鉴权失败 \(([^)]+)\)，请检查 API Key、模型权限与服务是否开通。/g,
      "Authentication failed ($1). Check your API key, model access, and service activation.",
    )
    .replace(
      /服务返回 HTTP (\d+)，请检查接口地址与模型配置。/g,
      "Service returned HTTP $1. Check the endpoint and model settings.",
    )
    .replace(
      /Gemini 拒绝请求 \(([^)]+)\)，请检查模型访问权限与配置。/g,
      "Gemini rejected the request ($1). Check model access and settings.",
    )
    .replace(
      /(Gemini|火山引擎) 连接中断 \(([^)]+)\)，已保留收到的文字。/g,
      (_, provider, code) =>
        `${provider === "Gemini" ? provider : "Volcengine"} disconnected (${code}). Received text was kept.`,
    )
    .replace(
      /火山引擎连接中断 \(([^)]+)\)，已保留收到的文字。/g,
      "Volcengine disconnected ($1). Received text was kept.",
    )
    .replace(
      /火山引擎错误 (\S+)，请检查凭据、资源 ID 与服务额度。/g,
      "Volcengine error $1. Check credentials, resource ID, and quota.",
    )
    .replace(
      /火山引擎错误 (\S+)，请检查服务配置。/g,
      "Volcengine error $1. Check service settings.",
    );
  for (const [from, to] of fragments) output = output.split(from).join(to);
  return output;
}
