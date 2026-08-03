import { describe, expect, it } from 'vitest';
import { getProviderModelDefaults, resolveProvider, resolveProviderModel } from './llm-model-registry';

describe('llm-model-registry', () => {
    it('returns the Luna defaults for OpenRouter', () => {
        expect(getProviderModelDefaults('openrouter')).toEqual({
            smart: 'openai/gpt-5.6-luna',
            fast: 'openai/gpt-5.6-luna',
        });
    });

    it('returns the Luna defaults for the OpenAI API provider', () => {
        expect(getProviderModelDefaults('openai')).toEqual({
            smart: 'gpt-5.6-luna',
            fast: 'gpt-5.6-luna',
        });
    });

    it('returns the Luna defaults for custom providers', () => {
        expect(getProviderModelDefaults('custom')).toEqual({
            smart: 'gpt-5.6-luna',
            fast: 'gpt-5.6-luna',
        });
    });

    it('prefers environment overrides when provided', () => {
        expect(
            resolveProviderModel('custom', 'fast', {
                fast: 'my-local-fast-model',
            })
        ).toBe('my-local-fast-model');
    });

    it('uses custom provider when OPENAI_BASE_URL is configured', () => {
        expect(resolveProvider('http://localhost:8317/v1')).toBe('custom');
    });

    it('defaults to openrouter when OPENAI_BASE_URL is absent', () => {
        expect(resolveProvider(undefined)).toBe('openrouter');
    });

    it('honours an explicit API provider instead of inferring from a base URL', () => {
        expect(resolveProvider(undefined, 'openai')).toBe('openai');
    });

    it('throws for unsupported providers', () => {
        expect(() => getProviderModelDefaults('anthropic')).toThrow(
            "Unsupported provider: 'anthropic'. Expected one of: openai, openrouter, custom."
        );
    });
});
