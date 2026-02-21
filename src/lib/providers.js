/**
 * Provider definitions. Each provider knows how to build its own
 * openclaw.json agent config from a fully-qualified model name.
 *
 * Model names are always fully qualified: "provider/model-id"
 * e.g. "anthropic/claude-sonnet-4-6", "ollama/minimax-m2.5:cloud"
 */
const PROVIDERS = {
  anthropic: {
    label: 'Anthropic',
    defaultModel: 'anthropic/claude-sonnet-4-6',
    needsApiKey: true,
    buildConfig(model) {
      return {
        agentModel: { primary: model },
        agentModels: { [model]: { alias: 'default' } },
        subagentsModel: model,
        // No provider endpoint needed — Anthropic is built-in to OpenClaw
      };
    },
  },

  ollama: {
    label: 'Ollama (local)',
    defaultModel: 'ollama/minimax-m2.5:cloud',
    needsApiKey: false,
    buildConfig(qualifiedModel) {
      const bareModel = qualifiedModel.replace(/^ollama\//, '');
      return {
        agentModel: { primary: qualifiedModel },
        agentModels: { [qualifiedModel]: { alias: 'default' } },
        subagentsModel: qualifiedModel,
        // Ollama routes through OpenAI-compatible API
        providerEndpoint: {
          providerKey: 'ollama',
          config: {
            baseUrl: 'http://host.internal:11434/v1',
            apiKey: 'ollama',
            api: 'openai-completions',
            models: [{
              id: bareModel,
              name: bareModel,
              reasoning: false,
              contextWindow: 32768,
              maxTokens: 8192,
              cost: { input: 0, output: 0 },
            }],
          },
        },
      };
    },
  },
};

export function getProvider(name) {
  return PROVIDERS[name] ?? PROVIDERS.anthropic;
}

export function providerLabels() {
  return Object.values(PROVIDERS).map(p => p.label);
}

export function providerFromLabel(label) {
  const entry = Object.entries(PROVIDERS).find(([, p]) => p.label === label);
  return entry ? entry[0] : label.toLowerCase().replace(/\s*\(.*\)/, '');
}
