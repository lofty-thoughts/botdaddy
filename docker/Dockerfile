FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
ENV NVM_DIR=/root/.nvm

RUN apt-get update && apt-get install -y \
    curl \
    git \
    build-essential \
    lsof \
    ssh \
    jq \
    ca-certificates \
    gnupg \
    unzip \
    python3 \
    python3-pip \
    python3-venv \
    ripgrep \
    tree \
    socat \
    libvips-dev \
    postgresql-client \
    default-mysql-client \
    redis-tools \
    && rm -rf /var/lib/apt/lists/*

# Ondrej Sury PHP PPA (multiple PHP versions side by side)
RUN apt-get update && apt-get install -y software-properties-common \
    && add-apt-repository -y ppa:ondrej/php \
    && rm -rf /var/lib/apt/lists/*

# PHP 8.2, 8.3, 8.4 CLI + common extensions
RUN apt-get update && apt-get install -y \
    php8.2-cli php8.2-mbstring php8.2-xml php8.2-curl php8.2-zip \
    php8.2-mysql php8.2-sqlite3 php8.2-pgsql php8.2-gd php8.2-intl \
    php8.2-bcmath php8.2-readline php8.2-redis php8.2-memcached \
    php8.2-xdebug \
    php8.3-cli php8.3-mbstring php8.3-xml php8.3-curl php8.3-zip \
    php8.3-mysql php8.3-sqlite3 php8.3-pgsql php8.3-gd php8.3-intl \
    php8.3-bcmath php8.3-readline php8.3-redis php8.3-memcached \
    php8.3-xdebug \
    php8.4-cli php8.4-mbstring php8.4-xml php8.4-curl php8.4-zip \
    php8.4-mysql php8.4-sqlite3 php8.4-pgsql php8.4-gd php8.4-intl \
    php8.4-bcmath php8.4-readline php8.4-redis php8.4-memcached \
    php8.4-xdebug \
    && rm -rf /var/lib/apt/lists/*

# Default to PHP 8.4 (switch with: update-alternatives --set php /usr/bin/php8.x)
RUN update-alternatives --set php /usr/bin/php8.4

# Composer (PHP package manager)
RUN curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer

# Docker CLI + compose plugin (client only — daemon runs on host via DooD)
RUN install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
    && chmod a+r /etc/apt/keyrings/docker.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu noble stable" \
       > /etc/apt/sources.list.d/docker.list \
    && apt-get update \
    && apt-get install -y docker-ce-cli docker-compose-plugin \
    && rm -rf /var/lib/apt/lists/*

# GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      > /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
       > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update \
    && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

# Tailscale (started conditionally at runtime via entrypoint.sh)
RUN curl -fsSL https://pkgs.tailscale.com/stable/ubuntu/noble.noarmor.gpg \
      > /usr/share/keyrings/tailscale-archive-keyring.gpg \
    && curl -fsSL https://pkgs.tailscale.com/stable/ubuntu/noble.tailscale-keyring.list \
      > /etc/apt/sources.list.d/tailscale.list \
    && apt-get update \
    && apt-get install -y tailscale \
    && rm -rf /var/lib/apt/lists/*

# Cursor remote terminal sandbox (AppArmor profile for user namespaces)
RUN curl -fsSL https://downloads.cursor.com/lab/enterprise/cursor-sandbox-apparmor_0.2.0_all.deb -o /tmp/cursor-sandbox-apparmor.deb \
    && dpkg -i /tmp/cursor-sandbox-apparmor.deb \
    && rm /tmp/cursor-sandbox-apparmor.deb

# Node.js (latest LTS via nvm) + global npm packages
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh | bash \
    && . $NVM_DIR/nvm.sh \
    && nvm install --lts \
    && nvm use --lts \
    && npm install -g openclaw typescript tsx agent-browser @anthropic-ai/claude-code \
    && ln -s $(which node) /usr/local/bin/node \
    && ln -s $(which npm) /usr/local/bin/npm \
    && ln -s $(which npx) /usr/local/bin/npx \
    && ln -s $(which openclaw) /usr/local/bin/openclaw \
    && ln -s $(which tsc) /usr/local/bin/tsc \
    && ln -s $(which tsx) /usr/local/bin/tsx \
    && ln -s $(which agent-browser) /usr/local/bin/agent-browser \
    && ln -s $(which claude) /usr/local/bin/claude

# agent-browser: download Chromium + install Linux system dependencies
RUN . $NVM_DIR/nvm.sh && agent-browser install --with-deps

WORKDIR /root/.openclaw
EXPOSE 18789

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["openclaw", "gateway", "--bind", "lan", "--port", "18789"]
