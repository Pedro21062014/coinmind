// ─────────────────────────────────────────────────────────────────────────────
//  coinmind · configuração persistente (~/.coinmind/config.json)
//  Guarda: corretora padrão, modo (testnet|real), chaves por corretora e a
//  estratégia preferida. Tudo configurável pela própria CLI.
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function dirConfig() {
  return process.env.COINMIND_DIR || path.join(os.homedir(), '.coinmind');
}

function arquivoConfig() {
  return path.join(dirConfig(), 'config.json');
}

/** Lê a configuração geral ({} se não existe ainda). */
export function lerConfig() {
  try {
    return JSON.parse(fs.readFileSync(arquivoConfig(), 'utf8'));
  } catch {
    return {};
  }
}

/**
 * Mescla e salva a configuração. `chaves` é mesclado POR corretora
 * (salvar a OKX não apaga a Binance).
 */
export function salvarConfig(parcial) {
  const atual = lerConfig();
  const novo = { ...atual };
  for (const [chave, valor] of Object.entries(parcial)) {
    if (chave === 'chaves' && valor && typeof valor === 'object') {
      novo.chaves = { ...(atual.chaves || {}) };
      for (const [id, creds] of Object.entries(valor)) {
        novo.chaves[id] = { ...(novo.chaves[id] || {}), ...creds };
      }
    } else {
      novo[chave] = valor;
    }
  }
  fs.mkdirSync(dirConfig(), { recursive: true });
  fs.writeFileSync(arquivoConfig(), JSON.stringify(novo, null, 2) + '\n');
  return novo;
}

/** Remove as chaves de uma corretora (ex: config apagar binance). */
export function apagarChaves(id) {
  const atual = lerConfig();
  if (atual.chaves && atual.chaves[id]) {
    delete atual.chaves[id];
    fs.mkdirSync(dirConfig(), { recursive: true });
    fs.writeFileSync(arquivoConfig(), JSON.stringify(atual, null, 2) + '\n');
  }
  return lerConfig();
}

/** Percentual digitado (5 = 5%) → fração (0.05). Valores < 1 passam direto. */
export const pctParaFrac = (v) => (v > 1 ? v / 100 : v);
