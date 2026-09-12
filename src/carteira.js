// ─────────────────────────────────────────────────────────────────────────────
//  coinmind · carteira (paper trading) com persistência em ~/.coinmind/
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DIR = process.env.COINMIND_DIR || path.join(os.homedir(), '.coinmind');
const ARQUIVO = path.join(DIR, 'carteira.json');

export function caminhoCarteira() {
  return ARQUIVO;
}

export function novaCarteira(capital = 10000) {
  return {
    saldo: capital,
    capitalInicial: capital,
    posicoes: {},
    operacoes: [],
    criadaEm: new Date().toISOString(),
  };
}

export function carregar() {
  try {
    return JSON.parse(fs.readFileSync(ARQUIVO, 'utf8'));
  } catch {
    return novaCarteira();
  }
}

export function salvar(c) {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(ARQUIVO, JSON.stringify(c, null, 2));
}

export function reiniciar(capital = 10000) {
  const c = novaCarteira(capital);
  salvar(c);
  return c;
}

/**
 * Compra `usd` de uma moeda ao `preco` atual.
 * Atualiza preço médio ponderado e registra a operação.
 */
export function comprar(c, simbolo, usd, preco, ciclo = 0) {
  if (usd <= 0) throw new Error('Valor da compra precisa ser positivo.');
  if (usd > c.saldo) throw new Error(`Saldo insuficiente: você tem ${c.saldo.toFixed(2)} e quer gastar ${usd.toFixed(2)}.`);
  const qtd = usd / preco;
  const pos = c.posicoes[simbolo] || { qtd: 0, precoMedio: 0, investido: 0 };
  const novoInvestido = pos.investido + usd;
  pos.qtd += qtd;
  pos.investido = novoInvestido;
  pos.precoMedio = novoInvestido / pos.qtd;
  c.posicoes[simbolo] = pos;
  c.saldo -= usd;
  c.operacoes.push({ tipo: 'compra', simbolo, qtd, preco, usd, ciclo, quando: new Date().toISOString() });
  return { qtd, usd };
}

/**
 * Vende `usd` (ou tudo, se null) de uma moeda ao `preco` atual.
 * Retorna { qtd, bruto, lucro, retornoPct }.
 */
export function vender(c, simbolo, usd, preco, ciclo = 0) {
  const pos = c.posicoes[simbolo];
  if (!pos || pos.qtd <= 0) throw new Error(`Você não tem posição em ${simbolo}.`);
  let qtd = usd == null ? pos.qtd : usd / preco;
  qtd = Math.min(qtd, pos.qtd);
  const bruto = qtd * preco;
  const custo = qtd * pos.precoMedio;
  const lucro = bruto - custo;
  const retornoPct = (preco / pos.precoMedio - 1) * 100;
  pos.qtd -= qtd;
  pos.investido -= custo;
  if (pos.qtd <= 1e-12) delete c.posicoes[simbolo];
  c.saldo += bruto;
  c.operacoes.push({ tipo: 'venda', simbolo, qtd, preco, usd: bruto, lucro, ciclo, quando: new Date().toISOString() });
  return { qtd, bruto, lucro, retornoPct };
}

/** Valor total da carteira: saldo livre + posições a preço de mercado. */
export function valorTotal(c, mercado) {
  let total = c.saldo;
  for (const [simbolo, pos] of Object.entries(c.posicoes)) {
    total += pos.qtd * mercado.moeda(simbolo).preco;
  }
  return total;
}

/** Lucro/prejuízo não realizado (posições vs preço médio). */
export function pnlNaoRealizado(c, mercado) {
  let pnl = 0;
  for (const [simbolo, pos] of Object.entries(c.posicoes)) {
    pnl += pos.qtd * (mercado.moeda(simbolo).preco - pos.precoMedio);
  }
  return pnl;
}

/** Lucro/prejuízo realizado (soma das vendas). */
export function pnlRealizado(c) {
  return c.operacoes.filter((o) => o.tipo === 'venda').reduce((s, o) => s + o.lucro, 0);
}
