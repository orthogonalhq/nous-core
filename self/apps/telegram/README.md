# Nous Telegram Bridge

Relays investor messages to Nous via Telegram Bot API.

## Setup

1. Create a Telegram bot via [@BotFather](https://t.me/BotFather) and get your bot token.
2. Set environment variables:
   ```
   TELEGRAM_BOT_TOKEN=your_bot_token_here
   NOUS_TRPC_URL=http://localhost:3000/api/trpc  # optional, this is the default
   ```
3. Start the Nous web app: `pnpm dev:web`
4. Start the bridge: `pnpm --filter @nous/telegram dev`

## Voice Notes

Voice note transcription is stubbed. To enable Whisper transcription:
- Add `OPENAI_API_KEY` to your environment
- Implement `transcribeVoice()` in `src/index.ts` using the OpenAI Audio API

## Commands

- `/start` — Welcome message
- `/clear` — Clear session history

## Production

For demo sessions: run on a server or locally with `pnpm --filter @nous/telegram start`.
