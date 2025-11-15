// 简化版 API 服务，仅保留示例所需能力

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.upath.cn'
const API_KEY_STORAGE_KEY = 'upath_api_key'

export const apiKeyManager = {
  getApiKey() {
    try {
      return localStorage.getItem(API_KEY_STORAGE_KEY)
    } catch {
      return null
    }
  },
  setApiKey(apiKey) {
    try {
      localStorage.setItem(API_KEY_STORAGE_KEY, apiKey)
    } catch {
      // 忽略本地存储错误
    }
  },
  clearApiKey() {
    try {
      localStorage.removeItem(API_KEY_STORAGE_KEY)
    } catch {
      // 忽略本地存储错误
    }
  }
}

function buildHeaders(apiKey) {
  const headers = {
    'Content-Type': 'application/json'
  }
  if (apiKey) {
    headers['X-API-Key'] = apiKey
  }
  return headers
}

// 基础的错误检查：解析 JSON 并在非 2xx 时抛出异常
async function handleResponse(response) {
  const data = await response.json().catch(() => ({}))
  if (!response.ok || data.ResponseMetadata?.Error) {
    const msg =
      data.ResponseMetadata?.Error?.Message ||
      data.message ||
      data.error ||
      `HTTP error ${response.status}`
    const error = new Error(msg)
    error.response = data
    throw error
  }
  return data
}

export const apiService = {
  // 通过场景名称获取场景与 RTC 配置
  async getScenes(apiKey, sceneName) {
    const body = {}
    if (sceneName) {
      body.scene_name = sceneName
    }

    const resp = await fetch(`${API_BASE_URL}/api/aigc/getScenes`, {
      method: 'POST',
      headers: buildHeaders(apiKey),
      body: JSON.stringify(body)
    })

    return handleResponse(resp)
  },

  // 验证 API-Key 是否可用：只要 getScenes 能返回正常结果即可
  async validateApiKey(apiKey) {
    try {
      await this.getScenes(apiKey)
      return { valid: true }
    } catch (err) {
      return {
        valid: false,
        message: err?.message || 'API-Key 验证失败'
      }
    }
  },

  // 启动语音对话
  async startVoiceChat(apiKey, sceneId) {
    const resp = await fetch(
      `${API_BASE_URL}/api/aigc/proxy?Action=StartVoiceChat`,
      {
        method: 'POST',
        headers: buildHeaders(apiKey),
        body: JSON.stringify({ SceneID: sceneId })
      }
    )
    return handleResponse(resp)
  },

  // 停止语音对话
  async stopVoiceChat(apiKey, sceneId) {
    const resp = await fetch(
      `${API_BASE_URL}/api/aigc/proxy?Action=StopVoiceChat`,
      {
        method: 'POST',
        headers: buildHeaders(apiKey),
        body: JSON.stringify({ SceneID: sceneId })
      }
    )
    return handleResponse(resp)
  }
}

