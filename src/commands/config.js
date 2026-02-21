import {
  findBot, addBot, loadRegistry, saveRegistry,
  loadHomeConfig, saveHomeConfig, validateName,
  getStack, getBotDir,
} from '../lib/config.js';
import { allocatePortRange } from '../lib/ports.js';
import { makeRL, ask, askSecret, choose } from '../lib/prompt.js';
import { today } from '../lib/scaffold.js';
import { writeChannelCredential } from '../lib/openclaw.js';
import { provisionMattermostBot } from '../lib/mattermost.js';
import { getProvider, providerLabels, providerFromLabel } from '../lib/providers.js';
import { apply } from './apply.js';

/**
 * Interactive config builder + apply. Works for both new and existing bots.
 * Wizard walks through current values as defaults so you can skip unchanged fields.
 */
export async function config(name) {
  const existing = findBot(name);

  // Validate name for new bots
  if (!existing) {
    const nameErr = validateName(name);
    if (nameErr) {
      console.error(`  Error: ${nameErr}`);
      process.exit(1);
    }
  }

  const rl = makeRL();
  const homeConfig = loadHomeConfig();

  console.log(existing
    ? `\n  Updating config for '${name}'\n`
    : `\n  Configuring new bot '${name}'\n`
  );

  // ── Provider ───────────────────────────────────────────────
  const providerOptions = providerLabels();
  const currentProvider = existing?.provider || '';
  let providerChoice;

  if (currentProvider) {
    const currentDef = getProvider(currentProvider);
    const change = await ask(rl, `  Provider: ${currentDef.label}. Change?`, 'n');
    if (change.toLowerCase() === 'y') {
      providerChoice = await choose(rl, '  AI Provider:', providerOptions);
    } else {
      providerChoice = currentDef.label;
    }
  } else {
    providerChoice = await choose(rl, '  AI Provider:', providerOptions);
  }

  const provider = providerFromLabel(providerChoice);
  const providerDef = getProvider(provider);

  // ── API key ────────────────────────────────────────────────
  // Collected here, written to .env by apply. Global default in ~/.botdaddy/config.json.
  let anthropicKey;
  if (providerDef.needsApiKey) {
    const savedKey = homeConfig.anthropicKey || '';
    if (savedKey) {
      const useDefault = await ask(rl, `  Use saved Anthropic key (${savedKey.slice(0, 8)}...)?`, 'y');
      if (useDefault.toLowerCase() === 'y') {
        anthropicKey = savedKey;
      } else {
        const key = await askSecret('  Anthropic API key for this bot');
        anthropicKey = key || savedKey;
        if (key) {
          const saveGlobal = await ask(rl, '  Also save as new default for future bots?', 'n');
          if (saveGlobal.toLowerCase() === 'y') saveHomeConfig({ anthropicKey: key });
        }
      }
    } else {
      const key = await askSecret('  Anthropic API key');
      if (key) {
        anthropicKey = key;
        const save = await ask(rl, '  Save as default for future bots?', 'y');
        if (save.toLowerCase() === 'y') saveHomeConfig({ anthropicKey: key });
      }
    }
  }

  // ── Model ──────────────────────────────────────────────────
  const model = await ask(rl, '  Model', existing?.model || providerDef.defaultModel);

  // ── Mattermost ─────────────────────────────────────────────
  const currentMM = existing?.mattermost;
  let mattermost;
  let mmAdminUrl = '';
  let mmAdminToken = '';

  if (currentMM) {
    const mmLabel = typeof currentMM === 'string' ? currentMM : 'enabled';
    const change = await ask(rl, `  Mattermost: ${mmLabel}. Change?`, 'n');
    if (change.toLowerCase() === 'y') {
      const disable = await ask(rl, '  Disable Mattermost?', 'n');
      if (disable.toLowerCase() === 'y') {
        mattermost = false;
      } else {
        const url = await ask(rl, '  Mattermost URL', homeConfig.mattermostUrl || '');
        mattermost = url || currentMM;
      }
    } else {
      mattermost = currentMM;
    }
  } else {
    const setup = await ask(rl, '  Set up Mattermost?', 'n');
    if (setup.toLowerCase() === 'y') {
      const savedMmUrl = homeConfig.mattermostUrl || '';
      const savedMmAdmin = homeConfig.mattermostAdminToken || '';

      if (savedMmUrl) {
        const useUrl = await ask(rl, `  Use saved URL (${savedMmUrl})?`, 'y');
        if (useUrl.toLowerCase() === 'y') {
          mmAdminUrl = savedMmUrl;
        } else {
          mmAdminUrl = await ask(rl, '  Mattermost URL (https://...)');
          if (mmAdminUrl && mmAdminUrl !== savedMmUrl) {
            const save = await ask(rl, '  Save as new default?', 'n');
            if (save.toLowerCase() === 'y') saveHomeConfig({ mattermostUrl: mmAdminUrl });
          }
        }
      } else {
        mmAdminUrl = await ask(rl, '  Mattermost URL (https://...)');
        if (mmAdminUrl) {
          const save = await ask(rl, '  Save as default for future bots?', 'y');
          if (save.toLowerCase() === 'y') saveHomeConfig({ mattermostUrl: mmAdminUrl });
        }
      }

      if (savedMmAdmin) {
        const useAdmin = await ask(rl, `  Use saved admin token (${savedMmAdmin.slice(0, 8)}...)?`, 'y');
        if (useAdmin.toLowerCase() === 'y') {
          mmAdminToken = savedMmAdmin;
        } else {
          mmAdminToken = await askSecret('  Mattermost System Admin token');
          if (mmAdminToken && mmAdminToken !== savedMmAdmin) {
            const save = await ask(rl, '  Save as new default?', 'n');
            if (save.toLowerCase() === 'y') saveHomeConfig({ mattermostAdminToken: mmAdminToken });
          }
        }
      } else {
        mmAdminToken = await askSecret('  Mattermost System Admin token');
        if (mmAdminToken) {
          const save = await ask(rl, '  Save as default for future bots?', 'y');
          if (save.toLowerCase() === 'y') saveHomeConfig({ mattermostAdminToken: mmAdminToken });
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
    const change = await ask(rl, '  Telegram: enabled. Change?', 'n');
    if (change.toLowerCase() === 'y') {
      const disable = await ask(rl, '  Disable Telegram?', 'n');
      telegram = disable.toLowerCase() !== 'y';
    } else {
      telegram = true;
    }
  } else {
    const setup = await ask(rl, '  Set up Telegram?', 'n');
    if (setup.toLowerCase() === 'y') {
      console.log('  Create a bot via @BotFather on Telegram, then paste the token here.');
      tgToken = await askSecret('  Telegram bot token');
      telegram = !!tgToken;
    } else {
      telegram = false;
    }
  }

  rl.close();

  // ── Build + save entry ─────────────────────────────────────
  const portInfo = existing
    ? { portSlot: existing.portSlot, gatewayPort: existing.gatewayPort, devPortStart: existing.devPortStart, devPortEnd: existing.devPortEnd }
    : allocatePortRange();

  const entry = {
    name,
    provider,
    portSlot: portInfo.portSlot,
    gatewayPort: portInfo.gatewayPort,
    devPortStart: portInfo.devPortStart,
    devPortEnd: portInfo.devPortEnd,
    mattermost,
    telegram,
    createdAt: existing?.createdAt || today,
  };
  entry.model = model;

  if (existing) {
    const reg = loadRegistry();
    const idx = reg.bots.findIndex(b => b.name === name);
    reg.bots[idx] = entry;
    saveRegistry(reg);
  } else {
    addBot(entry);
  }

  console.log(`  Saved config for '${name}'`);

  // ── Apply ──────────────────────────────────────────────────
  if (anthropicKey) process.env._BOTDADDY_ANTHROPIC_KEY = anthropicKey;
  await apply(name);
  delete process.env._BOTDADDY_ANTHROPIC_KEY;

  // ── Post-apply: channel credentials ───────────────────────
  const botDir = getBotDir(name);

  if (tgToken) {
    writeChannelCredential(botDir, 'telegram', { botToken: tgToken });
  }

  // Provision Mattermost if newly enabled
  const mmNewlyEnabled = !currentMM && mattermost && mmAdminUrl && mmAdminToken;
  if (mmNewlyEnabled) {
    console.log('  Provisioning Mattermost bot...');
    const result = await provisionMattermostBot({
      botName: name,
      mattermostUrl: mmAdminUrl,
      adminToken: mmAdminToken,
    });
    if (result.success) {
      writeChannelCredential(botDir, 'mattermost', {
        botToken: result.token,
        baseUrl: result.baseUrl,
      });
      await apply(name, { quiet: true });
    } else {
      console.log(`  Warning: Mattermost provisioning failed: ${result.error}`);
      console.log('  Retry with: botdaddy mattermost ' + name);
    }
  }

  // ── Summary ────────────────────────────────────────────────
  const stack = getStack();
  const orbDomain = `${stack.namespace}-${name}.orb.local`;
  console.log(`\n  Bot '${name}' ${existing ? 'updated' : 'created'}.`);
  console.log(`  Gateway: http://localhost:${entry.gatewayPort}`);
  console.log(`  OrbStack: https://${orbDomain}`);
  if (!existing) console.log(`  Start with: botdaddy start ${name}`);
  console.log('');
}
