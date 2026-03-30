import { env } from '@/env';
import { isRecord } from './utils';
import type { ModelTier, ResolvedModel, ProviderEntry } from './types';

const MODEL_CACHE_TTL_MS = 5 * 60 * 1000;

const cachedModelByTier: Record<ModelTier, ResolvedModel | null> = {
    smart: null,
    fast: null,
};
const cachedModelAtByTier: Record<ModelTier, number> = {
    smart: 0,
    fast: 0,
};

const API_BASE_URL = env.BACKEND_API_URL || 'http://127.0.0.1:8000';

export async function resolveModelName(tier: ModelTier): Promise<ResolvedModel> {
    const fallbackProvider = 'openai';
    const fallbackModel = tier === 'fast' ? 'gpt-4.1-mini' : 'gpt-4.1';

    if (env.OPENAI_MODEL) {
        return {
            model: env.OPENAI_MODEL,
            provider: env.LLM_PROVIDER || fallbackProvider,
        };
    }

    const now = Date.now();
    const cached = cachedModelByTier[tier];
    const cachedAt = cachedModelAtByTier[tier];
    if (cached && now - cachedAt < MODEL_CACHE_TTL_MS) {
        return cached;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/models/providers`);
        if (!response.ok) {
            throw new Error(`Failed to load providers (${response.status})`);
        }
        const data: unknown = await response.json();
        const dataRecord = isRecord(data) ? data : {};

        const envProvider = env.LLM_PROVIDER;
        const backendActiveProvider =
            typeof dataRecord.active_provider === 'string'
                ? dataRecord.active_provider
                : undefined;

        const activeProvider = envProvider || backendActiveProvider || fallbackProvider;

        const providersRaw = Array.isArray(dataRecord.providers) ? dataRecord.providers : [];
        const providers: ProviderEntry[] = providersRaw
            .filter(isRecord)
            .map((provider) => {
                const defaultsRaw = isRecord(provider.defaults) ? provider.defaults : undefined;
                return {
                    provider: typeof provider.provider === 'string' ? provider.provider : undefined,
                    defaults: defaultsRaw
                        ? {
                            fast: typeof defaultsRaw.fast === 'string' ? defaultsRaw.fast : undefined,
                            smart: typeof defaultsRaw.smart === 'string' ? defaultsRaw.smart : undefined,
                        }
                        : undefined,
                };
            });

        const selected =
            providers.find((p) => p.provider === activeProvider) ||
            providers.find((p) => p.provider === fallbackProvider) ||
            providers[0];
        const defaults = selected?.defaults || {};

        let modelName = tier === 'fast' ? defaults.fast : defaults.smart;

        if (!modelName) {
            if (activeProvider === 'openrouter') {
                modelName = tier === 'fast' ? 'google/gemini-2.5-flash' : 'google/gemini-2.5-pro';
            } else {
                modelName = fallbackModel;
            }
        }

        const result: ResolvedModel = { model: modelName, provider: activeProvider };

        cachedModelByTier[tier] = result;
        cachedModelAtByTier[tier] = now;
        return result;
    } catch (error) {
        console.warn('[API/Chat] Failed to resolve model from backend:', error);

        if (env.LLM_PROVIDER === 'openrouter') {
            return {
                model: tier === 'fast' ? 'google/gemini-2.5-flash' : 'google/gemini-2.5-pro',
                provider: 'openrouter',
            };
        }

        return { model: fallbackModel, provider: fallbackProvider };
    }
}
