<template>
  <div class="page">
    <header class="page-header">
      <h1>UPath AI 导师 · 本地接入示例</h1>
      <p>在这里输入生产环境的 API-Key，一键唤醒语音导师对话。</p>
    </header>

    <main class="page-main">
      <section class="card">
        <h2 class="section-title">1. 配置 API-Key</h2>

        <label class="field-label" for="api-key-input">API-Key（来自 UPath 控制台）</label>
        <input
          id="api-key-input"
          v-model="apiKeyInput"
          type="password"
          class="input"
          placeholder="粘贴你的 API-Key"
          :disabled="isValidating || isConnected || isStarting"
        />

        <div class="button-row">
          <button
            class="btn primary"
            :disabled="!apiKeyInput || isValidating || isConnected || isStarting"
            @click="handleSaveAndValidate"
          >
            <span v-if="isValidating">验证中...</span>
            <span v-else-if="apiKeySaved">重新验证 API-Key</span>
            <span v-else>保存并验证 API-Key</span>
          </button>

          <button
            class="btn ghost"
            :disabled="!apiKeySaved || isValidating || isStarting || isConnected"
            @click="handleClearKey"
          >
            清除本地保存
          </button>
        </div>

        <p v-if="apiKeyError" class="status status-error">
          {{ apiKeyError }}
        </p>
        <p v-else-if="apiKeySaved" class="status status-ok">
          API-Key 已通过验证并保存在浏览器本地（localStorage）。
        </p>
      </section>

      <section class="card">
        <h2 class="section-title">2. 启动 / 结束 AI 导师对话</h2>

        <p class="help-text">
          示例中固定使用「数学老师」场景（scene_name = "Math"）。你可以在真实项目中替换为其他场景。
        </p>

        <div class="status-block">
          <div class="status-row">
            <span class="status-label">连接状态：</span>
            <span :class="['status-pill', isConnected ? 'pill-on' : 'pill-off']">
              {{ isConnected ? '已连接' : '未连接' }}
            </span>
          </div>
          <div class="status-row">
            <span class="status-label">当前场景：</span>
            <span class="status-value">
              {{ currentSceneName || '尚未获取场景配置' }}
            </span>
          </div>
          <div class="status-row">
            <span class="status-label">屏幕共享：</span>
            <span class="status-value">
              {{ isScreenSharing ? '已开启' : '未开启' }}
            </span>
          </div>
          <div class="status-row">
            <span class="status-label">调试信息：</span>
            <span class="status-value">
              {{ statusMessage || '就绪' }}
            </span>
          </div>
        </div>

        <!-- 静音警告提示 -->
        <div v-if="showSilenceWarning" class="silence-warning">
          <span class="warning-icon">!</span>
          <span>长时间未检测到语音，对话将在 {{ formatSilenceCountdown }} 后自动结束</span>
        </div>

        <div class="button-row">
          <button
            class="btn primary large"
            :disabled="!apiKeySaved || isValidating || isStarting"
            @click="handleToggleConversation"
          >
            <span v-if="isStarting">
              {{ isConnected ? '正在结束对话...' : '正在启动对话...' }}
            </span>
            <span v-else>
              {{ isConnected ? '结束 AI 导师对话' : '启动 AI 导师对话' }}
            </span>
          </button>
        </div>

        <p v-if="connectionError" class="status status-error top-space">
          {{ connectionError }}
        </p>
      </section>

      <section class="card small-note">
        <h2 class="section-title">3. 集成到你自己的项目</h2>
        <ul class="note-list">
          <li>本示例直接访问生产环境 API：<code>https://api.upath.cn</code>。</li>
          <li>仅保留最核心流程：验证 API-Key → 获取场景 → 初始化 RTC → 启动屏幕共享 + 语音对话。</li>
          <li>未引入试用模式、公告弹窗、人设调试等试用页的其他 UI 功能。</li>
        </ul>
      </section>
    </main>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, computed } from 'vue'
import VERTC, { MediaType } from '@volcengine/rtc'
import { apiKeyManager, apiService } from './services/api'

const DEFAULT_SCENE_NAME = 'Math'

