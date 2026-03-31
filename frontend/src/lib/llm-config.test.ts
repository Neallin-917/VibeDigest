import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getProviderConfig } from './llm-config';
import { env } from '@/env';

// Mock the environment module
vi.mock('@/env', () => ({
    env: {
        OPENROUTER_BASE_URL: undefined,
        OPENROUTER_API_KEY: undefined,
        OPENAI_BASE_URL: undefined,
        OPENAI_API_KEY: undefined,
        LLM_PROVIDER: undefined,
        AI_SDK_DEBUG: '0',
    }
}));

describe('getProviderConfig', () => {
    beforeEach(() => {
        // Reset mock values before each test
        vi.mocked(env).OPENROUTER_BASE_URL = undefined;
        vi.mocked(env).OPENROUTER_API_KEY = undefined;
        vi.mocked(env).OPENAI_BASE_URL = undefined;
        vi.mocked(env).OPENAI_API_KEY = undefined;
        vi.mocked(env).LLM_PROVIDER = undefined;
    });

    it('returns OpenRouter config when provider is openrouter', () => {
        // Setup mock environment
        // @ts-expect-error - writing to read-only property for test mocking
        vi.mocked(env).OPENROUTER_BASE_URL = 'https://openrouter.mock/api/v1';
        // @ts-expect-error - writing to read-only property for test mocking
        vi.mocked(env).OPENROUTER_API_KEY = 'sk-or-mock';
        // @ts-expect-error - writing to read-only property for test mocking
        vi.mocked(env).OPENAI_BASE_URL = 'https://openai.mock/v1';
        // @ts-expect-error - writing to read-only property for test mocking
        vi.mocked(env).OPENAI_API_KEY = 'sk-openai-mock';

        const config = getProviderConfig('openrouter');

        expect(config.baseURL).toBe('https://openrouter.mock/api/v1');
        expect(config.apiKey).toBe('sk-or-mock');
    });

    it('returns OpenAI config when provider is openai', () => {
        // @ts-expect-error - writing to read-only property for test mocking
        vi.mocked(env).OPENAI_BASE_URL = 'https://api.openai.com/v1';
        // @ts-expect-error - writing to read-only property for test mocking
        vi.mocked(env).OPENAI_API_KEY = 'sk-openai-mock';

        const config = getProviderConfig('openai');

        expect(config.baseURL).toBe('https://api.openai.com/v1');
        expect(config.apiKey).toBe('sk-openai-mock');
    });

    it('returns OpenAI config when provider is custom', () => {
        // @ts-expect-error - writing to read-only property for test mocking
        vi.mocked(env).OPENAI_BASE_URL = 'http://localhost:1234/v1';
        // @ts-expect-error - writing to read-only property for test mocking
        vi.mocked(env).OPENAI_API_KEY = 'sk-custom-mock';

        const config = getProviderConfig('custom');

        expect(config.baseURL).toBe('http://localhost:1234/v1');
        expect(config.apiKey).toBe('sk-custom-mock');
    });

    it('defaults to OpenRouter public URL if OPENROUTER_BASE_URL is missing', () => {
        // @ts-expect-error - writing to read-only property for test mocking
        vi.mocked(env).OPENROUTER_BASE_URL = undefined;
        // @ts-expect-error - writing to read-only property for test mocking
        vi.mocked(env).OPENROUTER_API_KEY = 'sk-or-mock';
        const config = getProviderConfig('openrouter');
        expect(config.baseURL).toBe('https://openrouter.ai/api/v1');
    });

    it('defaults to OpenAI public URL if OPENAI_BASE_URL is missing', () => {
        // @ts-expect-error - writing to read-only property for test mocking
        vi.mocked(env).OPENAI_BASE_URL = undefined;
        // @ts-expect-error - writing to read-only property for test mocking
        vi.mocked(env).OPENAI_API_KEY = 'sk-openai-mock';
        const config = getProviderConfig('openai');
        expect(config.baseURL).toBe('https://api.openai.com/v1');
    });

    it('throws error when OPENAI_API_KEY is missing for OpenAI provider', () => {
        // @ts-expect-error - writing to read-only property for test mocking
        vi.mocked(env).OPENAI_API_KEY = undefined;
        // @ts-expect-error - writing to read-only property for test mocking
        vi.mocked(env).OPENROUTER_API_KEY = 'sk-or-mock'; // Should be ignored

        expect(() => getProviderConfig('openai')).toThrow(
            "Missing API Key for provider: 'openai'. Set OPENAI_API_KEY in the environment."
        );
    });

    it('throws error when OPENROUTER_API_KEY is missing for OpenRouter provider', () => {
        // @ts-expect-error - writing to read-only property for test mocking
        vi.mocked(env).OPENROUTER_API_KEY = undefined;
        // @ts-expect-error - writing to read-only property for test mocking
        vi.mocked(env).OPENAI_API_KEY = 'sk-openai-mock'; // Should be ignored

        expect(() => getProviderConfig('openrouter')).toThrow(
            "Missing API Key for provider: 'openrouter'. Set OPENROUTER_API_KEY in the environment."
        );
    });

    it('throws on invalid baseURL format', () => {
        // @ts-expect-error - writing to read-only property for test mocking
        vi.mocked(env).OPENAI_BASE_URL = 'not-a-valid-url';
        // @ts-expect-error - writing to read-only property for test mocking
        vi.mocked(env).OPENAI_API_KEY = 'sk-openai-mock';

        expect(() => getProviderConfig('custom')).toThrow(/Invalid base URL for provider 'custom'/);
    });

    it('throws on unsupported provider names', () => {
        expect(() => getProviderConfig('anthropic')).toThrow(
            "Unsupported provider: 'anthropic'. Expected one of: openrouter, openai, custom."
        );
    });
});
