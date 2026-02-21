# Botdaddy — Implementation Plan

## Context

Botdaddy is a Node CLI that creates repeatable, predictable, isolated OpenClaw agent instances in Docker containers. Each bot gets its own container (via OrbStack), its own workspace, its own config, and optionally a Mattermost bot account. Bots can spin up dev containers (Laravel Sail, Node, Astro, etc.) via Docker-out-of-Docker (DooD). The whole fleet is git-trackable for backup.

An existing project at `/Users/galen/peeps/` solves ~70% of this — Mattermost provisioning, config generation, seed files, the onboard-reset workaround. Botdaddy restructures this into a proper CLI and adds DooD + port allocation.

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Host (Mac + OrbStack)                          │
│                                                 │
│  botdaddy CLI (Node)                            │
│    ├── botdaddy create/start/stop/ls/destroy    │
│    └── manages Docker via CLI                   │
│                                                 │
│  ./bots/jarvis/  ──volume mount──►  Container   │
│  ./bots/alfred/  ──volume mount──►  Container   │
│                                                 │
│  /var/run/docker.sock ──mount──► each container │
│  (DooD: bots can spawn sibling dev containers)  │
└─────────────────────────────────────────────────┘
```

---

## Project Structure

```
botdaddy/
  package.json              # ESM, commander dep, node >=22
  bin/botdaddy.js           # CLI entry (#!/usr/bin/env node)
  src/
    cli.js                  # Commander setup, command routing
    commands/
      create.js             # Interactive wizard
      start.js              # docker start / docker run
      stop.js               # docker stop
      logs.js               # docker logs -f
      ls.js                 # List bots + Docker status
      destroy.js            # Stop, remove container, optionally delete files
      shell.js              # docker exec -it bash
    lib/
      config.js             # botdaddy.json read/write, bot lookup
      docker.js             # Docker CLI wrapper (run, stop, inspect, exec)
      ports.js              # Port range allocation
      mattermost.js         # MM API: create bot, generate token
      scaffold.js           # Directory creation, file templating
      openclaw.js           # openclaw.json + auth-profiles generation
      prompt.js             # Readline helpers (ask, askSecret, choose)
  docker/
    Dockerfile              # Base image: Ubuntu + Node 22 + OpenClaw + Docker CLI
    entrypoint.sh           # Git config from env vars
  seed/
    base/                   # Workspace seed files (SOUL.md, IDENTITY.md, etc.)
    personalities/          # Optional personality presets
    openclaw.json.template  # Per-bot config template
    env.template            # Per-bot .env template
  botdaddy.json             # Bot registry (ports, names, metadata)
```

---

## Dockerfile (Base Image)

All bots share one image. Key components:
- **Ubuntu 24.04** base
- **Node >= 22** via nvm (pinned version)
- **OpenClaw** installed globally (`npm install -g openclaw@latest`)
- **Docker CLI + docker-compose-plugin** (for DooD — no daemon, just the client)
- **Git, curl, jq** for general utility
- **Entrypoint** sets git user from env vars, then runs `openclaw gateway --bind lan --port 18789`
- Exposes port **18789** (OpenClaw gateway)

Ported from `/Users/galen/peeps/Dockerfile` with Docker CLI added.

---

## Bot Directory Structure

Each bot scaffolded at `./bots/<name>/`, volume-mounted to `/root/.openclaw/` in the container:

```
bots/<name>/
  .env                     # Secrets: API keys, gateway token, MM bot token
  openclaw.json            # OpenClaw config
  agents/                  # Created by onboard
  workspace/               # Git repo — the bot's soul + memory
    .git/
    .gitignore
    SOUL.md
    IDENTITY.md
    USER.md
    AGENTS.md
    TOOLS.md
    HEARTBEAT.md
    MEMORY.md
    BOOTSTRAP.md
    memory/                # Daily logs (YYYY-MM-DD.md)
  identity/                # Created by onboard
```

---

## Port Allocation

Each bot gets a **10-port range** starting from port 19000:

| Bot # | Gateway | Dev Ports |
|-------|---------|-----------|
| 0     | 19000   | 19001-19009 |
| 1     | 19010   | 19011-19019 |
| 2     | 19020   | 19021-19029 |

- Gateway port = OpenClaw dashboard (accessible via Tailscale at `http://<host-ip>:<port>`)
- Dev ports = for containers the bot spins up (Laravel on 19001, MySQL on 19002, etc.)
- Port range communicated to bot via env vars: `BOTDADDY_DEV_PORT_START`, `BOTDADDY_DEV_PORT_END`
- Bot's TOOLS.md instructs the agent to use ports in its assigned range

