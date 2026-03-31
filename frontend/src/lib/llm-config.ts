import { createOpenAI } from '@ai-sdk/openai';
import { env } from '@/env';

// Define debug fetch once
const AI_SDK_DEBUG = env.AI_SDK_DEBUG === '1';

const debugFetch: typeof fetch = async (input, init) => {
    if (AI_SDK_DEBUG) {
        try {
            const url = typeof input === 'string' ? input : input.toString();
            console.log('[AI SDK] Request URL:', url);
            if (init?.body) {
                console.log('[AI SDK] Request body:', init.body.toString());
            }
        } catch (e) {
            console.warn('[AI SDK] Failed to log request:', e);
        }
    }
    const response = await fetch(input, init);
    if (AI_SDK_DEBUG && !response.ok) {
        try {
            const text = await response.clone().text();
            console.log('[AI SDK] Response status:', response.status);
            console.log('[AI SDK] Response body:', text);
        } catch (e) {
            console.warn('[AI SDK] Failed to log response:', e);
        }
    }
    return response;
};

export type ProviderConfig = {
    baseURL?: string;
    apiKey?: string;
    fetch?: typeof fetch;
}

const SUPPORTED_PROVIDERS = ['openrouter', 'openai', 'custom'] as const;

function ensureSupportedProvider(providerName: string): asserts providerName is typeof SUPPORTED_PROVIDERS[number] {
    if (!SUPPORTED_PROVIDERS.includes(providerName as typeof SUPPORTED_PROVIDERS[number])) {
        throw new Error(
            `Unsupported provider: '${providerName}'. Expected one of: ${SUPPORTED_PROVIDERS.join(', ')}.`
        );
    }
}

export function getProviderConfig(providerName: string): ProviderConfig {
    ensureSupportedProvider(providerName);

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
    const config = getProviderConfig(providerName);
    return createOpenAI(config);
}