// API-Key 状态
const apiKeyInput = ref('')
const apiKeySaved = ref(false)
const apiKeyError = ref('')
const isValidating = ref(false)

// 连接 / 屏幕共享状态
const isConnected = ref(false)
const isStarting = ref(false)
const isScreenSharing = ref(false)
const statusMessage = ref('')
const connectionError = ref('')

// 场景 + RTC
const currentScene = ref(null)
const rtcEngine = ref(null)

// 房间ID（用于 aigc 接口）
const roomId = ref('')

// 静音检测常量（调试模式：2分钟超时，最后30秒警告）
const SILENCE_THRESHOLD = 25      // 音量阈值（0-255，低于此值视为静音）
const SILENCE_TIMEOUT = 120       // 静音超时时间（秒）= 2分钟（调试用，生产环境改为300）
const WARNING_THRESHOLD = 30      // 最后30秒显示警告（调试用，生产环境改为60）

// 静音倒计时状态
const silenceTimer = ref(null)
const silenceCountdown = ref(SILENCE_TIMEOUT)
const isSilent = ref(false)
const showSilenceWarning = ref(false)

const currentSceneName = computed(() => {
  if (!currentScene.value) return ''
  return currentScene.value.scene?.name || currentScene.value.scene?.id || ''
})

// 格式化倒计时显示
const formatSilenceCountdown = computed(() => {
  const minutes = Math.floor(silenceCountdown.value / 60)
  const seconds = silenceCountdown.value % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
})

// 从本地恢复 API-Key
onMounted(() => {
  const saved = apiKeyManager.getApiKey()
  if (saved) {
    apiKeyInput.value = saved
    apiKeySaved.value = true
    statusMessage.value = '检测到已保存的 API-Key，可直接启动对话。'
  }
  // 注册页面关闭监听器
  window.addEventListener('pagehide', handlePageHide)
})

// 保存并验证 API-Key
const handleSaveAndValidate = async () => {
  const key = apiKeyInput.value.trim()
  apiKeyError.value = ''
  connectionError.value = ''

  if (!key) {
    apiKeyError.value = '请先输入 API-Key。'
    return
  }
  if (key.length < 20) {
    apiKeyError.value = 'API-Key 看起来太短，请检查是否复制完整。'
    return
  }

  isValidating.value = true
  statusMessage.value = '正在验证 API-Key ...'

  const result = await apiService.validateApiKey(key)

  if (result.valid) {
    apiKeyManager.setApiKey(key)
    apiKeySaved.value = true
    apiKeyError.value = ''
    statusMessage.value = 'API-Key 验证成功，可以启动 AI 导师对话。'
  } else {
    apiKeySaved.value = false
    apiKeyError.value = result.message || 'API-Key 验证失败。'
    statusMessage.value = 'API-Key 验证失败，请检查后重试。'
  }

  isValidating.value = false
}

// 清除本地保存的 Key
const handleClearKey = () => {
  apiKeyManager.clearApiKey()
  apiKeySaved.value = false
  apiKeyInput.value = ''
  statusMessage.value = '已清除本地保存的 API-Key。'
}

// ========== 静音检测功能 ==========

// 处理音频属性报告
const handleAudioPropertiesReport = (infos) => {
  if (!isConnected.value) return
  const micInfo = infos.find(info => info.streamIndex === 0)
  const audioLevel = micInfo?.audioPropertiesInfo?.linearVolume || 0

  // 调试日志：每次回调都打印音量（可注释掉减少日志量）
  console.log('[静音检测] 音量:', audioLevel, '阈值:', SILENCE_THRESHOLD, '静音状态:', isSilent.value)

  if (audioLevel > SILENCE_THRESHOLD) {
    if (isSilent.value) {
      console.log('[静音检测] 检测到说话，重置倒计时')
    }
    resetSilenceTimer()
  } else if (!isSilent.value) {
    console.log('[静音检测] 开始静音，启动倒计时')
    startSilenceTimer()
  }
}

