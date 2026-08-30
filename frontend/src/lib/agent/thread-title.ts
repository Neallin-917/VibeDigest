const THREAD_TITLE_MAX_LENGTH = 48;
const URL_PATTERN = /https?:\/\/[^\s]+/gi;

function truncateThreadTitle(value: string) {
    const characters = Array.from(value);
    if (characters.length <= THREAD_TITLE_MAX_LENGTH) return value;
    return `${characters.slice(0, THREAD_TITLE_MAX_LENGTH - 1).join('')}…`;
}

function cleanThreadTitle(value: string) {
    return truncateThreadTitle(
        value
            .replace(/^[\s#>*_`"'“”‘’]+|[\s#>*_`"'“”‘’]+$/g, '')
            .replace(/\s+/g, ' ')
            .trim()
    );
}

function getVideoUrlTitle(rawUrl: string) {
    try {
        const url = new URL(rawUrl);
        const hostname = url.hostname.replace(/^www\./, '').toLowerCase();
        const segments = url.pathname.split('/').filter(Boolean);
        let platform = hostname;
        let identifier = segments.at(-1) ?? '';

        if (hostname === 'youtu.be' || hostname.endsWith('youtube.com')) {
            platform = 'YouTube';
            identifier = hostname === 'youtu.be'
                ? (segments[0] ?? '')
                : (url.searchParams.get('v') ?? segments.at(-1) ?? '');
        } else if (hostname.endsWith('bilibili.com') || hostname === 'b23.tv') {
            platform = 'Bilibili';
            identifier = segments.find((segment) => /^(BV|av)/i.test(segment))
                ?? segments.at(-1)
                ?? '';
        } else if (hostname === 'x.com' || hostname.endsWith('twitter.com')) {
            platform = 'X';
            const statusIndex = segments.indexOf('status');
            identifier = statusIndex >= 0 ? (segments[statusIndex + 1] ?? '') : (segments.at(-1) ?? '');
        } else if (hostname.endsWith('tiktok.com')) {
            platform = 'TikTok';
            const videoIndex = segments.indexOf('video');
            identifier = videoIndex >= 0 ? (segments[videoIndex + 1] ?? '') : (segments.at(-1) ?? '');
        } else if (hostname.endsWith('instagram.com')) {
            platform = 'Instagram';
        } else if (hostname.endsWith('vimeo.com')) {
            platform = 'Vimeo';
        }

        const decodedIdentifier = identifier
            ? decodeURIComponent(identifier).replace(/[?&#].*$/, '')
            : '';

        return cleanThreadTitle(
            decodedIdentifier && decodedIdentifier !== platform
                ? `${platform} · ${decodedIdentifier}`
                : platform
        );
    } catch {
        return '';
    }
}

export function deriveThreadTitle(messageText: string, videoUrl?: string) {
    const textWithoutUrls = messageText.replace(URL_PATTERN, ' ');
    const descriptiveText = cleanThreadTitle(textWithoutUrls);
    if (descriptiveText) return descriptiveText;

    const detectedUrl = videoUrl ?? messageText.match(URL_PATTERN)?.[0];
    const urlTitle = detectedUrl ? getVideoUrlTitle(detectedUrl) : '';
    return urlTitle || 'New Chat';
}
