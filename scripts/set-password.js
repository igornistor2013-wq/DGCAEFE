#!/usr/bin/env node
'use strict';
// Setează sau resetează parola unui administrator, fără să pornească serverul.
//   node scripts/set-password.js [utilizator]            (parola se cere în terminal)
//   ADMIN_NEW_PASSWORD='...' node scripts/set-password.js [utilizator]
const cfg = require('../lib/config');
const auth = require('../lib/auth');

const username = process.argv[2] || cfg.ADMIN_USER;

// Citește o linie fără să afișeze caracterele tastate.
function ask(question) {
  return new Promise(resolve => {
    const stdin = process.stdin;
    process.stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let buf = '';
    const onData = chunk => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n' || ch === '\u0004') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener('data', onData);
          process.stdout.write('\n');
          return resolve(buf);
        }
        if (ch === '\u0003') {
          process.stdout.write('\n');
          process.exit(130);
        }
        if (ch === '\u007f' || ch === '\b') buf = buf.slice(0, -1);
        else buf += ch;
      }
    };
    stdin.on('data', onData);
  });
}

(async () => {
  let password = process.env.ADMIN_NEW_PASSWORD;
  if (!password) {
    if (!process.stdin.isTTY) {
      console.error('Rulați scriptul într-un terminal sau setați variabila ADMIN_NEW_PASSWORD.');
      process.exit(1);
    }
    password = await ask(`Parola nouă pentru „${username}” (minimum ${auth.MIN_PASSWORD} caractere): `);
    const again = await ask('Repetați parola: ');
    if (password !== again) {
      console.error('Parolele nu coincid.');
      process.exit(1);
    }
  }
  try {
    auth.setPasswordOffline(username, password);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
  console.log(`Parola pentru „${username}” a fost schimbată. Sesiunile deschise anterior nu mai sunt valabile.`);
})();
