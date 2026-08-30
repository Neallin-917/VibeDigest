import fs from 'node:fs';
import path from 'node:path';

export type SupportedProvider = 'openai' | 'openrouter' | 'custom';
export type ModelDefaultsProvider = SupportedProvider | 'codex_local';
export type ModelTier = 'smart' | 'fast';
export type ProviderModelDefaults = Record<ModelDefaultsProvider, Record<ModelTier, string>>;
const MODEL_DEFAULT_PROVIDERS: readonly ModelDefaultsProvider[] = [
    'openai',
    'openrouter',
    'custom',
    'codex_local',
];

const providerModelDefaultsPath = path.join(
    /* turbopackIgnore: true */ process.cwd(),
    '..',
    'config',
    'llm-provider-defaults.json'
);

const PROVIDER_MODEL_DEFAULTS = JSON.parse(
    fs.readFileSync(providerModelDefaultsPath, 'utf-8')
) as ProviderModelDefaults;

export function resolveProvider(
    openaiBaseUrl?: string,
    configuredProvider?: SupportedProvider
): SupportedProvider {
    if (configuredProvider) return configuredProvider;
    return openaiBaseUrl ? 'custom' : 'openrouter';
}

export function getProviderModelDefaults(providerName: string): Record<ModelTier, string> {
    if (!MODEL_DEFAULT_PROVIDERS.includes(providerName as ModelDefaultsProvider)) {
        throw new Error(
            `Unsupported provider: '${providerName}'. Expected one of: ${MODEL_DEFAULT_PROVIDERS.join(', ')}.`
        );
    }

    return PROVIDER_MODEL_DEFAULTS[providerName as ModelDefaultsProvider];
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
