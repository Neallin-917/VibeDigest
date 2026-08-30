import {
  customerPlanCatalog,
  type Translator,
} from "@/lib/billing/plan-catalog"
import type { FaqItem } from "@/lib/billing/faq-content"

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c")
}

export function buildSoftwareApplicationSchema(t: Translator) {
  const { basic, pro } = customerPlanCatalog.plans
  const topUp = customerPlanCatalog.topUps.videoCredits
  const { monthly, annual } = pro.billingOptions

  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "VibeDigest",
    applicationCategory: "ProductivityApplication",
    applicationSubCategory: "AI Video Summarizer",
    operatingSystem: "Web",
    url: "https://vibedigest.io",
    offers: [
      {
        "@type": "Offer",
        name: t("pricing.schema.basic"),
        price: basic.price.toFixed(2),
        priceCurrency: customerPlanCatalog.currency,
      },
      {
        "@type": "Offer",
        name: t("pricing.schema.proMonthly"),
        price: monthly.price.toFixed(2),
        priceCurrency: customerPlanCatalog.currency,
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          price: monthly.price.toFixed(2),
          priceCurrency: customerPlanCatalog.currency,
          billingDuration: "P1M",
        },
      },
      {
        "@type": "Offer",
        name: t("pricing.schema.proAnnual"),
        price: annual.price.toFixed(2),
        priceCurrency: customerPlanCatalog.currency,
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          price: annual.price.toFixed(2),
          priceCurrency: customerPlanCatalog.currency,
          billingDuration: "P1Y",
        },
      },
      {
        "@type": "Offer",
        name: t("pricing.schema.topUp", { count: topUp.credits }),
        price: topUp.price.toFixed(2),
        priceCurrency: customerPlanCatalog.currency,
      },
    ],
    description: t("pricing.schema.description"),
  }
}

export function buildFaqPageSchema(items: FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  }
}
