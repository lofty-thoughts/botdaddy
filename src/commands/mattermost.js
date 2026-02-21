import { findBot, getBotDir, loadHomeConfig, saveHomeConfig, loadRegistry, saveRegistry } from '../lib/config.js';
import { makeRL, ask, askSecret } from '../lib/prompt.js';
import { provisionMattermostBot } from '../lib/mattermost.js';
import { writeChannelCredential } from '../lib/openclaw.js';
import { apply } from './apply.js';

export async function mattermost(name) {
  const bot = findBot(name);
  if (!bot) {
    console.error(`  Error: Bot '${name}' not found in botdaddy.json`);
    process.exit(1);
  }

  const rl = makeRL();
  const homeConfig = loadHomeConfig();

  // Collect MM credentials — global defaults with per-bot override
  const savedUrl = homeConfig.mattermostUrl || '';
  const savedToken = homeConfig.mattermostAdminToken || '';
  let mattermostUrl = '';
  let adminToken = '';

  if (savedUrl) {
    const useDefault = await ask(rl, `  Use saved Mattermost URL (${savedUrl})?`, 'y');
    if (useDefault.toLowerCase() === 'y') {
      mattermostUrl = savedUrl;
    } else {
      mattermostUrl = await ask(rl, '  Mattermost URL (https://...)');
      if (mattermostUrl && mattermostUrl !== savedUrl) {
        const saveGlobal = await ask(rl, '  Save as new default for future bots?', 'n');
        if (saveGlobal.toLowerCase() === 'y') saveHomeConfig({ mattermostUrl: mattermostUrl });
      }
    }
  } else {
    mattermostUrl = await ask(rl, '  Mattermost URL (https://...)');
    if (mattermostUrl) {
      const save = await ask(rl, '  Save as default for future bots?', 'y');
      if (save.toLowerCase() === 'y') saveHomeConfig({ mattermostUrl: mattermostUrl });
    }
  }

  if (savedToken) {
    const useDefault = await ask(rl, `  Use saved admin token (${savedToken.slice(0, 8)}...)?`, 'y');
    if (useDefault.toLowerCase() === 'y') {
      adminToken = savedToken;
    } else {
      adminToken = await askSecret('  Mattermost System Admin token');
      if (adminToken && adminToken !== savedToken) {
        const saveGlobal = await ask(rl, '  Save as new default for future bots?', 'n');
        if (saveGlobal.toLowerCase() === 'y') saveHomeConfig({ mattermostAdminToken: adminToken });
      }
    }
  } else {
    adminToken = await askSecret('  Mattermost System Admin token');
    if (adminToken) {
      const save = await ask(rl, '  Save as default for future bots?', 'y');
      if (save.toLowerCase() === 'y') saveHomeConfig({ mattermostAdminToken: adminToken });
    }
  }

  rl.close();

  if (!mattermostUrl || !adminToken) {
    console.error('  Error: Mattermost URL and admin token are both required.');
    process.exit(1);
  }

  // Provision the bot account via MM API
  console.log('  Provisioning Mattermost bot...');
  const result = await provisionMattermostBot({
    botName: name,
    mattermostUrl,
    adminToken,
  });

  if (!result.success) {
    console.error(`  Error: ${result.error}`);
    process.exit(1);
  }

  // Write credentials to openclaw.json channel config
  writeChannelCredential(getBotDir(name), 'mattermost', {
    botToken: result.token,
    baseUrl: result.baseUrl,
  });

  // Update botdaddy.json with MM URL
  const reg = loadRegistry();
  const entry = reg.bots.find(b => b.name === name);
  if (entry) {
    entry.mattermost = mattermostUrl;
    saveRegistry(reg);
  }

  // Apply config (enables plugin, restarts if running)
  await apply(name);

  console.log(`\n  Mattermost configured for '${name}'.`);
}
