import { expect, test } from "@playwright/test"

const path = "/tasks/local-demo-latent-space/From-Prediction-to-Simulation%3A-Teaching-AI-to-Shape-the-Future"
const origin = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || process.env.FRONTEND_URL || "https://vibedigest.io"
const from = "/en/topics/research?show=latent-space&q=AI&page=3#episode-local-demo-latent-space"
const suffix = `?${new URLSearchParams({ from, threadId: "29c0dcda-9ea7-4644-9aba-a2dd749ecf80" })}`

for (const userAgent of ["Mozilla/5.0", "Googlebot"]) {
    for (const lang of ["en", "zh"]) {
        test(`${userAgent} ${lang}: full SSR has a clean canonical and no redirect loop`, async ({ request }) => {
            const response = await request.get(`/${lang}${path}${suffix}`, { headers: { "user-agent": userAgent }, maxRedirects: 0 })
            expect(response.status()).toBe(200)
            const html = await response.text()
            expect(html.match(/<link rel="canonical"[^>]+>/g)).toEqual([
                `<link rel="canonical" href="${origin}/${lang}${path}"/>`,
            ])
            expect(html).toContain(`<meta property="og:url" content="${origin}/${lang}${path}"/>`)
            expect(html).toContain(`"@id":"${origin}/${lang}${path}"`)
            expect(html).toContain('<meta name="robots" content="index, follow"/>')
            expect(html).toContain('<h1')
            expect(html).not.toContain('http-equiv="refresh"')
            expect(html).not.toContain("NEXT_REDIRECT")
            expect(html).toContain('href="/en/topics/research?show=latent-space&amp;q=AI&amp;page=3#episode-local-demo-latent-space"')
        })
        test(`${userAgent} ${lang}: old and double-encoded slugs consolidate immediately`, async ({ request }) => {
            for (const variant of ["old-title.", path.split("/").at(-1)!.replace("%3A", "%253A")]) {
                const response = await request.get(`/${lang}/tasks/local-demo-latent-space/${variant}${suffix}`, { headers: { "user-agent": userAgent }, maxRedirects: 0 })
                const html = await response.text()
                const target = `/${lang}${path}${suffix}`
                // Next emits a 308 before streaming, or an immediate meta redirect
                // after streaming starts. Do not mistake an HTTP 200 shell for content.
                if (response.status() === 308) {
                    expect(response.headers().location).toBe(target)
                } else {
                    expect(response.status()).toBe(200)
                    expect(html).toContain(`http-equiv="refresh" content="0;url=${target.replaceAll("&", "&amp;")}"`)
                    expect(html).toContain(";308;")
                }
            }
        })
    }
}
