export type TelegramUser = {
  id: number
  is_bot?: boolean
  first_name?: string
  last_name?: string
  username?: string
  language_code?: string
}

export type TelegramChat = {
  id: number
  type: 'private' | 'group' | 'supergroup' | 'channel'
  title?: string
  username?: string
}

export type TelegramVoice = {
  file_id: string
  file_unique_id: string
  duration: number
  mime_type?: string
  file_size?: number
}

export type TelegramMessage = {
  message_id: number
  from?: TelegramUser
  chat: TelegramChat
  date: number
  text?: string
  voice?: TelegramVoice
  caption?: string
}

export type TelegramCallbackQuery = {
  id: string
  from: TelegramUser
  message?: TelegramMessage
  data?: string
  chat_instance?: string
}

export type TelegramUpdate = {
  update_id: number
  message?: TelegramMessage
  edited_message?: TelegramMessage
  callback_query?: TelegramCallbackQuery
  channel_post?: unknown
  my_chat_member?: unknown
}

export type TelegramInlineKeyboardButton = {
  text: string
  callback_data?: string
  url?: string
}

export type TelegramReplyMarkup = {
  inline_keyboard: TelegramInlineKeyboardButton[][]
}

export type ListedContextItem = {
  index: number
  kind: 'ped' | 'task' | 'work'
  id: string
  label: string
  clientName?: string
  date?: string
}
