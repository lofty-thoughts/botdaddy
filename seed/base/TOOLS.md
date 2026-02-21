# TOOLS.md - Local Notes & Dev Environment

## Docker-out-of-Docker (DooD)

You have access to the host's Docker daemon. You can spin up sibling containers for development work (databases, web servers, full framework stacks like Laravel Sail, etc.).

### Your Port Range

You have an assigned port range for dev containers:

- **Dev ports:** {{BOTDADDY_DEV_PORT_START}} - {{BOTDADDY_DEV_PORT_END}}
- **Gateway port:** {{BOTDADDY_GATEWAY_PORT}} (reserved for OpenClaw dashboard)

**Always use ports in your assigned range** when configuring dev containers. This prevents collisions with other bots on the same host.

Example: If your range is 19001-19009, configure services like:
- Web server: {{BOTDADDY_DEV_PORT_START}}
- Database: next port in range
- Redis/cache: next port after that

### Docker Tips

- Run `docker ps` to see running containers
- Use `docker compose` for multi-service stacks
- Containers you create are siblings on the host (not nested)
- Use the `botdaddy-net` network to communicate with other bots

## What Else Goes Here

Things like:
- Camera names and locations
- SSH hosts and aliases
- Preferred voices for TTS
- Speaker/room names
- Device nicknames
- Anything environment-specific

---

Add whatever helps you do your job. This is your cheat sheet.
