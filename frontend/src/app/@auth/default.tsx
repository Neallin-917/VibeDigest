// Next resolves the localized @auth slot through the app root during builds.
// Keep this fallback even though the login interceptor lives under [lang].
export default function Default() {
    return null
}
