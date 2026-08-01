import { createOpenAI } from '@ai-sdk/openai';
import { env } from '@/env';
import { resolveProvider, type SupportedProvider } from './llm-model-registry';

// Define debug fetch once
const AI_SDK_DEBUG = env.AI_SDK_DEBUG === '1';

function getRequestOrigin(input: RequestInfo | URL): string {
    const rawUrl = typeof input === 'string'
        ? input
        : input instanceof URL
            ? input.toString()
            : input.url;

    try {
        return new URL(rawUrl).origin;
    } catch {
        return 'unknown';
    }
}

const debugFetch: typeof fetch = async (input, init) => {
    const origin = getRequestOrigin(input);
    if (AI_SDK_DEBUG) {
        console.info('[AI SDK] Request', {
            method: init?.method ?? 'GET',
            origin,
        });
    }
    const response = await fetch(input, init);
    if (AI_SDK_DEBUG && !response.ok) {
        console.warn('[AI SDK] Response error', { origin, status: response.status });
    }
    return response;
};

export type ProviderConfig = {
    baseURL?: string;
    apiKey?: string;
    fetch?: typeof fetch;
}

function isSupportedProvider(providerName: string): providerName is SupportedProvider {
    return providerName === 'openrouter' || providerName === 'custom';
}

export function getProviderConfig(providerName: SupportedProvider): ProviderConfig {
    const providerConfig = providerName === 'openrouter'
        ? {
            baseURL: env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
            apiKey: env.OPENROUTER_API_KEY || '',
            requiredKeyEnv: 'OPENROUTER_API_KEY',
        }
        : {
            baseURL: env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
            apiKey: env.OPENAI_API_KEY || '',
            requiredKeyEnv: 'OPENAI_API_KEY',
        };

    // Fail Fast: Validate base URL format
    try {
        new URL(providerConfig.baseURL);
    } catch {
        throw new Error(
            `Invalid base URL for provider '${providerName}': '${providerConfig.baseURL}'. Must be a valid URL.`
        );
    }

    // Fail Fast: Validate API Key
    if (!providerConfig.apiKey) {
        throw new Error(
            `Missing API Key for provider: '${providerName}'. Set ${providerConfig.requiredKeyEnv} in the environment.`
        );
    }

    return {
        baseURL: providerConfig.baseURL,
        apiKey: providerConfig.apiKey,
        fetch: AI_SDK_DEBUG ? debugFetch : undefined
    };
}

export function createProviderClient(providerName: string) {
    const resolvedProvider = resolveProvider(env.OPENAI_BASE_URL);
    const activeProvider = isSupportedProvider(providerName) ? providerName : resolvedProvider;
    const config = getProviderConfig(activeProvider);
    return createOpenAI(config);
}