On OrbStack, bots also get `<name>.orb.local` domains via Docker labels.

---

## CLI Commands

### `botdaddy create <name>`
Interactive wizard:
1. Validate name (alphanumeric + hyphens, no collisions)
2. Check prerequisites (Docker running, base image built — build if missing)
3. Choose AI provider (Anthropic / OpenAI / Ollama) + collect API key
4. Optional Mattermost setup (URL, admin token → create bot via API, get bot token)
5. Allocate port range
6. Scaffold `./bots/<name>/` with seed files + generated configs
7. `git init` in workspace
8. Register in `botdaddy.json`
9. Run onboard (`docker run --rm` to create identity)
10. Fix config after onboard (it resets gateway.bind and token — known issue from peeps)
11. Optionally start the bot

### `botdaddy start <name>`
- If container exists but stopped: `docker start`
- If no container: `docker run -d` with all mounts, port maps, labels
- Wait for gateway to respond, print dashboard URL

### `botdaddy stop <name>` — `docker stop`
### `botdaddy logs <name>` — `docker logs -f`
### `botdaddy shell <name>` — `docker exec -it bash`

### `botdaddy ls`
Table of all bots from `botdaddy.json` + live Docker status:
```
NAME       STATUS     UPTIME    GATEWAY
jarvis     running    2h 15m    https://jarvis.orb.local
alfred     exited     —         http://localhost:19010
```

### `botdaddy destroy <name>`
1. Confirm by typing bot name
2. Stop + remove container
3. Optionally delete `./bots/<name>/`
4. Remove from `botdaddy.json`
5. Note: does NOT delete the Mattermost bot account (manual cleanup)

---

## Mattermost Bot Creation

Ported from `/Users/galen/peeps/scripts/lib/shared.js` (`provisionMattermostBotDirect`):

1. `POST /api/v4/bots` with admin token → create bot account
2. Handle 409 (already exists) → `GET /api/v4/users/username/<name>` to get user_id
3. `POST /api/v4/users/<user_id>/tokens` → generate access token
4. Write `MATTERMOST_BOT_TOKEN` and `MATTERMOST_URL` to `.env`
5. Add `channels.mattermost` section to `openclaw.json`
6. After container starts: `docker exec botdaddy-<name> openclaw plugins install @openclaw/mattermost`

---

## Git Tracking / Backup Strategy

