import "server-only"

import { getCompleteMessages } from "@/lib/i18n-messages"
import {
  createTranslator as createTranslatorFromMessages,
  type Locale,
  type Messages,
} from "@/lib/i18n"

export function getMessages(locale: Locale): Messages {
  return getCompleteMessages(locale)
}

export function createTranslator(locale: Locale) {
  return createTranslatorFromMessages(getMessages(locale))
}
