export type PodcastTopic = "agents" | "ai-coding" | "product" | "startups" | "research"

export type PodcastSource = {
  id: string
  name: string
  channelUrl: string
  avatarUrl?: string
  aliases: string[]
  topics: PodcastTopic[]
  featured?: boolean
  order?: number
}

export const PODCAST_SOURCES: PodcastSource[] = [
  {
    id: "latent-space",
    name: "Latent Space",
    channelUrl: "https://www.youtube.com/@LatentSpacePod",
    avatarUrl: "https://yt3.googleusercontent.com/pSTHcffCXEverYEPdjM0iIRPH-IUT4d2biIMZ_Z7bhyf6sME-laFer9vEfpFbM5tqFYJV-UsLQ=s900-c-k-c0x00ffffff-no-rj",
    aliases: ["latent space", "latentspacepod"],
    topics: ["agents", "ai-coding", "research"],
    featured: true,
  },
  {
    id: "lennys-podcast",
    name: "Lenny's Podcast",
    channelUrl: "https://www.youtube.com/@LennysPodcast",
    avatarUrl: "https://yt3.googleusercontent.com/Wk7-4UW17JqDXgVWDiE7s1gJxDkt_UwNa2oNw8OYRwc9deiCv2V2fFAdNgByDi0K9AAF0YMj=s900-c-k-c0x00ffffff-no-rj",
    aliases: ["lenny's podcast", "lennys podcast", "lenny rachitsky"],
    topics: ["product", "startups"],
    featured: true,
  },
  {
    id: "a16z",
    name: "a16z",
    channelUrl: "https://www.youtube.com/@a16z",
    avatarUrl: "https://yt3.googleusercontent.com/hkiO7UAtALrbqOcewo4CIrbd0j8XDeWttKkdtihfX1emeV4iUMwjIe1KKn4zd6wT2OOwANDnIA=s900-c-k-c0x00ffffff-no-rj",
    aliases: ["a16z", "andreessen horowitz"],
    topics: ["agents", "product", "startups"],
    featured: true,
  },
  {
    id: "every",
    name: "Every",
    channelUrl: "https://www.youtube.com/@EveryInc",
    avatarUrl: "https://yt3.googleusercontent.com/n6p0RudkPKoaFsxiZfunvI5MpqS443Qfbf2E4mmAy1k0etF4M7etYyJAJ_RMknfit6Tnxx4Du4g=s900-c-k-c0x00ffffff-no-rj",
    aliases: ["every", "everyinc"],
    topics: ["ai-coding", "product", "startups"],
    featured: true,
  },
  {
    id: "no-priors",
    name: "No Priors",
    channelUrl: "https://www.youtube.com/@NoPriorsPodcast",
    avatarUrl: "https://yt3.googleusercontent.com/HQXIpkLms_iVMi_Ob5Cie3PNcZ3smOT7HeNLIAWvBO-lZMdiax2N5LH1blWMxUtMrJCcXyNZ=s900-c-k-c0x00ffffff-no-rj",
    aliases: ["no priors", "no priors podcast"],
    topics: ["agents", "research", "startups"],
    featured: true,
  },
  {
    id: "y-combinator",
    name: "Y Combinator",
    channelUrl: "https://www.youtube.com/@ycombinator",
    avatarUrl: "https://yt3.googleusercontent.com/dGyATx87Fp_s1nZvnupUFSnMqbAPZ6nqRby9Esk1m6YE41iBq-9Z8iGoIgHTCT9SiDBUpP2V=s900-c-k-c0x00ffffff-no-rj",
    aliases: ["y combinator", "ycombinator"],
    topics: ["product", "startups"],
  },
  {
    id: "peter-yang",
    name: "Peter Yang",
    channelUrl: "https://www.youtube.com/@PeterYangYT",
    avatarUrl: "https://yt3.googleusercontent.com/ytc/AIdro_k0xbR9-CBYMh3YOZJnMQr00qwnbA_aAChW3z0I8lNcGRE=s900-c-k-c0x00ffffff-no-rj",
    aliases: ["peter yang", "peteryangyt"],
    topics: ["product", "ai-coding"],
  },
  {
    id: "mad-podcast",
    name: "The MAD Podcast",
    channelUrl: "https://www.youtube.com/@DataDrivenNYC",
    avatarUrl: "https://yt3.googleusercontent.com/zELsyYmenYTQanNFH9Vti3fuVN2Dkky0AGvVlMLUeTvssEiWIdIKKmwNxtrgmAKWGeN4F9RnNIc=s900-c-k-c0x00ffffff-no-rj",
    aliases: ["the mad podcast", "data driven nyc", "datadrivennyc", "matt turck"],
    topics: ["startups", "research"],
  },
  {
    id: "lex-fridman",
    name: "Lex Fridman",
    channelUrl: "https://www.youtube.com/@lexfridman",
    avatarUrl: "https://yt3.googleusercontent.com/ytc/AIdro_ljfMy9kUR1PH9VRf-XsTsPqFMgORC_zodOQVEAm4hx36lC=s900-c-k-c0x00ffffff-no-rj",
    aliases: ["lex fridman", "lexfridman"],
    topics: ["research"],
  },
  {
    id: "south-park-commons",
    name: "South Park Commons",
    channelUrl: "https://www.youtube.com/@southparkcommons",
    avatarUrl: "https://yt3.googleusercontent.com/rTHi9Q-VulPPgZLDdamX57N_db9TognfYKHMG9liMbpFmSNAA5hTm7nyU0QLXgfU3E50LurN3wE=s900-c-k-c0x00ffffff-no-rj",
    aliases: ["south park commons", "southparkcommons"],
    topics: ["research", "startups"],
  },
  {
    id: "stanford-gsb",
    name: "Stanford GSB",
    channelUrl: "https://www.youtube.com/@stanfordgsb",
    avatarUrl: "https://yt3.googleusercontent.com/ytc/AIdro_lWoHJNSE1UPPiFdCG4_aQZ1apKXrKI7nZ_sFlKwhNwRl0=s900-c-k-c0x00ffffff-no-rj",
    aliases: ["stanford gsb", "stanford graduate school of business", "stanfordgsb"],
    topics: ["product", "startups", "research"],
  },
  {
    id: "google-developers",
    name: "Google for Developers",
    channelUrl: "https://www.youtube.com/@GoogleDevelopers",
    avatarUrl: "https://yt3.googleusercontent.com/WZ_63J_-745xyW_DGxGi3VUyTZAe0Jvhw2ZCg7fdz-tv9esTbNPZTFR9X79QzA0ArIrMjYJCDA=s900-c-k-c0x00ffffff-no-rj",
    aliases: ["google for developers", "google developers", "googledevelopers"],
    topics: ["ai-coding", "agents"],
  },
  {
    id: "tbpn",
    name: "TBPN",
    channelUrl: "https://www.youtube.com/@TBPNLive",
    avatarUrl: "https://yt3.googleusercontent.com/1QdlbXwJRXYY6leF-ULTE8ahNmTYEgezebSqVDZqI2DLGSkRCCcvcUtdkAhOj5mLB8C0AK_J=s900-c-k-c0x00ffffff-no-rj",
    aliases: ["tbpn", "tbpnlive"],
    topics: ["startups", "product"],
  },
  {
    id: "pragmatic-engineer",
    name: "The Pragmatic Engineer",
    channelUrl: "https://www.youtube.com/@ThePragmaticEngineer",
    avatarUrl: "https://yt3.googleusercontent.com/ytc/AIdro_mzrMszjXcIm7EdsK_QfN9Pk7YXbiXj9fihf86JaB8=s0",
    aliases: ["the pragmatic engineer", "pragmatic engineer", "michael paul"],
    topics: ["ai-coding", "product"],
  },
  {
    id: "andrej-karpathy",
    name: "Andrej Karpathy",
    channelUrl: "https://www.youtube.com/@AndrejKarpathy",
    avatarUrl: "https://yt3.googleusercontent.com/ytc/AIdro_nDvyq2NoPL626bk1IbxQ94SfQsD-B0qgZchghtQNkLWoEz=s900-c-k-c0x00ffffff-no-rj",
    aliases: ["andrej karpathy", "karpathy"],
    topics: ["ai-coding", "research"],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    channelUrl: "https://www.youtube.com/@anthropic-ai",
    avatarUrl: "https://yt3.googleusercontent.com/ux-GXUpB4PkI-qXVOpj9gGEiCkytT0Q78ka4srlxOm_Y3m1gEh5qy8Vu6vTjGSDztMT0NybtC7I=s900-c-k-c0x00ffffff-no-rj",
    aliases: ["anthropic", "anthropic-ai"],
    topics: ["agents", "research", "ai-coding"],
  },
  {
    id: "brett-malinowski",
    name: "Brett Malinowski",
    channelUrl: "https://www.youtube.com/@TheBrettWay",
    avatarUrl: "https://yt3.googleusercontent.com/jVlCb_H_mcYd9UkwcSLvoTDG3SRTobvGUQ22PLtogxFGJpbbXOVXhdzY9wULJe6hVLFbfdu2vQ=s0",
    aliases: ["brett malinowski", "thebrettway"],
    topics: ["agents", "startups"],
  },
  {
    id: "google-deepmind",
    name: "Google DeepMind",
    channelUrl: "https://www.youtube.com/@googledeepmind",
    avatarUrl: "https://yt3.googleusercontent.com/xofhdRNoyqgAB_YpJgAQeasGtE6gTEXpR2v1vyMmtqlRCmoEUIsTGJcavUORLhhKQk3b9UeUFw=s900-c-k-c0x00ffffff-no-rj",
    aliases: ["google deepmind", "googledeepmind", "deepmind"],
    topics: ["research", "agents"],
  },
  {
    id: "mckay-wrigley",
    name: "Mckay Wrigley",
    channelUrl: "https://www.youtube.com/@realmckaywrigley",
    avatarUrl: "https://yt3.googleusercontent.com/ytc/AIdro_m114mcpiz4WMxjxkci1z8z3XXCP64yYoL2Z4wsjM2bNdWO=s0",
    aliases: ["mckay wrigley", "realmckaywrigley"],
    topics: ["ai-coding", "agents"],
  },
  {
    id: "ai-daily-brief",
    name: "The AI Daily Brief",
    channelUrl: "https://www.youtube.com/@TheAIDailyBrief",
    avatarUrl: "https://yt3.googleusercontent.com/kNdRN_Aa_xXvA1Y2KxcephehAzzbvyYbnm2xGg7MjUZ11yHpVah2GqsprxIXlA57uhdl97yF=s900-c-k-c0x00ffffff-no-rj",
    aliases: ["the ai daily brief", "ai daily brief", "theaidailybrief"],
    topics: ["research", "startups"],
  },
  {
    id: "tiago-forte",
    name: "Tiago Forte",
    channelUrl: "https://www.youtube.com/@TiagoForte",
    avatarUrl: "https://yt3.googleusercontent.com/CqC4SrpXMCHA9b39JDtbXxefJ0TlHmaxFpAxSKqDCBVIudLl50gtlYA5fmIIGFlc4mjE1-uw6w=s900-c-k-c0x00ffffff-no-rj",
    aliases: ["tiago forte", "tiagoforte"],
    topics: ["product", "ai-coding"],
  },
]

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()

const normalizeSourceId = (value: string) => value
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "")

export function findPodcastSource(author?: string, videoUrl?: string): PodcastSource | null {
  const haystack = normalize(`${author ?? ""} ${videoUrl ?? ""}`)
  if (!haystack) return null

  return PODCAST_SOURCES.find((source) =>
    [source.name, source.id, ...source.aliases].some((alias) => {
      const needle = normalize(alias)
      return needle.length > 2 && haystack.includes(needle)
    })
  ) ?? null
}

export function resolvePodcastSourceId({
  sourceSlug,
  author,
  videoUrl,
}: {
  sourceSlug?: string | null
  author?: string | null
  videoUrl?: string | null
}) {
  const explicitSourceId = normalizeSourceId(sourceSlug || "")
  if (explicitSourceId) return explicitSourceId

  const catalogSource = findPodcastSource(author || undefined, videoUrl || undefined)
  if (catalogSource) return catalogSource.id

  const fallbackName = author?.trim() || "VibeDigest"
  return normalizeSourceId(fallbackName) || "unknown"
}
