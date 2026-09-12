// ─────────────────────────────────────────────────────────────────────────────
//  coinmind · registro de corretoras + resolução de credenciais
//  Credenciais vêm de (nesta ordem):
//    1. variáveis de ambiente  (COINMIND_<CORRETORA>_API_KEY / _API_SECRET / _PASSPHRASE)
//    2. arquivo ~/.coinmind/corretoras.json  { "binance": { "apiKey": "...", "secret": "..." } }
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import binance from './binance.js';
import bybit from './bybit.js';
import okx from './okx.js';

export const CORRETORAS = { binance, bybit, okx };

export function dirConfig() {
  return process.env.COINMIND_DIR || path.join(os.homedir(), '.coinmind');
}

export function lerConfigArquivo() {
  try {
    return JSON.parse(fs.readFileSync(path.join(dirConfig(), 'corretoras.json'), 'utf8'));
  } catch {
    return {};
  }
}

export function credenciais(id) {
  const mod = CORRETORAS[id];
  if (!mod) throw new Error(`Corretora desconhecida: ${id} (suportadas: ${Object.keys(CORRETORAS).join(', ')})`);
  const doArquivo = lerConfigArquivo()[id] || {};
  return {
    apiKey: process.env[mod.env.apiKey] || doArquivo.apiKey,
    secret: process.env[mod.env.secret] || doArquivo.secret,
    passphrase: mod.precisaPassphrase
      ? process.env[mod.env.passphrase] || doArquivo.passphrase
      : undefined,
  };
}

export function configurada(id) {
  try {
    const c = credenciais(id);
    return !!c.apiKey && !!c.secret && (!CORRETORAS[id].precisaPassphrase || !!c.passphrase);
  } catch {
    return false;
  }
}

/**
 * Monta o contexto de operação real.
 * @param {object} opcoes { corretora?: string, testnet?: boolean }
 */
export function contexto(opcoes = {}) {
  let id = opcoes.corretora
    ? String(opcoes.corretora).toLowerCase()
    : process.env.COINMIND_CORRETORA
      ? String(process.env.COINMIND_CORRETORA).toLowerCase()
      : Object.keys(CORRETORAS).find(configurada);

  // endpoints públicos (preço) e modo --prever funcionam sem credenciais
  if (!id && (opcoes.precoPublico || opcoes.permitirSemCredenciais)) id = 'binance';
  if (!id) {
    throw new Error(
      `Nenhuma corretora configurada. Use COINMIND_<CORRETORA>_API_KEY/_API_SECRET no ambiente, ` +
        `~/.coinmind/corretoras.json, ou rode "coinmind corretoras" pra ver o passo a passo.`
    );
  }
  const mod = CORRETORAS[id];
  if (!mod) {
    throw new Error(`Corretora desconhecida: "${id}". Suportadas: ${Object.keys(CORRETORAS).join(', ')}.`);
  }
  const creds = credenciais(id);
  return {
    id,
    mod,
    cfg: {
      apiKey: creds.apiKey,
      secret: creds.secret,
      passphrase: creds.passphrase,
      testnet: !!opcoes.testnet,
    },
  };
}
