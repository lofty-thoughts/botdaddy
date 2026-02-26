# Botdaddy Config Flow

## Where Config Lives

```
HOST MACHINE
═══════════════════════════════════════════════════════════════════════

~/.botdaddy/config.json                    (global defaults)
┌─────────────────────────────┐
│ anthropicKey    (default)   │
│ openaiKey       (default)   │
│ mattermostUrl               │
│ mattermostAdminToken        │
│ tailscaleAuthKey            │
└─────────────────────────────┘

botdaddy.json                              (bot registry — gitignored)
┌─────────────────────────────┐
│ stack: namespace, basePort  │
│ bots[]:                     │
│   name, provider, model     │
│   portSlot, gatewayPort     │
│   devPortStart/End          │
│   mattermost (url|bool)     │
│   telegram (bool)           │
│   tailscale (bool)          │
│   createdAt                 │
└─────────────────────────────┘

bots/<name>/                               (per-bot data — gitignored)
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  .env                         (container env vars)              │
│  ┌───────────────────────────────────────────┐                  │
│  │ OPENCLAW_GATEWAY_TOKEN                    │                  │
│  │ GIT_USER_NAME / GIT_USER_EMAIL            │                  │
│  │ ANTHROPIC_API_KEY  ◄── per-bot key        │
│  │ OPENAI_API_KEY     ◄── per-bot key        │                  │
│  │ BOTDADDY_DEV_PORT_START/END               │                  │
│  │ TS_AUTHKEY         ◄── if tailscale      │                  │
│  │ TS_HOSTNAME                               │                  │
│  └───────────────────────────────────────────┘                  │
│                                                                 │
│  openclaw.json                (OpenClaw config — single source) │
│  ┌───────────────────────────────────────────┐                  │
│  │ gateway: port, bind, auth.token, proxies  │                  │
│  │ agents.defaults: model, models, subagents │                  │
│  │ models.providers:  ◄── ollama endpoint    │                  │
│  │ channels:                                 │                  │
│  │   telegram: { botToken, enabled, ... }    │                  │
│  │   mattermost: { botToken, baseUrl, ... }  │                  │
│  │ plugins.entries: { telegram, mattermost } │                  │
│  └───────────────────────────────────────────┘                  │
│                                                                 │
│  .tailscale/         (Tailscale state — if enabled)              │
│  workspace/          (agent workspace — git repo)               │
│  agents/main/agent/  (identity, device.json)                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
        │
        │  docker run -v bots/<name>:/root/.openclaw --env-file .env
        ▼
CONTAINER (/root/.openclaw)
═══════════════════════════════════════════════════════════════════════
  Same files — volume-mounted, not copied.
  OpenClaw reads openclaw.json + env vars at startup.
```

## CRUD Operations — What Writes Where

```
botdaddy config <name>        (create OR update — same command)
  ┌──────────────────────────────────────────────────┐
  │  wizard               → botdaddy.json            │
  │       ↓                                          │
  │  apply(name)          → .env, openclaw.json      │
  │       ↓                                          │
  │  write TG botToken    → openclaw.json (if new)   │
  │       ↓                                          │
  │  provision MM (API)   → openclaw.json (if new)   │
  │       ↓                                          │
  │  apply(name) again    → restart container        │
  └──────────────────────────────────────────────────┘

botdaddy apply [name]
  reads:  botdaddy.json + ~/.botdaddy/config.json
  writes: bots/<name>/.env           (env vars, provider API key)
          bots/<name>/openclaw.json  (models, channels, gateway, plugins)
          bots/<name>/workspace/     (seed files — first run only)
  runs:   openclaw onboard           (first run only — in container)
  action: docker stop + start        (if container running)
  note:   applies to all bots if no name given

botdaddy telegram <name>
  writes: openclaw.json channels.telegram.botToken
  calls:  apply → enables plugin, restarts

botdaddy mattermost <name>
  calls:  MM REST API (create bot, get token)
  writes: openclaw.json channels.mattermost.{botToken, baseUrl}
          botdaddy.json (mattermost URL)
  calls:  apply → enables plugin, restarts

botdaddy tailscale <name>
  removes:  container (capabilities change requires recreation)
  writes: botdaddy.json (tailscale: true)
  calls:  apply → writes TS_AUTHKEY/TS_HOSTNAME to .env

botdaddy rebuild [name]
  rebuilds: Docker image from docker/Dockerfile
  removes:  all containers (or one if name given)
  note:     containers must be restarted with `botdaddy start`

botdaddy start [name]
  reads:  botdaddy.json (ports, name)
  action: docker run (mounts bots/<name>/ → /root/.openclaw)
  note:   starts all bots if no name given

botdaddy destroy <name>
  action: tailscale logout (if enabled), docker stop + rm
  optional: rm -rf bots/<name>/
```

## Credential Flow

```
Anthropic key:
  ~/.botdaddy/config.json → config wizard → .env ANTHROPIC_API_KEY
  (global default)           (per-bot)       (read by OpenClaw via env)

OpenAI key:
  ~/.botdaddy/config.json → config wizard → .env OPENAI_API_KEY
  (global default)           (per-bot)       (read by OpenClaw via env)

OpenAI Codex (subscription):
  No API key — uses OAuth. After starting the bot:
  botdaddy shell <name> → openclaw models auth login --provider openai-codex

Telegram token:
  BotFather → config wizard or telegram cmd → openclaw.json botToken
              (user pastes)                   (read by OpenClaw directly)

Mattermost token:
  MM REST API → create or mattermost cmd → openclaw.json botToken+baseUrl
  (provisioned)                            (read by OpenClaw directly)

Gateway token:
  genToken() → .env + openclaw.json gateway.auth.token
               (both written by apply, synced by fixConfigAfterOnboard)

Ollama endpoint:
  hardcoded → openclaw.json models.providers.ollama.{baseUrl, apiKey}
              (read by OpenClaw directly)

Tailscale auth key:
  Tailscale admin → config wizard or tailscale cmd → ~/.botdaddy/config.json
  (generate key)    (user pastes, saved globally)     ↓
                                                    apply → .env TS_AUTHKEY
                                                            (read by entrypoint.sh)
```
