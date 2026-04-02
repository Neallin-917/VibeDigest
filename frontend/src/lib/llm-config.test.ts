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
    });

    it('returns OpenRouter config when provider is openrouter', () => {
        // Setup mock environment
        vi.mocked(env).OPENROUTER_BASE_URL = 'https://openrouter.mock/api/v1';
        vi.mocked(env).OPENROUTER_API_KEY = 'sk-or-mock';
        vi.mocked(env).OPENAI_BASE_URL = 'https://openai.mock/v1';
        vi.mocked(env).OPENAI_API_KEY = 'sk-openai-mock';

        const config = getProviderConfig('openrouter');

        expect(config.baseURL).toBe('https://openrouter.mock/api/v1');
        expect(config.apiKey).toBe('sk-or-mock');
    });

    it('returns custom endpoint config when provider is custom', () => {
        vi.mocked(env).OPENAI_BASE_URL = 'http://localhost:1234/v1';
        vi.mocked(env).OPENAI_API_KEY = 'sk-custom-mock';

        const config = getProviderConfig('custom');

        expect(config.baseURL).toBe('http://localhost:1234/v1');
        expect(config.apiKey).toBe('sk-custom-mock');
    });

    it('defaults to OpenRouter public URL if OPENROUTER_BASE_URL is missing', () => {
        vi.mocked(env).OPENROUTER_BASE_URL = undefined;
        vi.mocked(env).OPENROUTER_API_KEY = 'sk-or-mock';
        const config = getProviderConfig('openrouter');
        expect(config.baseURL).toBe('https://openrouter.ai/api/v1');
    });

    it('throws error when OPENAI_API_KEY is missing for custom provider', () => {
        vi.mocked(env).OPENAI_API_KEY = undefined;
        vi.mocked(env).OPENROUTER_API_KEY = 'sk-or-mock'; // Should be ignored

        expect(() => getProviderConfig('custom')).toThrow(
            "Missing API Key for provider: 'custom'. Set OPENAI_API_KEY in the environment."
        );
    });

    it('throws error when OPENROUTER_API_KEY is missing for OpenRouter provider', () => {
        vi.mocked(env).OPENROUTER_API_KEY = undefined;
        vi.mocked(env).OPENAI_API_KEY = 'sk-openai-mock'; // Should be ignored

        expect(() => getProviderConfig('openrouter')).toThrow(
            "Missing API Key for provider: 'openrouter'. Set OPENROUTER_API_KEY in the environment."
        );
    });

    it('throws on invalid baseURL format', () => {
        vi.mocked(env).OPENAI_BASE_URL = 'not-a-valid-url';
        vi.mocked(env).OPENAI_API_KEY = 'sk-openai-mock';

        expect(() => getProviderConfig('custom')).toThrow(/Invalid base URL for provider 'custom'/);
    });

});