// 启动静音倒计时
const startSilenceTimer = () => {
  isSilent.value = true
  silenceCountdown.value = SILENCE_TIMEOUT
  if (silenceTimer.value) return

  console.log('[静音检测] 倒计时启动，总时长:', SILENCE_TIMEOUT, '秒')

  silenceTimer.value = setInterval(() => {
    silenceCountdown.value--

    // 每10秒打印一次倒计时
    if (silenceCountdown.value % 10 === 0) {
      console.log('[静音检测] 倒计时:', silenceCountdown.value, '秒')
    }

    if (silenceCountdown.value <= WARNING_THRESHOLD && !showSilenceWarning.value) {
      console.log('[静音检测] 进入警告阶段，剩余:', silenceCountdown.value, '秒')
      showSilenceWarning.value = true
    }
    if (silenceCountdown.value <= 0) {
      console.log('[静音检测] 倒计时结束，自动结束对话')
      handleSilenceTimeout()
    }
  }, 1000)
}

// 重置静音倒计时
const resetSilenceTimer = () => {
  const wasWarning = showSilenceWarning.value
  isSilent.value = false
  silenceCountdown.value = SILENCE_TIMEOUT
  showSilenceWarning.value = false
  if (silenceTimer.value) {
    clearInterval(silenceTimer.value)
    silenceTimer.value = null
    console.log('[静音检测] 倒计时已重置', wasWarning ? '（从警告状态恢复）' : '')
  }
}

// 静音超时处理
const handleSilenceTimeout = async () => {
  console.log('[静音检测] 超时！自动结束对话')
  if (silenceTimer.value) {
    clearInterval(silenceTimer.value)
    silenceTimer.value = null
  }
  alert('由于长时间未检测到语音，对话已自动结束')
  await stopConversation()
}

// ========== 页面关闭处理 ==========

// 处理页面卸载（关闭标签页或浏览器时自动结束对话）
const handlePageHide = (event) => {
  console.log('pagehide triggered, persisted:', event.persisted, 'isConnected:', isConnected.value)
  if (event.persisted) return
  if (isConnected.value && currentScene.value) {
    const url = `https://api.upath.cn/api/aigc/proxy?Action=StopVoiceChat`
    const body = JSON.stringify({
      SceneID: currentScene.value.scene.id,
      inputParams: { RoomId: roomId.value }
    })
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKeyManager.getApiKey() || ''
      },
      body,
      keepalive: true
    }).catch(() => {})
  }
}

// ========================================

// 启动 / 结束对话
const handleToggleConversation = async () => {
  if (isConnected.value) {
    await stopConversation()
  } else {
    await startConversation()
  }
}

