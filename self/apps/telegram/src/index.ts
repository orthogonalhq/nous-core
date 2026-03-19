/**
 * Nous Telegram Investor Bridge
 *
 * Relays investor messages to Nous and returns responses via Telegram.
 * Configure with environment variables:
 *   TELEGRAM_BOT_TOKEN  — Telegram bot token from @BotFather
 *   NOUS_TRPC_URL       — Nous tRPC endpoint (default: http://localhost:3000/api/trpc)
 *
 * Voice notes are downloaded and transcription is stubbed (returns filename).
 * Wire to OpenAI Whisper API by implementing transcribeVoice() below.
 */

import { Bot, type Context } from 'grammy'

const BOT_TOKEN = process.env['TELEGRAM_BOT_TOKEN']
const NOUS_TRPC_URL = process.env['NOUS_TRPC_URL'] ?? 'http://localhost:3000/api/trpc'

if (!BOT_TOKEN) {
  console.error('[telegram] TELEGRAM_BOT_TOKEN not set. Set it in your environment and restart.')
  process.exit(1)
}

const bot = new Bot(BOT_TOKEN)

// In-memory session: map from Telegram chat ID to conversation history
const sessions = new Map<number, { role: string; content: string }[]>()

function getSession(chatId: number) {
  if (!sessions.has(chatId)) sessions.set(chatId, [])
  return sessions.get(chatId)!
}

async function sendToNous(message: string): Promise<string> {
  try {
    const response = await fetch(`${NOUS_TRPC_URL}/chat.sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ json: { message } }),
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = await response.json() as { result?: { data?: { json?: { response?: string } } } }
    return data?.result?.data?.json?.response ?? '[no response]'
  } catch (err) {
    console.warn('[telegram] tRPC call failed, using fallback:', err)
    return `[Demo mode] Nous received: "${message}". Start the Nous web app (pnpm dev:web) to enable live responses.`
  }
}

// Stub: wire to OpenAI Whisper or another STT provider
async function transcribeVoice(fileId: string): Promise<string> {
  console.log(`[telegram] Voice note received (fileId: ${fileId}) — transcription stubbed`)
  return `[Voice note — transcription not yet configured. File ID: ${fileId}]`
}

// Text message handler
bot.on('message:text', async (ctx: Context) => {
  const chatId = ctx.chat!.id
  const text = ctx.message!.text!
  const session = getSession(chatId)
  console.log(`[telegram] Message from ${ctx.from?.username ?? chatId}: ${text}`)

  await ctx.replyWithChatAction('typing')

  session.push({ role: 'user', content: text })
  const response = await sendToNous(text)
  session.push({ role: 'assistant', content: response })

  await ctx.reply(response, { parse_mode: undefined })
})

// Voice note handler
bot.on('message:voice', async (ctx: Context) => {
  const fileId = ctx.message!.voice!.file_id
  console.log(`[telegram] Voice note from ${ctx.from?.username ?? ctx.chat!.id}`)
  await ctx.replyWithChatAction('typing')

  const transcript = await transcribeVoice(fileId)
  const response = await sendToNous(transcript)
  await ctx.reply(`🎤 *Transcription:* ${transcript}\n\n${response}`, { parse_mode: 'Markdown' })
})

// /start command
bot.command('start', async (ctx: Context) => {
  await ctx.reply(
    'Hello! I\'m Nous. Send me a message or voice note and I\'ll respond.\n\n' +
    'This bridge connects you directly to the Nous AI system.'
  )
})

// /clear command — clears session history
bot.command('clear', async (ctx: Context) => {
  sessions.delete(ctx.chat!.id)
  await ctx.reply('Session cleared.')
})

console.log('[telegram] Starting Nous Telegram bridge...')
console.log(`[telegram] Nous tRPC endpoint: ${NOUS_TRPC_URL}`)

bot.start({
  onStart: (info) => console.log(`[telegram] Bot @${info.username} is running`),
})
