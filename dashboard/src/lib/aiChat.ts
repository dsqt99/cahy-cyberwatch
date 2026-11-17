import { n8nFetch } from './supabase'
import { getN8nWebhookBaseSync } from './desktopBridge'

// ─── Types ──────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string | null
  tool_calls?: Record<string, unknown>[]
  tool_call_id?: string
}

export type StatusCallback = (status: string) => void

let currentSessionId = ''

export function getSessionId() {
  if (!currentSessionId) {
    currentSessionId = localStorage.getItem('chat_session_id') || ''
    if (!currentSessionId) {
      currentSessionId = crypto.randomUUID()
      localStorage.setItem('chat_session_id', currentSessionId)
    }
  }
  return currentSessionId
}

export function setSessionId(id: string) {
  currentSessionId = id
  localStorage.setItem('chat_session_id', id)
  return id
}

export function resetSessionId() {
  currentSessionId = crypto.randomUUID()
  localStorage.setItem('chat_session_id', currentSessionId)
  return currentSessionId
}

// ─── Main Chat Function ─────────────────────────────────────────────────

function resolveChatWebhookUrl(): string {
  if (import.meta.env.VITE_N8N_WEBHOOK_URL) {
    return import.meta.env.VITE_N8N_WEBHOOK_URL
  }
  const base = getN8nWebhookBaseSync()
  const normalizedBase = base.endsWith('/') ? base : `${base}/`
  return `${normalizedBase}chat/competitions`
}

export async function sendChatMessage(
  userMessages: ChatMessage[],
  onStream?: (chunk: string) => void,
  onStatus?: StatusCallback
): Promise<string> {
  onStatus?.('Đang gửi yêu cầu phân tích...')

  // Lấy nội dung tin nhắn cuối cùng của user
  const latestUserMessage = userMessages.filter(m => m.role === 'user').pop()
  const input = latestUserMessage?.content || ''

  try {
    const currentChannel = localStorage.getItem('current_channel') || 'ANTT'
    const sourceValue = (currentChannel === 'Phản Động' || currentChannel === 'Phản động') ? 'PhanDong' : 'ANTT'

    const response = await n8nFetch(resolveChatWebhookUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session_id: getSessionId(),
        input: input,
        source: sourceValue,
      }),
    })

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`)
    }

    if (!response.body) {
      throw new Error('Không nhận được luồng dữ liệu từ API.')
    }

    onStatus?.('Đang nhận luồng phản hồi...')

    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let done = false
    let finalContent = ''
    let buffer = ''

    while (!done) {
      const { value, done: readerDone } = await reader.read()
      done = readerDone
      if (value) {
        const chunk = decoder.decode(value, { stream: true })
        buffer += chunk

        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmedLine = line.trim()
          if (!trimmedLine) continue

          try {
            const parsed = JSON.parse(trimmedLine)
            if (parsed.type === 'item' && parsed.content) {
              const contentStr = String(parsed.content)

              // Kiểm tra xem chunk có phải là log tool call của n8n / LangChain không
              const trimmedContent = contentStr.trim()
              if (/^Calling\s+[a-zA-Z0-9_-]+/i.test(trimmedContent) || trimmedContent.startsWith('Calling ')) {
                const toolMatch = trimmedContent.match(/^Calling\s+([a-zA-Z0-9_-]+)/i)
                const toolName = toolMatch ? toolMatch[1] : ''
                onStatus?.(toolName ? `Đang truy vấn dữ liệu (${toolName})...` : 'Đang xử lý dữ liệu...')
                continue
              }

              finalContent += contentStr
              if (onStream) {
                onStream(contentStr)
              }
            }
          } catch (e) {
            // Bỏ qua lỗi parse của dòng không hợp lệ
          }
        }
      }
    }

    // Xử lý nốt phần buffer cuối cùng nếu có
    if (buffer.trim()) {
      try {
        const parsed = JSON.parse(buffer.trim())
        if (parsed.type === 'item' && parsed.content) {
          const contentStr = String(parsed.content)
          const trimmedContent = contentStr.trim()
          if (!(/^Calling\s+[a-zA-Z0-9_-]+/i.test(trimmedContent) || trimmedContent.startsWith('Calling '))) {
            finalContent += contentStr
            if (onStream) {
              onStream(contentStr)
            }
          }
        }
      } catch (e) {
        // Bỏ qua
      }
    }

    // Làm sạch finalContent đề phòng log tool call dính vào đầu phản hồi
    finalContent = finalContent
      .replace(/^Calling\s+[a-zA-Z0-9_-]+\s+with\s+input:\s*\{[\s\S]*?\}/gi, '')
      .replace(/^Calling\s+[^\n]+\n?/gi, '')
      .trim()

    onStatus?.('')
    return finalContent
  } catch (error) {
    onStatus?.('')
    throw new Error(`Lỗi kết nối API: ${error instanceof Error ? error.message : String(error)}`)
  }
}
