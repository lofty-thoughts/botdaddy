import { findBot, getBotDir, getContainerName, loadHomeConfig, saveHomeConfig, loadRegistry, saveRegistry } from '../lib/config.js';
import { containerRunning, execInContainer } from '../lib/docker.js';
import { makeRL, ask, askSecret } from '../lib/prompt.js';
import { provisionMattermostBot } from '../lib/mattermost.js';
import { writeAuthProfiles, addMattermostToConfig } from '../lib/openclaw.js';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export async function mattermost(name) {
  const bot = findBot(name);
  if (!bot) {
    console.error(`  Error: Bot '${name}' not found in botdaddy.json`);
    process.exit(1);
  }

  const botDir = getBotDir(name);
  const rl = makeRL();
  const homeConfig = loadHomeConfig();

  // Collect MM credentials
  let mattermostUrl = homeConfig.mattermostUrl || '';
  let adminToken = homeConfig.mattermostAdminToken || '';

  if (mattermostUrl) {
    const useExisting = await ask(rl, `  Use saved Mattermost URL (${mattermostUrl})?`, 'y');
    if (useExisting.toLowerCase() !== 'y') mattermostUrl = '';
  }
  if (!mattermostUrl) {
    mattermostUrl = await ask(rl, '  Mattermost URL (https://...)');
  }

  if (adminToken) {
    const useExisting = await ask(rl, `  Use saved admin token (${adminToken.slice(0, 8)}...)?`, 'y');
    if (useExisting.toLowerCase() !== 'y') adminToken = '';
  }
  if (!adminToken) {
    adminToken = await askSecret('  Mattermost System Admin token');
  }

  rl.close();

  if (!mattermostUrl || !adminToken) {
    console.error('  Error: Mattermost URL and admin token are both required.');
    process.exit(1);
  }

  // Save credentials for future use
  saveHomeConfig({ mattermostUrl, mattermostAdminToken: adminToken });

  // Provision the bot
  console.log('  Provisioning Mattermost bot...');
  const result = await provisionMattermostBot({
    botName: name,
    mattermostUrl,
    adminToken,
    botDir,
  });

  if (!result.success) {
    console.error(`  Error: ${result.error}`);
    process.exit(1);
  }

  // Update openclaw.json with mattermost channel
  addMattermostToConfig({ botDir });

  // Read existing auth-profiles and merge, or create fresh
  // We need the anthropic/openai key from the existing .env to preserve them
  let anthropicKey = '';
  let openaiKey = '';
  const envPath = join(botDir, '.env');
  if (existsSync(envPath)) {
    const env = readFileSync(envPath, 'utf8');
    const anthMatch = env.match(/^ANTHROPIC_API_KEY=(.+)$/m);
    if (anthMatch) anthropicKey = anthMatch[1];
    const oaiMatch = env.match(/^OPENAI_API_KEY=(.+)$/m);
    if (oaiMatch) openaiKey = oaiMatch[1];
  }

  writeAuthProfiles({
    botDir,
    anthropicKey,
    openaiKey,
    mattermostUrl,
    mattermostToken: result.token,
  });

  // Update botdaddy.json
  const reg = loadRegistry();
  const entry = reg.bots.find(b => b.name === name);
  if (entry) {
    entry.mattermost = true;
    saveRegistry(reg);
  }

  // If container is running, install the plugin
  const containerName = getContainerName(name);
  if (containerRunning(containerName)) {
    console.log('  Installing Mattermost plugin...');
    try {
      execInContainer(containerName, 'openclaw plugins install @openclaw/mattermost');
      console.log('  Restart the bot for changes to take effect: botdaddy stop ' + name + ' && botdaddy start ' + name);
    } catch {
      console.log('  Warning: Could not install plugin. Run manually: botdaddy shell ' + name + ' then: openclaw plugins install @openclaw/mattermost');
    }
  } else {
    console.log('  Note: Start the bot, then install the plugin:');
    console.log(`    botdaddy start ${name}`);
    console.log(`    botdaddy shell ${name}`);
    console.log('    openclaw plugins install @openclaw/mattermost');
  }

  console.log(`\n  Mattermost configured for '${name}'.`);
}
