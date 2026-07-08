import { env } from "@/env";
import { resolveServerBackendUrl } from "@/lib/backend-url-core";

export const PUBLIC_BACKEND_API_URL = env.BACKEND_API_URL;
export const SERVER_BACKEND_URL = resolveServerBackendUrl({
  nodeEnv: env.NODE_ENV,
  backendApiUrl: env.BACKEND_API_URL,
  backendOriginUrl: env.BACKEND_ORIGIN_URL,
});

/**
 * @deprecated Use SERVER_BACKEND_URL for server-to-server calls and
 * PUBLIC_BACKEND_API_URL when referring to the public canonical API domain.
 */
export const BACKEND_API_URL = SERVER_BACKEND_URL;
