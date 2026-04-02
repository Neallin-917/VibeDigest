import { CreditCard, History, MessageSquare, Settings } from "lucide-react"

export const NAV_ITEMS = [
  { key: "nav.chat", href: "/chat", icon: MessageSquare },
  { key: "nav.history", href: "/history", icon: History },
  { key: "nav.pricing", href: "/settings/pricing", icon: CreditCard },
  { key: "nav.settings", href: "/settings", icon: Settings },
] as const


