// ─────────────────────────────────────────────────────────────────────────────
//  coinmind · registro de corretoras + resolução de credenciais e MODO
//  Credenciais vêm de (nesta ordem):
//    1. variáveis de ambiente   (COINMIND_<CORRETORA>_API_KEY / _API_SECRET / _PASSPHRASE)
//    2. ~/.coinmind/config.json (salvo via "coinmind config chaves ...")
//    3. ~/.coinmind/corretoras.json (formato legado, ainda funciona)
//  Modo das ordens: config.modo ('testnet' por padrão — seguro) ou flag --real/--testnet
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import binance from './binance.js';
import bybit from './bybit.js';
import okx from './okx.js';
import { lerConfig } from '../config.js';

export const CORRETORAS = { binance, bybit, okx };

export function dirLegado() {
  return process.env.COINMIND_DIR || path.join(os.homedir(), '.coinmind');
}

/** Formato legado (~/.coinmind/corretoras.json), mantido por compatibilidade. */
function lerConfigArquivo() {
  try {
    return JSON.parse(fs.readFileSync(path.join(dirLegado(), 'corretoras.json'), 'utf8'));
  } catch {
    return {};
  }
}

export function credenciais(id) {
  const mod = CORRETORAS[id];
  if (!mod) throw new Error(`Corretora desconhecida: ${id} (suportadas: ${Object.keys(CORRETORAS).join(', ')})`);
  const doConfig = lerConfig().chaves?.[id] || {};
  const doLegado = lerConfigArquivo()[id] || {};
  return {
    apiKey: process.env[mod.env.apiKey] || doConfig.apiKey || doLegado.apiKey,
    secret: process.env[mod.env.secret] || doConfig.secret || doLegado.secret,
    passphrase: mod.precisaPassphrase
      ? process.env[mod.env.passphrase] || doConfig.passphrase || doLegado.passphrase
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
 * @param {object} opcoes { corretora?, modo? 'real'|'testnet', real?, testnet?,
 *                          precoPublico?, permitirSemCredenciais? }
 */
export function contexto(opcoes = {}) {
  const configGeral = lerConfig();

  let id = opcoes.corretora
    ? String(opcoes.corretora).toLowerCase()
    : process.env.COINMIND_CORRETORA
      ? String(process.env.COINMIND_CORRETORA).toLowerCase()
      : configGeral.corretora || Object.keys(CORRETORAS).find(configurada);

  // endpoints públicos (preço) e modo --prever funcionam sem credenciais
  if (!id && (opcoes.precoPublico || opcoes.permitirSemCredenciais)) id = 'binance';

  if (!id) {
    throw new Error(
      `Nenhuma corretora configurada. Rode "coinmind config" (assistente) ou "coinmind config chaves --corretora binance --api-key ... --secret ...".`
    );
  }
  const mod = CORRETORAS[id];
  if (!mod) {
    throw new Error(`Corretora desconhecida: "${id}". Suportadas: ${Object.keys(CORRETORAS).join(', ')}.`);
  }

  // modo: flag > config salvo > testnet (padrão seguro)
  const modo =
    opcoes.modo === 'real' || opcoes.real === true
      ? 'real'
      : opcoes.modo === 'testnet' || opcoes.testnet === true
        ? 'testnet'
        : configGeral.modo === 'real'
          ? 'real'
          : 'testnet';

  const creds = credenciais(id);
  return {
    id,
    mod,
    modo,
    cfg: {
      apiKey: creds.apiKey,
      secret: creds.secret,
      passphrase: creds.passphrase,
      testnet: modo === 'testnet',
    },
  };
}
