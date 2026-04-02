import { NextRequest, NextResponse } from 'next/server'

/**
 * Image proxy API route to bypass CORS restrictions when fetching
 * external images for html-to-image export functionality.
 * 
 * Usage: /api/image-proxy?url=<encoded-image-url>
 */
export async function GET(request: NextRequest) {
    const url = request.nextUrl.searchParams.get('url')

    if (!url) {
        return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 })
    }

    try {
        // Validate URL is from allowed domains
        const parsedUrl = new URL(url)
        const allowedHosts = [
            'img.youtube.com',
            'i.ytimg.com',
            'archive.biliimg.com',
            'i0.hdslb.com',
            'i1.hdslb.com',
            'i2.hdslb.com',
            'p16-sign-sg.tiktokcdn.com',
            'p16-sign-va.tiktokcdn.com',
        ]

        if (!allowedHosts.includes(parsedUrl.hostname)) {
            return NextResponse.json({ error: 'Domain not allowed' }, { status: 403 })
        }

        // Fetch the image
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; VibeDigest/1.0)',
            },
        })

        if (!response.ok) {
            return NextResponse.json({ error: `Failed to fetch image: ${response.status}` }, { status: response.status })
        }

        const contentType = response.headers.get('content-type') || 'image/jpeg'
        const buffer = await response.arrayBuffer()

        return new NextResponse(buffer, {
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=86400', // Cache for 1 day
            },
        })
    } catch (error) {
        console.error('[Image Proxy] Error:', error)
        return NextResponse.json({ error: 'Failed to proxy image' }, { status: 500 })
    }
}
