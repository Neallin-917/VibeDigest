import { describe, expect, it } from 'vitest';
import { resolveProvider, resolveProviderModel } from './llm-model-registry';

describe('llm routing contract', () => {
    it('matches the openrouter runtime contract when custom routing is disabled', () => {
        const provider = resolveProvider(undefined);

        expect(provider).toBe('openrouter');
        expect(
            resolveProviderModel(provider, 'smart', {
                smart: undefined,
                fast: undefined,
            })
        ).toBe('openrouter/auto');
        expect(
            resolveProviderModel(provider, 'fast', {
                smart: undefined,
                fast: undefined,
            })
        ).toBe('openrouter/auto');
    });

    it('matches the custom runtime contract when OPENAI_BASE_URL is configured', () => {
        const provider = resolveProvider('http://localhost:8317/v1');

        expect(provider).toBe('custom');
        expect(
            resolveProviderModel(provider, 'smart', {
                smart: undefined,
                fast: undefined,
            })
        ).toBe('gemini-3-pro-preview');
        expect(
            resolveProviderModel(provider, 'fast', {
                smart: undefined,
                fast: undefined,
            })
        ).toBe('gemini-3-flash-preview');
    });

    it('always prefers alias overrides over provider defaults', () => {
        const provider = resolveProvider('http://localhost:8317/v1');

        expect(
            resolveProviderModel(provider, 'smart', {
                smart: 'claude-sonnet-4-6',
                fast: 'claude-haiku-4-5-20251001',
            })
        ).toBe('claude-sonnet-4-6');
        expect(
            resolveProviderModel(provider, 'fast', {
                smart: 'claude-sonnet-4-6',
                fast: 'claude-haiku-4-5-20251001',
            })
        ).toBe('claude-haiku-4-5-20251001');
    });
});