// 启动对话：场景 → RTC → 加房 → 音频 + 屏幕 → StartVoiceChat
const startConversation = async () => {
  if (!apiKeySaved.value) {
    connectionError.value = '请先完成 API-Key 验证。'
    return
  }

  const apiKey = apiKeyManager.getApiKey()
  if (!apiKey) {
    connectionError.value = '未找到有效 API-Key，请重新输入并验证。'
    apiKeySaved.value = false
    return
  }

  isStarting.value = true
  connectionError.value = ''
  statusMessage.value = '正在获取场景配置...'

  // 生成业务侧 RoomId（格式：room_时间戳）
  roomId.value = `room_${Date.now()}`
  console.log('业务侧 RoomId:', roomId.value)

  try {
    // 1. 获取场景（Math）
    const scenesData = await apiService.getScenes(apiKey, DEFAULT_SCENE_NAME, roomId.value)
    const scenes = scenesData?.Result?.scenes || []
    if (!scenes.length) {
      throw new Error('未找到可用的场景配置，请检查 API-Key 是否有 Math 场景权限。')
    }
    currentScene.value = scenes[0]

    const rtcConfig = currentScene.value.rtc
    if (!rtcConfig || !rtcConfig.AppId) {
      throw new Error('场景中缺少 RTC 配置信息。')
    }

    statusMessage.value = '正在初始化 RTC 引擎...'

    // 2. 初始化引擎（清理旧实例）
    if (rtcEngine.value) {
      try {
        await rtcEngine.value.leaveRoom()
        rtcEngine.value.destroy()
      } catch {}
      rtcEngine.value = null
    }

    const engine = VERTC.createEngine(rtcConfig.AppId)
    if (!engine) {
      throw new Error('创建 RTC 引擎失败。')
    }
    rtcEngine.value = engine

    // 注册音频属性报告回调（用于静音检测）
    console.log('[静音检测] 注册 onLocalAudioPropertiesReport 回调')
    engine.on(VERTC.events.onLocalAudioPropertiesReport, handleAudioPropertiesReport)

    // 3. 加入房间
    statusMessage.value = '正在加入房间...'
    await engine.joinRoom(
      rtcConfig.Token,
      rtcConfig.RoomId,
      { userId: rtcConfig.UserId },
      {
        isAutoPublish: true,
        isAutoSubscribeAudio: true,
        isAutoSubscribeVideo: false
      }
    )

    // 4. 启用音频属性报告（必须在 startAudioCapture 之前调用）
    console.log('[静音检测] 启用音频属性报告，间隔: 300ms')
    engine.enableAudioPropertiesReport({ interval: 300 })

    // 5. 启动本地音频
    statusMessage.value = '正在启动本地麦克风...'
    await engine.startAudioCapture()

    // 6. 启动屏幕共享（如果支持）
    try {
      statusMessage.value = '正在启动屏幕共享...'
      await startScreenShare()
    } catch (err) {
      console.warn('屏幕共享启动失败，将仅启用语音对话。', err)
    }

    // 7. 通知后端启动 AI 语音对话
    statusMessage.value = '正在唤醒 AI 导师...'
    console.log('启动 AIGC 对话，RoomId:', roomId.value)
    await apiService.startVoiceChat(apiKey, currentScene.value.scene.id, roomId.value)

    isConnected.value = true
    statusMessage.value = 'AI 导师已连接，可以开始说话。'
  } catch (err) {
    console.error('启动对话失败:', err)
    connectionError.value = err?.message || '启动 AI 导师对话失败。'
    statusMessage.value = '启动失败，请检查错误信息后重试。'

    await safeCleanupRtc()
    isConnected.value = false
    currentScene.value = null
  } finally {
    isStarting.value = false
  }
}

// 结束对话：StopVoiceChat → 清理 RTC
const stopConversation = async () => {
  if (!isConnected.value) return

  // 重置静音检测定时器
  resetSilenceTimer()

  const apiKey = apiKeyManager.getApiKey()

  isStarting.value = true
  statusMessage.value = '正在结束对话...'
  connectionError.value = ''

  try {
    if (apiKey && currentScene.value?.scene?.id) {
      try {
        console.log('停止 AIGC 对话，RoomId:', roomId.value)
        await apiService.stopVoiceChat(apiKey, currentScene.value.scene.id, roomId.value)
      } catch (err) {
        console.warn('停止语音对话时出现问题，但继续清理 RTC：', err)
      }
    }

    await safeCleanupRtc()

    isConnected.value = false
    currentScene.value = null
    statusMessage.value = '已结束 AI 导师对话。'
  } catch (err) {
    console.error('结束对话失败:', err)
    connectionError.value = err?.message || '结束对话时出现错误。'
  } finally {
    isStarting.value = false
  }
}

// 屏幕共享能力检测
const checkScreenShareSupport = () => {
  if (!navigator.mediaDevices) {
    return { supported: false, reason: '浏览器不支持媒体设备' }
  }
  if (!navigator.mediaDevices.getDisplayMedia) {
    return { supported: false, reason: '浏览器不支持屏幕共享' }
  }
  return { supported: true }
}

// 启动屏幕共享
const startScreenShare = async () => {
  const support = checkScreenShareSupport()
  if (!support.supported) {
    throw new Error(support.reason)
  }

  if (!rtcEngine.value) {
    throw new Error('RTC 引擎未初始化')
  }

  // 设置编码参数
  await rtcEngine.value.setScreenEncoderConfig({
    width: 1920,
    height: 1080,
    frameRate: 15,
    bitrate: 2000
  })

  // 发布屏幕视频流并启动采集
  await rtcEngine.value.publishScreen(MediaType.VIDEO)
  await rtcEngine.value.startScreenCapture({
    enableAudio: false
  })

  isScreenSharing.value = true
}