**Tracked** (bot's soul — the important stuff):
- `bots/<name>/workspace/` contents: SOUL.md, IDENTITY.md, MEMORY.md, memory/*.md, etc.
- `bots/<name>/openclaw.json` (non-secret config)

**Gitignored**:
- `bots/*/.env` (secrets)
- `bots/*/agents/` (session transcripts — large, ephemeral)
- `bots/*/identity/` (device auth — machine-specific)
- `*.sqlite` (vector indices — regenerable)

Each bot's `workspace/` is also its own git repo (OpenClaw uses git internally). The parent botdaddy repo tracks everything, so one `git push` backs up the whole fleet.

---

## Docker-out-of-Docker (DooD)

- Host's `/var/run/docker.sock` mounted into each bot container
- Docker CLI + compose plugin installed in the base image
- When a bot runs `docker compose up` (e.g., Laravel Sail), containers are **siblings on the host** — not nested
- Bot's `TOOLS.md` documents available port range so the agent configures dev frameworks correctly
- All bot containers join a shared `botdaddy-net` Docker network

---

## Multi-Instance Support

Two copies of botdaddy on the same machine (e.g., dev + production) must not collide. All host-level resources are namespaced:

- **`BOTDADDY_HOME`** env var (default: `~/.botdaddy`): Location of user-level secrets config. Set `BOTDADDY_HOME=~/.botdaddy-dev` for a second instance.
- **`stack.namespace`** in `botdaddy.json` (default: `botdaddy`): Prefixes all Docker resources:
  - Container names: `<namespace>-<botname>` (e.g., `botdaddy-jarvis` vs `botdaddy-dev-jarvis`)
  - Docker network: `<namespace>-net`
  - OrbStack domains: `<namespace>-<botname>.orb.local`
- **`stack.basePort`** in `botdaddy.json` (default: `19000`): Starting port for allocation. Second instance uses e.g., `20000` to avoid collisions.
- **`stack.dataRoot`** in `botdaddy.json` (default: `./bots`): Already configurable.
- **`stack.imageName`** in `botdaddy.json` (default: `botdaddy-base`): Already configurable.

A second instance only needs different values for `namespace`, `basePort`, and `BOTDADDY_HOME`.

---

## Config & Secrets

- **`botdaddy.json`** (project root): Bot registry — names, ports, metadata. Committed to git.
- **`$BOTDADDY_HOME/config.json`** (default `~/.botdaddy/config.json`): Shared secrets — default API keys, Mattermost admin token. `chmod 600`. Not in any repo.
- **`bots/<name>/.env`**: Per-bot secrets. Gitignored.

---

## Code to Port from Peeps

| Source (`peeps/scripts/lib/shared.js`) | Target | Notes |
|---|---|---|
| `makeRL()`, `ask()`, `askSecret()` | `src/lib/prompt.js` | Direct port |
| `validateName()` | `src/lib/config.js` | Change paths |
| `genToken()` | `src/lib/scaffold.js` | Direct port |
| `templateFile()`, `writeEnvFile()` | `src/lib/scaffold.js` | Add DooD env vars |
| `writeOpenClawConfig()`, `writeAuthProfiles()` | `src/lib/openclaw.js` | Direct port |
| `addMattermostToConfig()`, `enableMattermostPlugin()` | `src/lib/openclaw.js` | docker exec instead of compose |
| `provisionMattermostBotDirect()` | `src/lib/mattermost.js` | Direct port |
| `copyPersonalitySeed()`, `resolveCatalogItem()` | `src/lib/scaffold.js` | Rename @peeps → @botdaddy |
| Onboard + config fixup pattern | `src/commands/create.js` | From peeps create-itguy.js |

---

## Known Issues to Handle

1. **Onboard resets config**: OpenClaw's `onboard --non-interactive` overwrites `gateway.bind` to `loopback` and regenerates the token. Must re-patch after onboard (peeps has this workaround).
2. **Device pairing bug** (peeps `KNOWN-ISSUES.md`, PR #16310): May need to patch OpenClaw dist files. Check if still needed.

---

## Implementation Phases

### Phase 1 — Skeleton + Base Image
- `package.json`, `bin/botdaddy.js`, `src/cli.js` with commander
- `docker/Dockerfile` + `docker/entrypoint.sh`
- `src/commands/create.js` (minimal — hardcoded provider, no wizard)
- `src/commands/start.js`, `src/commands/stop.js`
- `src/lib/config.js`, `src/lib/docker.js`
- Copy seed files from peeps, rebrand

### Phase 2 — Full CLI
- `ls`, `logs`, `shell`, `destroy` commands
- `src/lib/ports.js` (port allocation)
- `src/lib/prompt.js` (readline helpers)

### Phase 3 — Interactive Wizard + Mattermost
- Full wizard in `create.js` (provider choice, MM setup, personality)
- `src/lib/mattermost.js`
- `src/lib/scaffold.js` (seed copy + templating)
- `src/lib/openclaw.js` (config generation)

### Phase 4 — DooD + Polish
- Port range env injection + TOOLS.md documentation for bots
- `botdaddy-net` Docker network management
- Testing with Laravel Sail
- Error handling, edge cases

---

## Verification

1. `botdaddy create testbot` → scaffolds directory, generates configs, builds image if needed
2. `botdaddy start testbot` → container runs, gateway responds at assigned port
3. Dashboard accessible at `https://testbot.orb.local` (OrbStack) and `http://localhost:19000` (Tailscale)
4. Bot can receive messages via Mattermost (if configured)
5. `botdaddy shell testbot` → exec into container, run `docker ps` to verify DooD works
6. Bot can `docker compose up` a Laravel Sail project, accessible on its dev port range
7. `botdaddy ls` shows correct status
8. `botdaddy stop testbot` + `botdaddy start testbot` → bot resumes with memory intact
9. `git log` in `bots/testbot/workspace/` shows tracked changes
10. `botdaddy destroy testbot` → cleans up container + files
