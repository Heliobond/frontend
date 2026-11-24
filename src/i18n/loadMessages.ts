import type en from '../../messages/en.json'
import type { Locale } from './config'

export type Messages = typeof en

export async function loadMessages(locale: Locale): Promise<Messages> {
  return (await import(`../../messages/${locale}.json`)).default
}
