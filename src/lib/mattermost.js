/**
 * Provision a Mattermost bot account via the MM REST API.
 * Creates the bot and generates an access token.
 * Returns the token and base URL — caller is responsible for storing them.
 *
 * @param {object} opts
 * @param {string} opts.botName
 * @param {string} opts.mattermostUrl   e.g. https://mm.example.com
 * @param {string} opts.adminToken      System Admin personal access token
 * @returns {{ success: boolean, token?: string, baseUrl?: string, error?: string }}
 */
export async function provisionMattermostBot({ botName, mattermostUrl, adminToken }) {
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

    const prefix = token.slice(0, 8);
    console.log(`  Mattermost bot provisioned (@${botName}, token: ${prefix}...)`);
    return { success: true, token, baseUrl: url };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
