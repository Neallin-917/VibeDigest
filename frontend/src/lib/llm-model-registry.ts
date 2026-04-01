import fs from 'node:fs';
import path from 'node:path';

export type SupportedProvider = 'openrouter' | 'custom';
export type ModelTier = 'smart' | 'fast';
export type ProviderModelDefaults = Record<SupportedProvider, Record<ModelTier, string>>;

function loadProviderModelDefaults(): ProviderModelDefaults {
    const candidates = [
        path.resolve(process.cwd(), 'config', 'llm-provider-defaults.json'),
        path.resolve(process.cwd(), '..', 'config', 'llm-provider-defaults.json'),
    ];

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return JSON.parse(fs.readFileSync(candidate, 'utf-8')) as ProviderModelDefaults;
        }
    }

    throw new Error(
        `Unable to locate llm-provider-defaults.json. Checked: ${candidates.join(', ')}.`
    );
}

const PROVIDER_MODEL_DEFAULTS = loadProviderModelDefaults();

export function resolveProvider(openaiBaseUrl?: string): SupportedProvider {
    return openaiBaseUrl ? 'custom' : 'openrouter';
}

export function getProviderModelDefaults(providerName: string): Record<ModelTier, string> {
    if (!(providerName in PROVIDER_MODEL_DEFAULTS)) {
        throw new Error(
            `Unsupported provider: '${providerName}'. Expected one of: ${Object.keys(PROVIDER_MODEL_DEFAULTS).join(', ')}.`
        );
    }

    return PROVIDER_MODEL_DEFAULTS[providerName as SupportedProvider];
}

export function resolveProviderModel(
    providerName: string,
    tier: ModelTier,
    overrides?: Partial<Record<ModelTier, string | undefined>>
): string {
    const providerDefaults = getProviderModelDefaults(providerName);
    return overrides?.[tier] || providerDefaults[tier];
}

export { PROVIDER_MODEL_DEFAULTS };
