import {
  getPlanCopyVariables,
  type Translator,
} from "@/lib/billing/plan-catalog"

export type FaqItem = {
  question: string
  answer: string
}

export function getLandingFaqItems(t: Translator): FaqItem[] {
  const planVars = getPlanCopyVariables(t)

  return [
    {
      question: t("landing.faqFreeQuestion"),
      answer: t("landing.faqFreeAnswer", planVars),
    },
    {
      question: t("landing.faqSignInQuestion"),
      answer: t("landing.faqSignInAnswer"),
    },
    {
      question: t("landing.faqBillingQuestion"),
      answer: t("landing.faqBillingAnswer", planVars),
    },
  ]
}

export function getFullFaqItems(t: Translator): FaqItem[] {
  const planVars = getPlanCopyVariables(t)
  const keys = [
    "what",
    "free",
    "billing",
    "platforms",
    "reliability",
    "languages",
  ] as const

  return keys.map((key) => ({
    question: t(`faq.items.${key}.question`),
    answer: t(`faq.items.${key}.answer`, planVars),
  }))
}
