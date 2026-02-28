#!/bin/sh
# Runtime config from environment variables
# These survive container recreates without needing a rebuild

# Git identity (for workspace backup commits)
git config --global user.name "${GIT_USER_NAME:-Agent}"
git config --global user.email "${GIT_USER_EMAIL:-agent@openclaw.local}"

# ── Tailscale (only if auth key is provided) ────────────────
if [ -n "$TS_AUTHKEY" ]; then
  mkdir -p /var/lib/tailscale
  tailscaled --state=/var/lib/tailscale/tailscaled.state &

  # Wait for tailscaled socket (up to 10s)
  for i in $(seq 1 20); do
    [ -e /var/run/tailscale/tailscaled.sock ] && break
    sleep 0.5
  done

  if [ -e /var/run/tailscale/tailscaled.sock ]; then
    tailscale up \
      --authkey="$TS_AUTHKEY" \
      --hostname="${TS_HOSTNAME:-$(hostname)}" \
      --accept-routes \
      --ssh \
      --reset \
      --timeout=30s \
      2>&1 || echo "[botdaddy] Tailscale: failed to connect (non-fatal)"
  else
    echo "[botdaddy] Tailscale: tailscaled did not start (non-fatal)"
  fi
fi

# ── Dev server proxy (only if target is provided) ─────────
if [ -n "$PROXY_TARGET" ]; then
  echo "[botdaddy] Proxy: forwarding :${PROXY_LISTEN_PORT:-80} -> ${PROXY_TARGET}"
  socat TCP-LISTEN:${PROXY_LISTEN_PORT:-80},fork,reuseaddr TCP:${PROXY_TARGET} &
fi

exec "$@"
