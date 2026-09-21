import { GET as handleCallback } from '@/app/auth/callback/route'

export async function GET(request: Request, { params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params
    const url = new URL(request.url)
    url.searchParams.set('lang', lang)
    return handleCallback(new Request(url, request))
}
