// ─────────────────────────────────────────────────────────────────────────────
//  coinmind · AGENTE 24H 🤖 — robô autônomo de verdade
//  · acompanha preços REAIS da corretora em loop contínuo (dia e noite)
//  · decide com a estratégia salva (dip/momentum/dca) + IA opcional
//  · a IA (OpenAI/Groq/OpenRouter/Ollama) aprova ou veta cada ENTRADA;
//    stops e lucro-alvo são SEMPRE automáticos (proteção não depende de IA)
//  · limites duros: valor máx por ordem, posição máx, PERDA DIÁRIA que desliga tudo
//  · NUNCA liga sozinho: só com "coinmind agente ligar" (e confirmação)
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import { dirConfig } from './config.js';

const ARQUIVO_ESTADO = () => path.join(dirConfig(), 'agente.json');

export const LIMITES_PADRAO = {
  maxOrdem: 25, // US$ por ordem
  maxPosicao: 100, // US$ totais em posições abertas
  perdaDia: 50, // se perder isso no dia, o agente SE DESLIGA
  cooldown: 300, // segundos mínimos entre trades
  moedas: ['BTC', 'ETH', 'SOL', 'DOGE'], // só opera nessas
};

export function lerEstado() {
  try {
    return JSON.parse(fs.readFileSync(ARQUIVO_ESTADO(), 'utf8'));
  } catch {
    return { ligado: false };
  }
}

export function salvarEstado(e) {
  fs.mkdirSync(dirConfig(), { recursive: true });
  fs.writeFileSync(ARQUIVO_ESTADO(), JSON.stringify(e, null, 2) + '\n');
  return e;
}

export function estadoInicial(extras = {}) {
  const hoje = new Date().toISOString().slice(0, 10);
  return {
    ligado: true,
    pid: process.pid,
    iniciadoEm: new Date().toISOString(),
    tick: 0,
    dia: hoje,
    realizadoDia: 0, // lucro/prejuízo realizado HOJE
    posicoes: {},
    series: {},
    trades: [],
    ultimoTradeEm: 0,
    pausadoMotivo: null,
    ...extras,
  };
}

export function pidVivo(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// ── decisões (função pura, testável) ─────────────────────────────────────────

const media = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;

/**
 * Decide as propostas do tick com base nas séries de preços reais.
 * @returns [{simbolo, acao:'compra'|'venda', motivo, tipo:'entrada'|'saida'}]
 */
export function decidirTick(nome, series, posicoes, cfg, tickCount) {
  const propostas = [];
  const ultimo = (s) => s[s.length - 1];

  for (const [simbolo, serie] of Object.entries(series)) {
    if (!serie || serie.length < 6) continue;
    const pos = posicoes[simbolo];

    if (nome === 'dip') {
      if (pos) {
        const ret = ultimo(serie) / pos.precoMedio - 1;
        if (ret >= (cfg.lucroAlvo ?? 0.06)) {
          propostas.push({ simbolo, acao: 'venda', tipo: 'saida', motivo: `✅ lucro-alvo ${(ret * 100).toFixed(1)}%` });
        } else if (ret <= -(cfg.stopLoss ?? 0.08)) {
          propostas.push({ simbolo, acao: 'venda', tipo: 'saida', motivo: `🛑 stop-loss ${(ret * 100).toFixed(1)}%` });
        }
      } else {
        const janela = serie.slice(-(cfg.janela ?? 60));
        const queda = 1 - ultimo(serie) / Math.max(...janela);
        if (queda >= (cfg.queda ?? 0.05)) {
          propostas.push({ simbolo, acao: 'compra', tipo: 'entrada', motivo: `🎣 desconto de ${(queda * 100).toFixed(1)}% da máxima` });
        }
      }
    }

    if (nome === 'momentum') {
      const curta = cfg.curta ?? 15;
      const longa = cfg.longa ?? 60;
      if (serie.length >= longa + 2) {
        const mCurta = media(serie.slice(-curta));
        const mLonga = media(serie.slice(-longa));
        if (pos && mCurta < mLonga) {
          propostas.push({ simbolo, acao: 'venda', tipo: 'saida', motivo: '📉 tendência virou pra baixo' });
        } else if (!pos && mCurta > mLonga) {
          propostas.push({ simbolo, acao: 'compra', tipo: 'entrada', motivo: '📈 tendência de alta confirmada' });
        }
      }
    }

    if (nome === 'dca' && !pos) {
      const cada = cfg.cadaNCiclos ?? 30;
      const lista = cfg.moedas ?? ['BTC', 'ETH'];
      if (tickCount % cada === 0 && lista.includes(simbolo)) {
        propostas.push({ simbolo, acao: 'compra', tipo: 'entrada', motivo: '🕰️ compra programada' });
      }
    }
  }
  return propostas;
}

// ── limites de risco ─────────────────────────────────────────────────────────

/** Retorna null se liberado, ou o motivo do bloqueio. */
export function limiteBloqueia(proposta, estado, limites, cfg) {
  const agora = Date.now();
  if (proposta.tipo === 'saida') return null; // saídas de proteção NUNCA são bloqueadas
  if (estado.realizadoDia <= -limites.perdaDia) return `perda diária atingida (US$ ${Math.abs(estado.realizadoDia).toFixed(2)} ≥ limite ${limites.perdaDia})`;
  if (!limites.moedas.includes(proposta.simbolo)) return `${proposta.simbolo} fora da lista permitida (${limites.moedas.join(', ')})`;
  if ((cfg.lote ?? limites.maxOrdem) > limites.maxOrdem) return `lote US$ ${cfg.lote} acima do máximo por ordem (US$ ${limites.maxOrdem})`;
  const investido = Object.values(estado.posicoes).reduce((s, p) => s + (p.investido || 0), 0);
  if (investido + (cfg.lote ?? limites.maxOrdem) > limites.maxPosicao) return `posição total US$ ${(investido + (cfg.lote ?? limites.maxOrdem)).toFixed(2)} passaria do teto (US$ ${limites.maxPosicao})`;
  if (agora - (estado.ultimoTradeEm || 0) < limites.cooldown * 1000) {
    const falta = Math.ceil((limites.cooldown * 1000 - (agora - (estado.ultimoTradeEm || 0))) / 1000);
    return `cooldown: faltam ${falta}s desde o último trade`;
  }
  return null;
}

// ── cérebro de IA (OpenAI-compatível: OpenAI, Groq, OpenRouter, Ollama...) ────

export function iaConfigurada(ia) {
  return !!(ia && ia.apiKey && ia.baseUrl && ia.modelo);
}

/**
 * Interpreta a resposta do modelo: extrai {decisao, confianca, motivo}.
 * Tolera blocos ```json. Retorna null se não der pra ler.
 */
export function interpretarRespostaIA(texto) {
  if (!texto) return null;
  const limpo = String(texto).replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const match = limpo.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const j = JSON.parse(match[0]);
    const decisao = String(j.decisao || '').toUpperCase();
    if (decisao !== 'APROVAR' && decisao !== 'REJEITAR') return null;
    return {
      decisao,
      confianca: Number.isFinite(Number(j.confianca)) ? Number(j.confianca) : null,
      motivo: String(j.motivo || '(sem motivo informado)').slice(0, 300),
    };
  } catch {
    return null;
  }
}

