import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import {
  validateName, addBot, getStack, getBotDir, getContainerName,
  loadHomeConfig, saveHomeConfig, PROJECT_ROOT,
} from '../lib/config.js';
import { checkDocker, imageExists, buildImage, runOneShotContainer, ensureNetwork } from '../lib/docker.js';
import { allocatePortRange } from '../lib/ports.js';
import { makeRL, ask, askSecret, choose } from '../lib/prompt.js';
import { scaffoldBot, genToken, today } from '../lib/scaffold.js';
import { writeOpenClawConfig, writeAuthProfiles, addMattermostToConfig, fixConfigAfterOnboard } from '../lib/openclaw.js';
import { provisionMattermostBot } from '../lib/mattermost.js';
import { start } from './start.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function create(name) {
  console.log(`\n  Creating bot: ${name}\n`);

  // 1. Validate name
  const nameErr = validateName(name);
  if (nameErr) {
    console.error(`  Error: ${nameErr}`);
    process.exit(1);
  }

  // 2. Check prerequisites
  if (!checkDocker()) {
    console.error('  Error: Docker is not running. Start Docker/OrbStack and try again.');
    process.exit(1);
  }

  const stack = getStack();
  const dockerDir = join(PROJECT_ROOT, 'docker');

  if (!imageExists(stack.imageName)) {
    console.log(`  Base image '${stack.imageName}' not found. Building...`);
    buildImage(stack.imageName, dockerDir);
  }

  // 3. Interactive wizard
  const rl = makeRL();
  const homeConfig = loadHomeConfig();

  // Provider choice
  const provider = await choose(rl, '  AI Provider:', ['Anthropic', 'OpenAI', 'Ollama (local)']);

  let anthropicKey = '';
  let openaiKey = '';

  if (provider === 'Anthropic') {
    const savedKey = homeConfig.anthropicKey || '';
    if (savedKey) {
      const useExisting = await ask(rl, `  Use saved Anthropic key (${savedKey.slice(0, 8)}...)?`, 'y');
      if (useExisting.toLowerCase() === 'y') {
        anthropicKey = savedKey;
      }
    }
    if (!anthropicKey) {
      anthropicKey = await askSecret('  Anthropic API key');
      if (anthropicKey) {
        const save = await ask(rl, '  Save key for future bots?', 'y');
        if (save.toLowerCase() === 'y') {
          saveHomeConfig({ anthropicKey });
        }
      }
    }
  } else if (provider === 'OpenAI') {
    const savedKey = homeConfig.openaiKey || '';
    if (savedKey) {
      const useExisting = await ask(rl, `  Use saved OpenAI key (${savedKey.slice(0, 8)}...)?`, 'y');
      if (useExisting.toLowerCase() === 'y') {
        openaiKey = savedKey;
      }
    }
    if (!openaiKey) {
      openaiKey = await askSecret('  OpenAI API key');
      if (openaiKey) {
        const save = await ask(rl, '  Save key for future bots?', 'y');
        if (save.toLowerCase() === 'y') {
          saveHomeConfig({ openaiKey });
        }
      }
    }
  }
  // Ollama needs no key

  // 4. Optional Mattermost setup
  let mattermostUrl = '';
  let mattermostAdminToken = '';
  let mattermostBotToken = '';

  const setupMM = await ask(rl, '  Set up Mattermost?', 'n');
  if (setupMM.toLowerCase() === 'y') {
    mattermostUrl = homeConfig.mattermostUrl || '';
    mattermostAdminToken = homeConfig.mattermostAdminToken || '';

    if (!mattermostUrl) {
      mattermostUrl = await ask(rl, '  Mattermost URL (https://...)');
    }
    if (!mattermostAdminToken) {
      mattermostAdminToken = await askSecret('  Mattermost System Admin token');
    }

    if (mattermostUrl && mattermostAdminToken) {
      // Save for future bots
      saveHomeConfig({ mattermostUrl, mattermostAdminToken });
    }
  }

  rl.close();

  // 5. Allocate port range
  const portInfo = allocatePortRange();
  console.log(`  Port range: ${portInfo.gatewayPort} (gateway), ${portInfo.devPortStart}-${portInfo.devPortEnd} (dev)`);

  // 6. Scaffold bot directory
  const botDir = getBotDir(name);
  const gatewayToken = genToken();

  scaffoldBot({
    botDir,
    botName: name,
    gatewayToken,
    anthropicKey,
    openaiKey,
    provider: provider.toLowerCase(),
    portInfo,
  });

  // 7. Write openclaw.json
  writeOpenClawConfig({ botDir, gatewayToken });

  // 8. Write auth profiles
  writeAuthProfiles({
    botDir,
    anthropicKey,
    openaiKey,
    mattermostUrl,
    mattermostToken: mattermostBotToken,
  });

  // 9. Mattermost provisioning
  if (mattermostUrl && mattermostAdminToken) {
    console.log('  Provisioning Mattermost bot...');
    const result = await provisionMattermostBot({
      botName: name,
      mattermostUrl,
      adminToken: mattermostAdminToken,
      botDir,
    });
    if (result.success) {
      mattermostBotToken = result.token;
      addMattermostToConfig({ botDir });
      // Update auth profiles with the bot token
      writeAuthProfiles({
        botDir,
        anthropicKey,
        openaiKey,
        mattermostUrl,
        mattermostToken: mattermostBotToken,
      });
    } else {
      console.log(`  Warning: Mattermost provisioning failed: ${result.error}`);
    }
  }

  // 10. Register in botdaddy.json
  addBot({
    name,
    provider: provider.toLowerCase(),
    portSlot: portInfo.portSlot,
    gatewayPort: portInfo.gatewayPort,
    devPortStart: portInfo.devPortStart,
    devPortEnd: portInfo.devPortEnd,
    mattermost: !!mattermostBotToken,
    createdAt: today,
  });
  console.log('  Registered in botdaddy.json');

  // 11. Ensure network exists
  const networkName = `${stack.namespace}-net`;
  ensureNetwork(networkName);

  // 12. Run onboard
  console.log('\n  Running openclaw onboard...');
  try {
    const containerName = getContainerName(name);
    runOneShotContainer({
      containerName,
      imageName: stack.imageName,
      botDir,
      envFile: join(botDir, '.env'),
      command: ['openclaw', 'onboard', '--non-interactive', '--accept-risk', '--skip-daemon', '--skip-health'],
    });
    console.log('  Identity created');
  } catch (err) {
    console.error(`  Warning: openclaw onboard failed: ${err.message}`);
    console.error('  The bot may need manual onboarding after start.');
  }

  // 13. Fix config after onboard (it resets gateway.bind and token)
  const actualToken = fixConfigAfterOnboard({ botDir, originalToken: gatewayToken });

  // 14. Install Mattermost plugin if needed
  if (mattermostBotToken) {
    console.log('  Note: Run `botdaddy shell ${name}` and execute `openclaw plugins install @openclaw/mattermost` after start.');
  }

  console.log(`\n  Bot '${name}' created successfully!`);

  const containerName = getContainerName(name);
  const orbDomain = `${stack.namespace}-${name}.orb.local`;
  console.log(`  Gateway: http://localhost:${portInfo.gatewayPort}`);
  console.log(`  OrbStack: https://${orbDomain}`);
  console.log(`\n  Start with: botdaddy start ${name}\n`);
}
