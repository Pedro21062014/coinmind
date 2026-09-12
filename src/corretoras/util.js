// ─────────────────────────────────────────────────────────────────────────────
//  coinmind · utilidades das corretoras (crypto, HTTP, números) — zero deps
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'node:crypto';

/** HMAC-SHA256 em hex (Binance, Bybit). */
export const hmacHex = (chave, dados) =>
  crypto.createHmac('sha256', chave).update(dados).digest('hex');

/** HMAC-SHA256 em base64 (OKX). */
export const hmacBase64 = (chave, dados) =>
  crypto.createHmac('sha256', chave).update(dados).digest('base64');

export const agoraMs = () => Date.now();
export const agoraIso = () => new Date().toISOString();

/** Monta query string `a=1&b=2` ignorando valores vazios. */
export function qs(params) {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

/** GET/POST com fetch + tratamento de erro amigável. */
export async function requisicao(url, { metodo = 'GET', cabecalhos = {}, corpo = null } = {}) {
  let res;
  try {
    res = await fetch(url, {
      method: metodo,
      headers: cabecalhos,
      body: corpo === null || metodo === 'GET' ? undefined : corpo,
    });
  } catch (e) {
    throw new Error(`Falha de rede ao chamar a corretora: ${e.message}`);
  }
  const texto = await res.text();
  let j;
  try {
    j = JSON.parse(texto);
  } catch {
    throw new Error(`Resposta inválida da corretora (HTTP ${res.status}): ${texto.slice(0, 180)}`);
  }
  if (!res.ok || res.status >= 400) throw new Error(erroApi(j, res.status));
  return j;
}

function erroApi(j, status) {
  const msg = j?.msg || j?.retMsg || j?.message || JSON.stringify(j).slice(0, 160);
  const cod = j?.code ?? j?.retCode ?? '';
  return `A corretora recusou (HTTP ${status}${cod !== '' ? `, código ${cod}` : ''}): ${msg}`;
}

/**
 * Arredonda uma quantidade para baixo, respeitando o passo (stepSize) do lote
 * da corretora. Retorna string pronta pra API, ex: "0.00120000".
 */
export function arredondarParaPasso(valor, passo = '0.00000001') {
  const v = Number(valor);
  const p = Number(passo);
  if (!isFinite(v)) return '0';
  if (!isFinite(p) || p <= 0) return String(v);
  const casas = Math.min(8, Math.max(0, Math.round(-Math.log10(p))));
  const q = Math.floor(v / p + 1e-9) * p;
  return q.toFixed(casas);
}

/** Nunca mostra a chave inteira: só o fim. */
export const mascara = (chave) => (chave ? `••••${String(chave).slice(-4)}` : '(ausente)');