/** Consulta o modelo sobre uma proposta. Falha = REJEITAR (fail-safe). */
export async function consultarIA(ia, proposta, snapshot) {
  const sistema =
    'Você é o cérebro de um robô de trading de criptomoedas. Analise a proposta de operação ' +
    'com os dados de mercado e responda APENAS com um JSON válido no formato: ' +
    '{"decisao":"APROVAR"|"REJEITAR","confianca":0-100,"motivo":"frase curta em português"}. ' +
    'Seja conservador: em dúvida, REJEITE. Memecoins são voláteis.';

  const pergunta = JSON.stringify({ proposta, mercado: snapshot }, null, 0);

  const controlador = new AbortController();
  const timer = setTimeout(() => controlador.abort(), 20000);
  try {
    const res = await fetch(`${ia.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      signal: controlador.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ia.apiKey}`,
      },
      body: JSON.stringify({
        model: ia.modelo,
        temperature: 0.2,
        max_tokens: 150,
        messages: [
          { role: 'system', content: sistema },
          { role: 'user', content: pergunta },
        ],
      }),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok) {
      return { decisao: 'REJEITAR', confianca: null, motivo: `IA indisponível (HTTP ${res.status}: ${j?.error?.message || 'erro'}) — fail-safe` };
    }
    const texto = j.choices?.[0]?.message?.content ?? '';
    const lido = interpretarRespostaIA(texto);
    return lido || { decisao: 'REJEITAR', confianca: null, motivo: 'resposta ilegível da IA — fail-safe' };
  } catch (e) {
    const motivo = e.name === 'AbortError' ? 'IA demorou demais (timeout) — fail-safe' : `erro falando com a IA (${e.message}) — fail-safe`;
    return { decisao: 'REJEITAR', confianca: null, motivo };
  } finally {
    clearTimeout(timer);
  }
}

/** Testa a conexão com a IA configurada. */
export async function testarIA(ia) {
  const controlador = new AbortController();
  const timer = setTimeout(() => controlador.abort(), 20000);
  try {
    const res = await fetch(`${ia.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      signal: controlador.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ia.apiKey}` },
      body: JSON.stringify({
        model: ia.modelo,
        max_tokens: 20,
        messages: [{ role: 'user', content: 'Responda apenas: COINMIND OK' }],
      }),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${j?.error?.message || 'erro'}`);
    const texto = j.choices?.[0]?.message?.content?.trim() || '(vazio)';
    return texto;
  } finally {
    clearTimeout(timer);
  }
}
