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

## OpenClaw config rules

Always validate any new config fields against the configuration reference before writing them: https://docs.openclaw.ai/gateway/configuration-reference.md

Config defaults belong in `seed/openclaw.json.template`. Any field that has a default should be overridable on a per-bot basis via `botdaddy.json` and reconciled by `apply`.

- **Channel credentials** (botToken, baseUrl) go directly in `openclaw.json` channels config, not in `.env`. Env var fallback is unreliable.
- **Model names are always fully qualified**: `provider/model-id` (e.g. `anthropic/claude-sonnet-4-6`, `ollama/minimax-m2.5:cloud`)
- **`auth.profiles`** only supports `mode: "oauth"` or `mode: "api_key"` — no `baseUrl`/`apiKey` fields. Anthropic key is read from `ANTHROPIC_API_KEY` env var automatically; no auth-profiles.json needed.
- **Ollama** routes through `models.providers.ollama` with `api: "openai-completions"` and `baseUrl: "http://host.internal:11434/v1"`.
- **OpenClaw onboard** resets `gateway.bind` and regenerates the token — `fixConfigAfterOnboard()` must be called after onboard to re-patch.
- When disabling a channel, set `enabled: false` on both `config.channels.<name>` and `config.plugins.entries.<name>`. Omitting the key is not enough.

## Tailscale integration

Tailscale is installed in the Docker image and started conditionally by `entrypoint.sh` when `TS_AUTHKEY` is present in the environment. Each bot gets its own tailnet node.

- **Auth key** stored in `~/.botdaddy/config.json` as `tailscaleAuthKey`, baked into per-bot `.env` by apply (same pattern as `ANTHROPIC_API_KEY`).
- **Hostname** auto-derived as `${namespace}-${name}` — no user prompt needed.
- **State** persisted at `${botDir}/.tailscale` → volume-mounted to `/var/lib/tailscale`.
- **Docker capabilities**: `--cap-add NET_ADMIN`, `--cap-add NET_RAW`, `--device /dev/net/tun` — only when `bot.tailscale` is true. These are set at container creation time, so enabling/disabling Tailscale requires container recreation (stop + rm + run), not just restart.
- **Non-blocking**: if Tailscale fails to connect, the gateway still starts normally.
- The `botdaddy tailscale` command recreates the container (for capability changes) but does **not** rebuild the image — Tailscale is always installed in the base image.

## IDE remote server persistence

VS Code and Cursor remote SSH connections download a server + extensions to `/root/.vscode-server` and `/root/.cursor-server`. These are volume-mounted from `${botDir}/.vscode-server` and `${botDir}/.cursor-server` so they survive container recreations. The directories are created unconditionally by `apply` and mounted by `start.js`.

## Base image tooling

The Docker image (`docker/Dockerfile`) is a "kitchen sink" base with everything pre-installed so every bot is ready for any project type:

- **Python 3** with pip and venv.
- **PHP 8.2, 8.3, 8.4** side by side via the Ondrej Sury PPA, with common extensions (mbstring, xml, curl, zip, mysql, sqlite3, pgsql, gd, intl, bcmath, readline, redis, memcached, xdebug). Default is 8.4; switch with `update-alternatives --set php /usr/bin/php8.x` or call `php8.2`/`php8.3` directly.
- **Composer** installed globally.
- **Node.js** (pinned version via nvm), **TypeScript**, and **tsx** installed globally.
- **Docker CLI + compose plugin** for Docker-out-of-Docker.
- **GitHub CLI** (`gh`) for repo/PR/issue workflows.
- **Claude Code** (`claude`) for agentic coding.
- **agent-browser** with Chromium pre-downloaded (`agent-browser install --with-deps`).
- **ripgrep** (`rg`) and **tree** for fast code search and directory visualization.

When the Dockerfile changes, run `botdaddy rebuild` to rebuild the image and recreate all bot containers. Use `botdaddy rebuild <name>` to target a single bot. Rebuild also syncs seed skills into all targeted bot workspaces.

## CLI / UX

Always put effort into a polished CLI experience. Use `@clack/prompts` for all interactive prompts — `p.intro`/`p.outro` framing, `p.spinner()` for async work, `p.log.step/info/warn/error` for structured output. Import `p` and `guard()` from `src/lib/prompt.js`.

- All Docker subprocesses use `stdio: 'pipe'` — never `stdio: 'inherit'`. This prevents subprocess output from bleeding through the clack spinner UI. Surface errors via `err.stderr?.toString()`.
- Spinners are owned by the top-level command. When `apply` is called from `config` with `quiet: true`, it produces no output — the caller manages the spinner.

## Skills

Skill files live in `seed/skills/<name>/` and are seeded into new bot workspaces at `workspace/skills/<name>/` during `apply`. OpenClaw auto-discovers workspace skills — no `openclaw.json` config needed.

- **Adding a new skill**: Place files in `seed/skills/<name>/`, run `botdaddy rebuild` to sync to existing bots.
- **Updating a skill**: Update files in `seed/skills/<name>/`, run `botdaddy rebuild`.
- **Installed skills**: `agent-browser` (headless browser automation by Vercel Labs).

## Provider abstraction

Providers live in `src/lib/providers.js`. Each provider defines `label`, `defaultModel`, `needsApiKey`, and `buildConfig(qualifiedModel)`. Add new providers there — no branching in `apply.js` or `config.js`.