// 停止屏幕共享
const stopScreenShare = async () => {
  if (!rtcEngine.value || !isScreenSharing.value) return

  try {
    await rtcEngine.value.stopScreenCapture()
  } catch {}

  try {
    await rtcEngine.value.unpublishScreen(MediaType.VIDEO)
  } catch {}

  isScreenSharing.value = false
}

// 安全清理 RTC
const safeCleanupRtc = async () => {
  if (!rtcEngine.value) return

  try {
    if (isScreenSharing.value) {
      await stopScreenShare()
    }
  } catch {}

  try {
    await rtcEngine.value.stopAudioCapture?.()
  } catch {}

  try {
    await rtcEngine.value.leaveRoom()
  } catch {}

  try {
    rtcEngine.value.destroy()
  } catch {}

  rtcEngine.value = null
  isScreenSharing.value = false
}

onBeforeUnmount(async () => {
  // 移除页面关闭监听器
  window.removeEventListener('pagehide', handlePageHide)
  // 重置静音检测定时器
  resetSilenceTimer()

  if (isConnected.value) {
    await stopConversation()
  } else {
    await safeCleanupRtc()
  }
})
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 40px 24px 80px;
  box-sizing: border-box;
  background: #f5f7fb;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI',
    'PingFang SC', 'Microsoft YaHei', sans-serif;
  color: #111827;
}

.page-header h1 {
  margin: 0 0 8px;
  font-size: 28px;
}

.page-header p {
  margin: 0 0 24px;
  color: #4b5563;
}

.page-main {
  max-width: 960px;
}

.card {
  padding: 24px 24px 20px;
  border-radius: 12px;
  background: #ffffff;
  box-shadow: 0 6px 24px rgba(15, 23, 42, 0.08);
  margin-bottom: 24px;
}

.section-title {
  margin: 0 0 16px;
  font-size: 18px;
}

.field-label {
  display: block;
  margin-bottom: 6px;
  font-size: 14px;
  color: #374151;
}

.input {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid #d1d5db;
  font-size: 14px;
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.input:focus {
  border-color: #2563eb;
  box-shadow: 0 0 0 1px rgba(37, 99, 235, 0.15);
}

.button-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 14px;
}

.btn {
  border: none;
  border-radius: 999px;
  padding: 8px 18px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn.large {
  padding: 10px 22px;
  font-size: 15px;
}

.btn.primary {
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  color: #ffffff;
}

.btn.primary:disabled {
  background: #9ca3af;
  cursor: not-allowed;
}

.btn.ghost {
  background: transparent;
  color: #4b5563;
  border: 1px solid #d1d5db;
}

.btn.ghost:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.status {
  margin-top: 10px;
  font-size: 13px;
}

.status-ok {
  color: #059669;
}

.status-error {
  color: #b91c1c;
}

.status-block {
  padding: 12px 14px;
  border-radius: 10px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
}

.status-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  font-size: 14px;
}

.status-row:last-child {
  margin-bottom: 0;
}

.status-label {
  color: #4b5563;
  min-width: 80px;
}

.status-value {
  color: #111827;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
}

.pill-on {
  background: #ecfdf3;
  color: #166534;
}

.pill-off {
  background: #f3f4f6;
  color: #4b5563;
}

.help-text {
  font-size: 13px;
  color: #6b7280;
  margin-bottom: 14px;
}

.small-note {
  font-size: 13px;
}

.note-list {
  margin: 0;
  padding-left: 18px;
  color: #4b5563;
}

.note-list li {
  margin-bottom: 4px;
}

.top-space {
  margin-top: 12px;
}

/* 静音警告样式 */
.silence-warning {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  margin-top: 14px;
  border-radius: 10px;
  background: linear-gradient(135deg, #fef3c7, #fde68a);
  border: 1px solid #f59e0b;
  color: #92400e;
  font-size: 14px;
  animation: pulse 1.5s ease-in-out infinite;
}

.silence-warning .warning-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #f59e0b;
  color: #ffffff;
  font-weight: bold;
  font-size: 14px;
  flex-shrink: 0;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.7;
  }
}

@media (max-width: 640px) {
  .page {
    padding: 24px 16px 60px;
  }

  .card {
    padding: 18px 16px 16px;
  }

  .page-header h1 {
    font-size: 22px;
  }
}
</style>

