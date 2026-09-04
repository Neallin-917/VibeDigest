import { describe, expect, it } from "vitest"

import { createTranslator, type Locale } from "@/lib/i18n"
import { getCompleteMessages } from "@/lib/i18n-messages"
import { getFullFaqItems, getLandingFaqItems } from "@/lib/billing/faq-content"
import {
  customerPlanCatalog,
  getCustomerPlanDisplay,
} from "@/lib/billing/plan-catalog"
import {
  buildFaqPageSchema,
  buildSoftwareApplicationSchema,
  serializeJsonLd,
} from "@/lib/billing/structured-data"

const locales: Locale[] = ["en", "zh"]
const stalePromise = /\$4\.99|15.?min|15\s*分钟|15分|unlimited|无限|無制限|notion|pdf/i

describe("customer plan catalog", () => {
  it("keeps the implemented price, quota, and top-up facts in one catalog", () => {
    expect(customerPlanCatalog).toMatchObject({
      currency: "USD",
      plans: {
        basic: { price: 0, includedVideosPerMonth: 3 },
        pro: {
          includedVideosPerMonth: 100,
          billingOptions: {
            monthly: { planKey: "pro_monthly", price: 9.9 },
            annual: { planKey: "pro_annual", price: 99 },
          },
        },
      },
      topUps: {
        videoCredits: {
          planKey: "credit_pack",
          price: 5,
          credits: 50,
          expires: false,
        },
      },
    })
  })

  it.each(locales)("renders catalog-backed facts without stale promises in %s", (locale) => {
    const t = createTranslator(getCompleteMessages(locale))
    const display = getCustomerPlanDisplay(t)
    const copy = [
      ...display.basic.features,
      ...display.pro.features,
      ...display.topUp.features,
      ...getLandingFaqItems(t).flatMap((item) => [item.question, item.answer]),
      ...getFullFaqItems(t).flatMap((item) => [item.question, item.answer]),
    ].join(" ")

    expect(display.basic.priceLabel).toBe("$0")
    expect(display.pro.monthlyPriceLabel).toBe("$9.90")
    expect(display.pro.annualPriceLabel).toBe("$99")
    expect(display.pro.annualEffectiveMonthlyLabel).toBe("$8.25")
    expect(display.topUp.priceLabel).toBe("$5.00")
    expect(copy).not.toMatch(stalePromise)
    expect(copy).not.toMatch(/pricing\.|faq\.|landing\./)
  })

  it.each(locales)("builds Offer and FAQ schemas from the same %s facts", (locale) => {
    const t = createTranslator(getCompleteMessages(locale))
    const offers = buildSoftwareApplicationSchema(t).offers
    const faqItems = getFullFaqItems(t)
    const faqSchema = buildFaqPageSchema(faqItems)

    expect(offers.map((offer) => offer.price)).toEqual([
      "0.00",
      "9.90",
      "99.00",
      "5.00",
    ])
    expect(offers.every((offer) => offer.priceCurrency === "USD")).toBe(true)
    expect(faqSchema.mainEntity.map((entry) => entry.name)).toEqual(
      faqItems.map((item) => item.question),
    )
    expect(
      faqSchema.mainEntity.map((entry) => entry.acceptedAnswer.text),
    ).toEqual(faqItems.map((item) => item.answer))
  })

  it("escapes less-than characters in JSON-LD", () => {
    expect(serializeJsonLd({ value: "</script>" })).toContain("\\u003c/script>")
  })
})
