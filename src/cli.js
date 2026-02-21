import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));

export function run() {
  const program = new Command();

  program
    .name('botdaddy')
    .description('Manage isolated OpenClaw agent instances in Docker containers')
    .version(pkg.version);

  program
    .command('create <name>')
    .description('Create a new bot')
    .action(async (name) => {
      const { create } = await import('./commands/create.js');
      await create(name);
    });

  program
    .command('start <name>')
    .description('Start a bot container')
    .action(async (name) => {
      const { start } = await import('./commands/start.js');
      await start(name);
    });

  program
    .command('restart <name>')
    .description('Restart a running bot container')
    .action(async (name) => {
      const { restart } = await import('./commands/restart.js');
      await restart(name);
    });

  program
    .command('stop <name>')
    .description('Stop a bot container')
    .action(async (name) => {
      const { stop } = await import('./commands/stop.js');
      await stop(name);
    });

  program
    .command('logs <name>')
    .description('Follow bot container logs')
    .action(async (name) => {
      const { logs } = await import('./commands/logs.js');
      await logs(name);
    });

  program
    .command('ls')
    .description('List all bots and their status')
    .action(async () => {
      const { ls } = await import('./commands/ls.js');
      await ls();
    });

  program
    .command('destroy <name>')
    .description('Destroy a bot (stop, remove container, optionally delete files)')
    .action(async (name) => {
      const { destroy } = await import('./commands/destroy.js');
      await destroy(name);
    });

  program
    .command('shell <name>')
    .description('Open a shell in a bot container')
    .action(async (name) => {
      const { shell } = await import('./commands/shell.js');
      await shell(name);
    });

  program
    .command('token <name>')
    .description('Print the gateway token for a bot')
    .action(async (name) => {
      const { token } = await import('./commands/token.js');
      await token(name);
    });

  program
    .command('mattermost <name>')
    .description('Provision or re-provision Mattermost for an existing bot')
    .action(async (name) => {
      const { mattermost } = await import('./commands/mattermost.js');
      await mattermost(name);
    });

  program
    .command('approve <name> <channel> <code>')
    .description('Approve a channel pairing (e.g. botdaddy approve mybot mattermost ABC123)')
    .action(async (name, channel, code) => {
      const { approve } = await import('./commands/approve.js');
      await approve(name, channel, code);
    });

  program
    .command('dashboard <name>')
    .description('Open the gateway dashboard in a browser')
    .action(async (name) => {
      const { dashboard } = await import('./commands/dashboard.js');
      await dashboard(name);
    });

  program.parse();
}
