import { describe, expect, it } from 'vitest';
import { getProviderModelDefaults, resolveProvider, resolveProviderModel } from './llm-model-registry';

describe('llm-model-registry', () => {
    it('returns shared defaults for openrouter', () => {
        expect(getProviderModelDefaults('openrouter')).toEqual({
            smart: 'openrouter/auto',
            fast: 'openrouter/auto',
        });
    });

    it('returns the GPT-5.6 role defaults for the OpenAI API provider', () => {
        expect(getProviderModelDefaults('openai')).toEqual({
            smart: 'gpt-5.6-sol',
            fast: 'gpt-5.6-terra',
        });
    });

    it('returns shared defaults for custom provider', () => {
        expect(getProviderModelDefaults('custom')).toEqual({
            smart: 'gemini-3-pro-preview',
            fast: 'gemini-3-flash-preview',
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
