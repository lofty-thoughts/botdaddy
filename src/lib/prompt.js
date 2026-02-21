import { createInterface } from 'node:readline';

export function makeRL() {
  return createInterface({ input: process.stdin, output: process.stdout });
}

export function ask(rl, question, defaultVal) {
  const suffix = defaultVal ? ` [${defaultVal}]` : '';
  return new Promise(resolve => {
    rl.question(`${question}${suffix}: `, answer => {
      resolve(answer.trim() || defaultVal || '');
    });
  });
}

export function askSecret(question) {
  return new Promise(resolve => {
    process.stdout.write(`${question}: `);
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    if (stdin.isTTY) stdin.setRawMode(true);

    let input = '';
    const onData = (ch) => {
      const c = ch.toString();
      if (c === '\n' || c === '\r') {
        if (stdin.isTTY) stdin.setRawMode(wasRaw ?? false);
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        resolve(input.trim());
      } else if (c === '\u007F' || c === '\b') {
        if (input.length > 0) input = input.slice(0, -1);
      } else if (c === '\u0003') {
        process.stdout.write('\n');
        process.exit(1);
      } else {
        input += c;
      }
    };
    stdin.resume();
    stdin.on('data', onData);
  });
}

export function choose(rl, question, options) {
  return new Promise(resolve => {
    console.log(`\n${question}`);
    options.forEach((opt, i) => console.log(`  ${i + 1}. ${opt}`));
    rl.question(`Choice [1]: `, answer => {
      const idx = parseInt(answer.trim(), 10) - 1;
      resolve(options[idx >= 0 && idx < options.length ? idx : 0]);
    });
  });
}
