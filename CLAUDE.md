# CLAUDE.md — botdaddy developer notes

## Multi-instance is a first-class requirement

Multiple independent botdaddy stacks must be able to coexist on the same machine at all times. Never hardcode namespaces, ports, paths, image names, or container names. Everything derives from `getStack()` which reads from `botdaddy.json` and respects env var overrides:

```sh
BOTDADDY_NAMESPACE=team2 BOTDADDY_BASE_PORT=20000 BOTDADDY_HOME=~/.botdaddy-team2 botdaddy config mybot
```

Key helpers — always use these, never hardcode:
- `getStack()` — namespace, basePort, imageName, dataRoot
- `getContainerName(name)` — `${namespace}-${name}`
- `getBotDir(name)` — `${dataRoot}/${name}` (resolved from project root)
- `getHomeDir()` — `$BOTDADDY_HOME` or `~/.botdaddy`

## Architecture

- **No docker-compose** — direct `docker run`/`start`/`stop` per bot
- **botdaddy.json** is the source of truth for all bot config
- **apply** is the idempotent reconciler — reads botdaddy.json, writes .env + openclaw.json, restarts container
- **config** = wizard → botdaddy.json → apply (same command for create and update)

## OpenClaw config rules (learned from debugging)

- **Channel credentials** (botToken, baseUrl) go directly in `openclaw.json` channels config, not in `.env`. Env var fallback is unreliable.
- **Model names are always fully qualified**: `provider/model-id` (e.g. `anthropic/claude-sonnet-4-6`, `ollama/minimax-m2.5:cloud`)
- **`auth.profiles`** only supports `mode: "oauth"` or `mode: "api_key"` — no `baseUrl`/`apiKey` fields. Anthropic key is read from `ANTHROPIC_API_KEY` env var automatically; no auth-profiles.json needed.
- **Ollama** routes through `models.providers.ollama` with `api: "openai-completions"` and `baseUrl: "http://host.internal:11434/v1"`.
- **OpenClaw onboard** resets `gateway.bind` and regenerates the token — `fixConfigAfterOnboard()` must be called after onboard to re-patch.
- When disabling a channel, set `enabled: false` on both `config.channels.<name>` and `config.plugins.entries.<name>`. Omitting the key is not enough.

## CLI / UX

- Interactive prompts use `@clack/prompts`. Import `p` and `guard()` from `src/lib/prompt.js`.
- All Docker subprocesses use `stdio: 'pipe'` — never `stdio: 'inherit'`. This prevents subprocess output from bleeding through the clack spinner UI. Surface errors via `err.stderr?.toString()`.
- Spinners are owned by the top-level command. When `apply` is called from `config` with `quiet: true`, it produces no output — the caller manages the spinner.

## Provider abstraction

Providers live in `src/lib/providers.js`. Each provider defines `label`, `defaultModel`, `needsApiKey`, and `buildConfig(qualifiedModel)`. Add new providers there — no branching in `apply.js` or `config.js`.
