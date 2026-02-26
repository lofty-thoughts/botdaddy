import {
  findBot, addBot, loadRegistry, saveRegistry,
  loadHomeConfig, saveHomeConfig, validateName,
  getStack, getBotDir, getContainerName,
} from '../lib/config.js';
import { allocatePortRange } from '../lib/ports.js';
import { containerExists, containerRunning, stopContainer, removeContainer } from '../lib/docker.js';
import { p, guard } from '../lib/prompt.js';
import { today } from '../lib/scaffold.js';
import { writeChannelCredential } from '../lib/openclaw.js';
import { provisionMattermostBot } from '../lib/mattermost.js';
import { getProvider, providerOptions } from '../lib/providers.js';
import { isMac } from '../lib/platform.js';
import { apply } from './apply.js';

/**
 * Interactive config builder + apply. Works for both new and existing bots.
 */
export async function config(name) {
  const existing = findBot(name);

  if (!existing) {
    const nameErr = validateName(name);
    if (nameErr) {
      p.log.error(nameErr);
      process.exit(1);
    }
  }

  p.intro(existing ? `Update bot: ${name}` : `New bot: ${name}`);

  const homeConfig = loadHomeConfig();

  // ── Provider ───────────────────────────────────────────────
  const provider = guard(await p.select({
    message: 'AI Provider',
    options: providerOptions(),
    initialValue: existing?.provider || 'anthropic',
  }));

  const providerDef = getProvider(provider);

  // ── API key ────────────────────────────────────────────────
  let apiKey;
  if (providerDef.needsApiKey) {
    const savedKey = homeConfig[providerDef.homeConfigKey] || '';
    if (savedKey) {
      const useSaved = guard(await p.confirm({
        message: `Use saved ${providerDef.apiKeyLabel} (${savedKey.slice(0, 8)}...)?`,
        initialValue: true,
      }));
      if (!useSaved) {
        const key = guard(await p.password({ message: providerDef.apiKeyLabel }));
        apiKey = key || savedKey;
        if (key) {
          const save = guard(await p.confirm({
            message: 'Save as new default for future bots?',
            initialValue: false,
          }));
          if (save) saveHomeConfig({ [providerDef.homeConfigKey]: key });
        }
      } else {
        apiKey = savedKey;
      }
    } else {
      const key = guard(await p.password({ message: providerDef.apiKeyLabel }));
      if (key) {
        apiKey = key;
        const save = guard(await p.confirm({
          message: 'Save as default for future bots?',
          initialValue: true,
        }));
        if (save) saveHomeConfig({ [providerDef.homeConfigKey]: key });
      }
    }
  }

  // ── Model ──────────────────────────────────────────────────
  const model = guard(await p.text({
    message: 'Model',
    initialValue: existing?.model || providerDef.defaultModel,
    validate: v => !v.trim() ? 'Model is required' : undefined,
  }));

  // ── Mattermost ─────────────────────────────────────────────
  const currentMM = existing?.mattermost;
  let mattermost;
  let mmAdminUrl = '';
  let mmAdminToken = '';

  if (currentMM) {
    const mmLabel = typeof currentMM === 'string' ? currentMM : 'enabled';
    const change = guard(await p.confirm({
      message: `Mattermost: ${mmLabel}. Change?`,
      initialValue: false,
    }));
    if (change) {
      const disable = guard(await p.confirm({
        message: 'Disable Mattermost?',
        initialValue: false,
      }));
      if (disable) {
        mattermost = false;
      } else {
        const url = guard(await p.text({
          message: 'Mattermost URL',
          initialValue: homeConfig.mattermostUrl || (typeof currentMM === 'string' ? currentMM : ''),
        }));
        mattermost = url || currentMM;
      }
    } else {
      mattermost = currentMM;
    }
  } else {
    const setup = guard(await p.confirm({
      message: 'Set up Mattermost?',
      initialValue: false,
    }));
    if (setup) {
      const savedMmUrl = homeConfig.mattermostUrl || '';
      const savedMmAdmin = homeConfig.mattermostAdminToken || '';

      if (savedMmUrl) {
        const useUrl = guard(await p.confirm({
          message: `Use saved Mattermost URL (${savedMmUrl})?`,
          initialValue: true,
        }));
        if (useUrl) {
          mmAdminUrl = savedMmUrl;
        } else {
          mmAdminUrl = guard(await p.text({ message: 'Mattermost URL (https://...)' }));
          if (mmAdminUrl && mmAdminUrl !== savedMmUrl) {
            const save = guard(await p.confirm({
              message: 'Save as new default?',
              initialValue: false,
            }));
            if (save) saveHomeConfig({ mattermostUrl: mmAdminUrl });
          }
        }
      } else {
        mmAdminUrl = guard(await p.text({ message: 'Mattermost URL (https://...)' }));
        if (mmAdminUrl) {
          const save = guard(await p.confirm({
            message: 'Save as default for future bots?',
            initialValue: true,
          }));
          if (save) saveHomeConfig({ mattermostUrl: mmAdminUrl });
        }
      }

      if (savedMmAdmin) {
        const useAdmin = guard(await p.confirm({
          message: `Use saved admin token (${savedMmAdmin.slice(0, 8)}...)?`,
          initialValue: true,
        }));
        if (useAdmin) {
          mmAdminToken = savedMmAdmin;
        } else {
          mmAdminToken = guard(await p.password({ message: 'Mattermost System Admin token' }));
          if (mmAdminToken && mmAdminToken !== savedMmAdmin) {
            const save = guard(await p.confirm({
              message: 'Save as new default?',
              initialValue: false,
            }));
            if (save) saveHomeConfig({ mattermostAdminToken: mmAdminToken });
          }
        }
      } else {
        mmAdminToken = guard(await p.password({ message: 'Mattermost System Admin token' }));
        if (mmAdminToken) {
          const save = guard(await p.confirm({
            message: 'Save as default for future bots?',
            initialValue: true,
          }));
          if (save) saveHomeConfig({ mattermostAdminToken: mmAdminToken });
        }
      }

      if (mmAdminUrl && mmAdminToken) mattermost = mmAdminUrl;
    } else {
      mattermost = false;
    }
  }

  // ── Telegram ───────────────────────────────────────────────
  const currentTG = existing?.telegram;
  let telegram;
  let tgToken = '';

  if (currentTG) {
    const change = guard(await p.confirm({
      message: 'Telegram: enabled. Change?',
      initialValue: false,
    }));
    if (change) {
      const disable = guard(await p.confirm({
        message: 'Disable Telegram?',
        initialValue: false,
      }));
      telegram = !disable;
    } else {
      telegram = true;
    }
  } else {
    const setup = guard(await p.confirm({
      message: 'Set up Telegram?',
      initialValue: false,
    }));
    if (setup) {
      p.log.info('Create a bot via @BotFather on Telegram, then paste the token here.');
      tgToken = guard(await p.password({ message: 'Telegram bot token' }));
      telegram = !!tgToken;
    } else {
      telegram = false;
    }
  }

  // ── Tailscale ────────────────────────────────────────────────
  const currentTS = existing?.tailscale;
  let tailscale;

  if (currentTS) {
    const change = guard(await p.confirm({
      message: 'Tailscale: enabled. Change?',
      initialValue: false,
    }));
    if (change) {
      const disable = guard(await p.confirm({
        message: 'Disable Tailscale?',
        initialValue: false,
      }));
      tailscale = !disable;
    } else {
      tailscale = true;
    }
  } else {
    const setup = guard(await p.confirm({
      message: 'Set up Tailscale?',
      initialValue: false,
    }));
    if (setup) {
      const savedTsKey = homeConfig.tailscaleAuthKey || '';
      if (savedTsKey) {
        const useSaved = guard(await p.confirm({
          message: `Use saved Tailscale auth key (${savedTsKey.slice(0, 8)}...)?`,
          initialValue: true,
        }));
        if (!useSaved) {
          const key = guard(await p.password({ message: 'Tailscale auth key or OAuth client secret' }));
          if (key) {
            const save = guard(await p.confirm({
              message: 'Save as new default for future bots?',
              initialValue: false,
            }));
            if (save) saveHomeConfig({ tailscaleAuthKey: key });
          }
        }
      } else {
        p.log.info('Generate an auth key at https://login.tailscale.com/admin/settings/keys');
        const key = guard(await p.password({ message: 'Tailscale auth key or OAuth client secret' }));
        if (key) {
          saveHomeConfig({ tailscaleAuthKey: key });
          p.log.step('Auth key saved for all bots');
        }
      }
      tailscale = true;
    } else {
      tailscale = false;
    }
  }

  // ── Build + save entry ─────────────────────────────────────
  const portInfo = existing
    ? { portSlot: existing.portSlot, gatewayPort: existing.gatewayPort, devPortStart: existing.devPortStart, devPortEnd: existing.devPortEnd }
    : allocatePortRange();

  const entry = {
    name,
    provider,
    portSlot:     portInfo.portSlot,
    gatewayPort:  portInfo.gatewayPort,
    devPortStart: portInfo.devPortStart,
    devPortEnd:   portInfo.devPortEnd,
    mattermost,
    telegram,
    tailscale,
    createdAt: existing?.createdAt || today,
    model,
  };

  if (existing) {
    const reg = loadRegistry();
    const idx = reg.bots.findIndex(b => b.name === name);
    reg.bots[idx] = entry;
    saveRegistry(reg);
  } else {
    addBot(entry);
  }

  // ── Apply ──────────────────────────────────────────────────
  if (apiKey) process.env._BOTDADDY_API_KEY = apiKey;

  const s = p.spinner();
  s.start('Applying config...');
  await apply(name, { quiet: true, spinner: s });
  s.stop('Config applied');

  delete process.env._BOTDADDY_API_KEY;

  // ── Post-apply: recreate container if Tailscale status changed
  const tsChanged = existing && (!!currentTS !== !!tailscale);
  if (tsChanged) {
    const containerName = getContainerName(name);
    if (containerExists(containerName)) {
      s.start('Removing container (Tailscale capabilities changed)...');
      if (containerRunning(containerName)) stopContainer(containerName);
      removeContainer(containerName);
      s.stop('Container removed — restart with: botdaddy start ' + name);
    }
  }

  // ── Post-apply: channel credentials ───────────────────────
  const botDir = getBotDir(name);

  if (tgToken) {
    writeChannelCredential(botDir, 'telegram', { botToken: tgToken });
  }

  // Provision Mattermost if newly enabled
  const mmNewlyEnabled = !currentMM && mattermost && mmAdminUrl && mmAdminToken;
  if (mmNewlyEnabled) {
    s.start('Provisioning Mattermost bot...');
    const result = await provisionMattermostBot({
      botName: name,
      mattermostUrl: mmAdminUrl,
      adminToken: mmAdminToken,
    });
    if (result.success) {
      s.stop('Mattermost provisioned');
      writeChannelCredential(botDir, 'mattermost', {
        botToken: result.token,
        baseUrl: result.baseUrl,
      });
      await apply(name, { quiet: true });
    } else {
      s.stop(`Mattermost provisioning failed: ${result.error}`);
      p.log.warn(`Retry with: botdaddy mattermost ${name}`);
    }
  }

  // ── Post-setup hint (e.g. OAuth login) ───────────────────
  if (providerDef.postSetupHint) {
    p.log.info(providerDef.postSetupHint.replaceAll('{name}', name));
  }

  // ── Summary ────────────────────────────────────────────────
  const stack = getStack();
  const lines = [
    `Gateway:  http://localhost:${entry.gatewayPort}`,
  ];
  if (isMac) {
    lines.push(`OrbStack: https://${stack.namespace}-${name}.orb.local`);
  }
  if (tailscale) lines.push(`Tailscale: ${stack.namespace}-${name}`);
  if (!existing || tsChanged) lines.push(`Start with: botdaddy start ${name}`);

  p.outro(`Bot '${name}' ${existing ? 'updated' : 'created'}.\n\n  ${lines.join('\n  ')}`);
}
