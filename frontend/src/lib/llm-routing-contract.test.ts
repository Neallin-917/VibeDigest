import { describe, expect, it } from 'vitest';
import { resolveProvider, resolveProviderModel } from './llm-model-registry';

describe('llm routing contract', () => {
    it('matches the Luna OpenRouter runtime contract when custom routing is disabled', () => {
        const provider = resolveProvider(undefined);

        expect(provider).toBe('openrouter');
        expect(
            resolveProviderModel(provider, 'smart', {
                smart: undefined,
                fast: undefined,
            })
        ).toBe('openai/gpt-5.6-luna');
        expect(
            resolveProviderModel(provider, 'fast', {
                smart: undefined,
                fast: undefined,
            })
        ).toBe('openai/gpt-5.6-luna');
    });

    it('matches the Luna custom runtime contract when OPENAI_BASE_URL is configured', () => {
        const provider = resolveProvider('http://localhost:8317/v1');

        expect(provider).toBe('custom');
        expect(
            resolveProviderModel(provider, 'smart', {
                smart: undefined,
                fast: undefined,
            })
        ).toBe('gpt-5.6-luna');
        expect(
            resolveProviderModel(provider, 'fast', {
                smart: undefined,
                fast: undefined,
            })
        ).toBe('gpt-5.6-luna');
    });

    it('selects Luna for both OpenAI API model tiers when explicitly configured', () => {
        const provider = resolveProvider(undefined, 'openai');

        expect(provider).toBe('openai');
        expect(resolveProviderModel(provider, 'smart')).toBe('gpt-5.6-luna');
        expect(resolveProviderModel(provider, 'fast')).toBe('gpt-5.6-luna');
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
