import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Provision a Mattermost bot account via the MM REST API.
 * Creates the bot, generates an access token, writes to the agent's .env file.
 *
 * @param {object} opts
 * @param {string} opts.botName
 * @param {string} opts.mattermostUrl   e.g. https://mm.example.com
 * @param {string} opts.adminToken      System Admin personal access token
 * @param {string} opts.botDir          Path to bot data dir (for .env)
 * @returns {{ success: boolean, token?: string, error?: string }}
 */
export async function provisionMattermostBot({ botName, mattermostUrl, adminToken, botDir }) {
  const url = mattermostUrl.replace(/\/$/, '');
  const headers = {
    'Authorization': `Bearer ${adminToken}`,
    'Content-Type': 'application/json',
  };

  try {
    // 1. Create bot (or handle existing)
    let userId;
    const createRes = await fetch(`${url}/api/v4/bots`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        username: botName,
        display_name: botName,
        description: 'OpenClaw agent (managed by botdaddy)',
      }),
    });

    if (createRes.ok) {
      const bot = await createRes.json();
      userId = bot.user_id;
    } else if (createRes.status === 400 || createRes.status === 409) {
      // Bot already exists — look up by username
      const lookupRes = await fetch(`${url}/api/v4/users/username/${botName}`, { headers });
      if (!lookupRes.ok) throw new Error(`Bot exists but could not look up user: ${lookupRes.status}`);
      const user = await lookupRes.json();
      userId = user.id;
    } else {
      const body = await createRes.text();
      throw new Error(`Create bot failed (${createRes.status}): ${body}`);
    }

    // 2. Generate access token
    const tokenRes = await fetch(`${url}/api/v4/users/${userId}/tokens`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ description: 'OpenClaw bot token (botdaddy)' }),
    });
    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      throw new Error(`Token generation failed (${tokenRes.status}): ${body}`);
    }
    const { token } = await tokenRes.json();

    // 3. Write to bot .env
    const envPath = join(botDir, '.env');
    if (existsSync(envPath)) {
      let env = readFileSync(envPath, 'utf8');
      // Replace existing values (commented or uncommented)
      env = env.replace(/^#?\s*MATTERMOST_BOT_TOKEN=.*/m, `MATTERMOST_BOT_TOKEN=${token}`);
      env = env.replace(/^#?\s*MATTERMOST_URL=.*/m, `MATTERMOST_URL=${url}`);
      // Append if not present at all
      if (!/^MATTERMOST_BOT_TOKEN=/m.test(env)) env += `\nMATTERMOST_BOT_TOKEN=${token}`;
      if (!/^MATTERMOST_URL=/m.test(env)) env += `\nMATTERMOST_URL=${url}`;
      writeFileSync(envPath, env);
    }

    const prefix = token.slice(0, 8);
    console.log(`  Mattermost bot provisioned (@${botName}, token: ${prefix}...)`);
    return { success: true, token };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
