#!/usr/bin/env node
import { main } from '../src/comandos.js';

main(process.argv.slice(2)).catch((err) => {
  console.error(`\x1b[31m✖ ${err.message}\x1b[0m`);
  process.exit(1);
});
