import { CreditCard, Library, MessageSquare, Settings } from "lucide-react"

export const NAV_ITEMS = [
  { key: "nav.chat", href: "/chat", icon: MessageSquare },
  { key: "chat.community", href: "/explore", icon: Library },
  { key: "nav.pricing", href: "/settings/pricing", icon: CreditCard },
  { key: "nav.settings", href: "/settings", icon: Settings },
] as const

