# botdaddy

CLI for managing isolated [OpenClaw](https://openclaw.ai) agent instances in Docker containers. Each bot gets its own container, workspace, config, and optionally a Mattermost or Telegram integration.

## Prerequisites

- [OrbStack](https://orbstack.dev) (or Docker Desktop)
- Node.js >= 22
- An Anthropic API key, or [Ollama](https://ollama.ai) running locally

## Installation

```sh
git clone <this repo>
cd botdaddy
npm install
npm link   # makes `botdaddy` available globally
```

Or run directly with `node bin/botdaddy.js <command>`.

## Quick Start

```sh
# Create a new bot (interactive wizard + apply)
botdaddy config mybot

# Start the bot
botdaddy start mybot

# Follow logs
botdaddy logs mybot

# Open the gateway dashboard in a browser
botdaddy dashboard mybot
```

## Commands

| Command | Description |
|---------|-------------|
| `config <name>` | Create or update a bot — interactive wizard then applies |
| `apply <name>` | Re-apply `botdaddy.json` config without re-running the wizard |
| `start <name>` | Start the bot container |
| `restart <name>` | Restart the bot container |
| `stop <name>` | Stop the bot container |
| `logs <name>` | Follow container logs |
| `ls` | List all bots and their status |
| `shell <name>` | Open a shell inside the container |
| `token <name>` | Print the gateway auth token |
| `dashboard <name>` | Open the gateway dashboard in a browser |
| `mattermost <name>` | Provision or re-provision Mattermost for a bot |
| `telegram <name>` | Configure Telegram for a bot |
| `approve <name> <channel> <code>` | Approve a channel pairing code |
| `destroy <name>` | Stop and remove a bot (optionally delete data) |

## How It Works

`botdaddy.json` is the source of truth for all bot config (ports, provider, model, channel flags). The `apply` command reads it and idempotently reconciles everything — files on disk, `openclaw.json`, and the running container.

```
botdaddy config mybot   →  writes botdaddy.json  →  calls apply
botdaddy apply mybot    →  reads botdaddy.json   →  writes .env, openclaw.json, restarts container
```

See [CONFIG-FLOW.md](./CONFIG-FLOW.md) for a full map of where config lives and how it flows.

## Providers

### Anthropic

Select **Anthropic** in the wizard. You'll be prompted for an API key, which can be saved as a global default or set per-bot.

Default model: `anthropic/claude-sonnet-4-6`

### Ollama (local)

Select **Ollama (local)** in the wizard. Ollama must be running on the host — the container reaches it via `host.internal:11434`.

Default model: `ollama/minimax-m2.5:cloud`

## Channels

### Mattermost

```sh
# During create:
botdaddy config mybot   # answer yes to Mattermost setup

# Or add to an existing bot:
botdaddy mattermost mybot
```

After starting the bot, DM it on Mattermost to receive a pairing code, then:

```sh
botdaddy approve mybot mattermost <code>
```

### Telegram

```sh
# During create:
botdaddy config mybot   # answer yes to Telegram setup

# Or add to an existing bot:
botdaddy telegram mybot
```

Create a bot via [@BotFather](https://t.me/BotFather) and paste the token when prompted.

## Data Layout

```
~/.botdaddy/config.json     # global defaults (API keys, MM admin token)
botdaddy.json               # bot registry — gitignored
bots/<name>/
  .env                      # env vars (gateway token, API key, dev ports)
  openclaw.json             # OpenClaw config (models, channels, gateway)
  workspace/                # agent workspace (git repo)
  agents/                   # agent identity and sessions
```

Each bot's data directory is volume-mounted into its container at `/root/.openclaw`.

## Docker-out-of-Docker

Bots can spawn sibling containers via the host Docker socket (`/var/run/docker.sock`). Each bot is allocated a 10-port dev range for this purpose, documented in its workspace `TOOLS.md`.

## Multi-Instance

Multiple independent stacks can coexist by setting environment variables before running:

```sh
BOTDADDY_NAMESPACE=team2 BOTDADDY_BASE_PORT=20000 BOTDADDY_HOME=~/.botdaddy-team2 botdaddy config mybot
```
