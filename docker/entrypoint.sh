#!/bin/sh
# Runtime config from environment variables
# These survive container recreates without needing a rebuild

# Git identity (for workspace backup commits)
git config --global user.name "${GIT_USER_NAME:-Agent}"
git config --global user.email "${GIT_USER_EMAIL:-agent@openclaw.local}"

exec "$@"
