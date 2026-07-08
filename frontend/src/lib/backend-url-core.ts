type BackendUrlConfig = {
  nodeEnv: string;
  backendApiUrl: string;
  backendOriginUrl?: string;
};

function hostnameOf(value: string): string {
  return new URL(value).hostname.toLowerCase();
}

export function resolveServerBackendUrl(config: BackendUrlConfig): string {
  const originUrl = config.backendOriginUrl?.trim();
  if (originUrl) {
    return originUrl;
  }

  const publicApiHost = hostnameOf(config.backendApiUrl);
  if (config.nodeEnv === "production" && publicApiHost === "api.vibedigest.io") {
    throw new Error(
      "BACKEND_ORIGIN_URL must be set in production when BACKEND_API_URL uses the public Cloudflare API domain."
    );
  }

  return config.backendApiUrl;
}
