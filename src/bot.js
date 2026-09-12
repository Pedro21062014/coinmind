// ─────────────────────────────────────────────────────────────────────────────
//  coinmind · cérebro do robô: estratégias de trading automáticas
// ─────────────────────────────────────────────────────────────────────────────

import { comprar, vender } from './carteira.js';

export const ESTRATEGIAS = {
  dip: {
    nome: 'Comprador de Quedas',
    emoji: '🎣',
    desc: 'compra quando a moeda cai X% da máxima recente e vende no lucro-alvo ou no stop-loss',
  },
  momentum: {
    nome: 'Seguidor de Tendência',
    emoji: '🏃',
    desc: 'compra quando a média curta cruza acima da longa (tendência de alta) e vende na reversão',
  },
  dca: {
    nome: 'Compra Programada (DCA)',
    emoji: '🕰️',
    desc: 'compra um valor fixo a cada N ciclos, sem olhar preço — o clássico "esquece que existe"',
  },
};

const padrao = {
  dip: { queda: 0.05, lucroAlvo: 0.06, stopLoss: 0.08, lote: 150, janela: 24 },
  momentum: { curta: 5, longa: 15, lote: 150 },
  dca: { cadaNCiclos: 5, lote: 100, moedas: ['BTC', 'ETH', 'SOL', 'DOGE', 'PEPE'] },
};

/** Mescla config do usuário com os padrões da estratégia. */
export function configEstrategia(nome, cfg = {}) {
  const base = padrao[nome] || {};
  return { ...base, ...cfg };
}

const sma = (serie, n) => {
  const j = serie.slice(-n);
  return j.reduce((a, b) => a + b, 0) / j.length;
};

/**
 * Decide as operações do ciclo atual.
 * @returns [{simbolo, acao:'compra'|'venda', usd|null, motivo}]
 */
export function decidir(nomeEstrategia, mercado, carteira, cfg) {
  const acoes = [];
  const c = cfg || configEstrategia(nomeEstrategia);

  if (nomeEstrategia === 'dip') {
    for (const m of mercado.moedas) {
      const pos = carteira.posicoes[m.simbolo];
      if (pos) {
        const retorno = m.preco / pos.precoMedio - 1;
        if (retorno >= c.lucroAlvo) {
          acoes.push({ simbolo: m.simbolo, acao: 'venda', usd: null, motivo: `✅ lucro-alvo batido (${(retorno * 100).toFixed(1)}%)` });
        } else if (retorno <= -c.stopLoss) {
          acoes.push({ simbolo: m.simbolo, acao: 'venda', usd: null, motivo: `🛑 stop-loss (${(retorno * 100).toFixed(1)}%)` });
        }
      } else if (m.historico.length >= 5 && carteira.saldo >= c.lote) {
        const janela = m.historico.slice(-c.janela);
        const maxima = Math.max(...janela);
        const queda = 1 - m.preco / maxima;
        if (queda >= c.queda) {
          acoes.push({ simbolo: m.simbolo, acao: 'compra', usd: c.lote, motivo: `🎣 desconto de ${(queda * 100).toFixed(1)}% da máxima` });
        }
      }
    }
  }

  if (nomeEstrategia === 'momentum') {
    if (mercado.ciclo >= c.longa + 2) {
      for (const m of mercado.moedas) {
        const pos = carteira.posicoes[m.simbolo];
        const curta = sma(m.historico, c.curta);
        const longa = sma(m.historico, c.longa);
        if (pos && curta < longa) {
          acoes.push({ simbolo: m.simbolo, acao: 'venda', usd: null, motivo: '📉 tendência virou pra baixo' });
        } else if (!pos && curta > longa && carteira.saldo >= c.lote) {
          acoes.push({ simbolo: m.simbolo, acao: 'compra', usd: c.lote, motivo: '📈 tendência de alta confirmada' });
        }
      }
    }
  }

  if (nomeEstrategia === 'dca') {
    if (mercado.ciclo % c.cadaNCiclos === 0) {
      for (const simbolo of c.moedas) {
        if (carteira.saldo >= c.lote) {
          acoes.push({ simbolo, acao: 'compra', usd: c.lote, motivo: '🕰️ compra programada' });
        }
      }
    }
  }

  return acoes;
}

/** Executa as ações decididas na carteira. Retorna o resultado de cada uma. */
export function executar(mercado, carteira, acoes, ciclo) {
  const feitas = [];
  for (const a of acoes) {
    const preco = mercado.moeda(a.simbolo).preco;
    try {
      if (a.acao === 'compra') {
        const r = comprar(carteira, a.simbolo, a.usd, preco, ciclo);
        feitas.push({ ...a, preco, qtd: r.qtd, usd: r.usd, lucro: null });
      } else {
        const r = vender(carteira, a.simbolo, a.usd, preco, ciclo);
        feitas.push({ ...a, preco, qtd: r.qtd, usd: r.bruto, lucro: r.lucro, retornoPct: r.retornoPct });
      }
    } catch {
      // saldo acabou / posição sumiu — ignora silenciosamente
    }
  }
  return feitas;
}
