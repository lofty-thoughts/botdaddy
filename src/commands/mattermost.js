import { findBot, getBotDir, loadHomeConfig, saveHomeConfig, loadRegistry, saveRegistry } from '../lib/config.js';
import { p, guard } from '../lib/prompt.js';
import { provisionMattermostBot } from '../lib/mattermost.js';
import { writeChannelCredential } from '../lib/openclaw.js';
import { apply } from './apply.js';

export async function mattermost(name) {
  const bot = findBot(name);
  if (!bot) {
    console.error(`Error: Bot '${name}' not found in botdaddy.json`);
    process.exit(1);
  }

  p.intro(`Mattermost: ${name}`);

  const homeConfig   = loadHomeConfig();
  const savedUrl     = homeConfig.mattermostUrl || '';
  const savedToken   = homeConfig.mattermostAdminToken || '';
  let mattermostUrl  = '';
  let adminToken     = '';

  // ── URL ────────────────────────────────────────────────────
  if (savedUrl) {
    const useSaved = guard(await p.confirm({
      message: `Use saved Mattermost URL (${savedUrl})?`,
      initialValue: true,
    }));
    if (useSaved) {
      mattermostUrl = savedUrl;
    } else {
      mattermostUrl = guard(await p.text({ message: 'Mattermost URL (https://...)' }));
      if (mattermostUrl && mattermostUrl !== savedUrl) {
        const save = guard(await p.confirm({
          message: 'Save as new default for future bots?',
          initialValue: false,
        }));
        if (save) saveHomeConfig({ mattermostUrl });
      }
    }
  } else {
    mattermostUrl = guard(await p.text({ message: 'Mattermost URL (https://...)' }));
    if (mattermostUrl) {
      const save = guard(await p.confirm({
        message: 'Save as default for future bots?',
        initialValue: true,
      }));
      if (save) saveHomeConfig({ mattermostUrl });
    }
  }

  // ── Admin token ────────────────────────────────────────────
  if (savedToken) {
    const useSaved = guard(await p.confirm({
      message: `Use saved admin token (${savedToken.slice(0, 8)}...)?`,
      initialValue: true,
    }));
    if (useSaved) {
      adminToken = savedToken;
    } else {
      adminToken = guard(await p.password({ message: 'Mattermost System Admin token' }));
      if (adminToken && adminToken !== savedToken) {
        const save = guard(await p.confirm({
          message: 'Save as new default for future bots?',
          initialValue: false,
        }));
        if (save) saveHomeConfig({ mattermostAdminToken: adminToken });
      }
    }
  } else {
    adminToken = guard(await p.password({ message: 'Mattermost System Admin token' }));
    if (adminToken) {
      const save = guard(await p.confirm({
        message: 'Save as default for future bots?',
        initialValue: true,
      }));
      if (save) saveHomeConfig({ mattermostAdminToken: adminToken });
    }
  }

  if (!mattermostUrl || !adminToken) {
    p.cancel('Mattermost URL and admin token are both required.');
    process.exit(1);
  }

  // ── Provision ──────────────────────────────────────────────
  const s = p.spinner();
  s.start('Provisioning Mattermost bot...');
  const result = await provisionMattermostBot({ botName: name, mattermostUrl, adminToken });

  if (!result.success) {
    s.stop(`Provisioning failed: ${result.error}`);
    process.exit(1);
  }

  s.stop('Mattermost bot provisioned');

  writeChannelCredential(getBotDir(name), 'mattermost', {
    botToken: result.token,
    baseUrl:  result.baseUrl,
  });

  const reg   = loadRegistry();
  const entry = reg.bots.find(b => b.name === name);
  if (entry) {
    entry.mattermost = mattermostUrl;
    saveRegistry(reg);
  }

  s.start('Applying config...');
  await apply(name, { quiet: true });
  s.stop('Config applied');

  p.outro(`Mattermost configured for '${name}'.`);
}
