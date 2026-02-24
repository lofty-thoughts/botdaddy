# botdaddy

CLI for managing isolated [OpenClaw](https://openclaw.ai) agent instances in Docker containers. Each bot gets its own container, workspace, config, and optionally Mattermost, Telegram, or Tailscale integration.

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
botdaddy create mybot

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
| `create <name>` | Alias for `config` |
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
| `tailscale <name>` | Configure Tailscale for a bot |
| `approve <name> <channel> <code>` | Approve a channel pairing code |
| `rebuild [name]` | Rebuild the base image and recreate bot containers |
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

### Ollama

The default Ollama model is `minimax-m2.5:cloud`, which runs on MiniMax's servers through Ollama's cloud API — no GPU required.

**1. Install Ollama**

```sh
curl -fsSL https://ollama.com/install.sh | sh
```

Or download from [ollama.com](https://ollama.com).

**2. Log in to Ollama**

```sh
ollama login
```

This authenticates with your Ollama account (required for cloud models).

**3. Pull the model**

```sh
ollama pull minimax-m2.5:cloud
```

**4. Create a bot**

```sh
botdaddy create mybot   # select "Ollama (local)" as the provider
```

Ollama must be running on the host — the container reaches it via `host.internal:11434`.

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

## Tailscale

Add bots to your [Tailscale](https://tailscale.com) network so they're reachable from any device on your tailnet. Each bot gets its own node with hostname `<namespace>-<name>` (e.g. `botdaddy-mybot`).

```sh
# During create:
botdaddy config mybot   # answer yes to Tailscale setup

# Or add to an existing bot:
botdaddy tailscale mybot
```

You'll need a Tailscale auth key or OAuth client secret — generate one at [Tailscale admin](https://login.tailscale.com/admin/settings/keys). The key is saved to `~/.botdaddy/config.json` and shared across all bots.

Once started, the bot's gateway is reachable at `http://<tailscale-ip>:18789` from any device on your tailnet.

## Data Layout

```
~/.botdaddy/config.json     # global defaults (API keys, MM admin token, TS auth key)
botdaddy.json               # bot registry — gitignored
bots/<name>/
  .env                      # env vars (gateway token, API key, dev ports, TS auth)
  openclaw.json             # OpenClaw config (models, channels, gateway)
  .tailscale/               # Tailscale state (persists node identity)
  workspace/                # agent workspace (git repo)
    skills/                 # seeded skills (agent-browser, etc.)
  agents/                   # agent identity and sessions
```

Each bot's data directory is volume-mounted into its container at `/root/.openclaw`.

## Base Image

The base Docker image is a "kitchen sink" build with tooling for multiple project types pre-installed:

- **PHP 8.2, 8.3, 8.4** (via [Ondrej Sury PPA](https://launchpad.net/~ondrej/+archive/ubuntu/php)) with common extensions (mbstring, xml, curl, zip, mysql, sqlite3, pgsql, gd, intl, bcmath, readline, redis, memcached, xdebug)
- **Composer** (PHP package manager)
- **Node.js** (pinned version), **TypeScript**, **tsx**
- **Docker CLI + compose plugin** (for Docker-out-of-Docker)
- **Tailscale** (started conditionally at runtime)
- **[agent-browser](https://github.com/vercel-labs/agent-browser)** with Chromium (headless browser automation for agents)

PHP 8.4 is the default. Switch versions inside a container:

```sh
# Use a specific version directly
php8.2 artisan serve

# Or change the default
update-alternatives --set php /usr/bin/php8.3
```

After modifying the Dockerfile, rebuild all bots:

```sh
botdaddy rebuild          # rebuild image + recreate all containers
botdaddy rebuild mybot    # rebuild image + recreate one container
botdaddy start mybot      # start on the new image
```

## Docker-out-of-Docker

Bots can spawn sibling containers via the host Docker socket (`/var/run/docker.sock`). Each bot is allocated a 10-port dev range for this purpose, documented in its workspace `TOOLS.md`.

## Multi-Instance

Multiple independent stacks can coexist by setting environment variables before running:

```sh
BOTDADDY_NAMESPACE=team2 BOTDADDY_BASE_PORT=20000 BOTDADDY_HOME=~/.botdaddy-team2 botdaddy config mybot
```
