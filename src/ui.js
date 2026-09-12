// ─────────────────────────────────────────────────────────────────────────────
//  coinmind · UI de terminal: cores ANSI, tabelas, formatação PT-BR, banner
//  Zero dependências — tudo feito na mão. 🛠️
// ─────────────────────────────────────────────────────────────────────────────

import { renderizarLetras } from './letras.js';
import { VERSAO } from './versao.js';

const COR = process.stdout.isTTY && !process.env.NO_COLOR;

/** Aplica um código ANSI se o terminal suportar cor. */
const pintar = (cod, s) => (COR ? `\x1b[${cod}m${s}\x1b[0m` : String(s));

export const negrito = (s) => pintar('1', s);
export const apagado = (s) => pintar('2', s);
export const vermelho = (s) => pintar('31', s);
export const verde = (s) => pintar('32', s);
export const amarelo = (s) => pintar('33', s);
export const azul = (s) => pintar('34', s);
export const magenta = (s) => pintar('35', s);
export const ciano = (s) => pintar('36', s);
export const cinza = (s) => pintar('90', s);
export const verdeNegrito = (s) => pintar('1;32', s);
export const vermelhoNegrito = (s) => pintar('1;31', s);
export const cianoNegrito = (s) => pintar('1;36', s);
export const amareloNegrito = (s) => pintar('1;33', s);
export const arcoiris = (s) => pintar('1;35', s);

/** Largura VISÍVEL de um texto (ignora códigos ANSI, emoji conta como 2). */
export function largVisivel(s) {
  let n = 0;
  for (const ch of String(s).replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')) {
    const cp = ch.codePointAt(0);
    if (cp === 0xfe0f) continue; // variation selector
    n += cp >= 0x1f000 ? 2 : 1;
  }
  return n;
}

/** padEnd que respeita ANSI e emoji. */
export function pad(s, n) {
  const faltam = n - largVisivel(s);
  return String(s) + (faltam > 0 ? ' '.repeat(faltam) : '');
}

/** padStart que respeita ANSI e emoji. */
export function padInicio(s, n) {
  const faltam = n - largVisivel(s);
  return (faltam > 0 ? ' '.repeat(faltam) : '') + String(s);
}

/** Tabela simples com cabeçalho. linhas = array de arrays de células. */
export function tabela(cabecalho, linhas) {
  const todas = [cabecalho, ...linhas];
  const larguras = [];
  for (let i = 0; i < cabecalho.length; i++) {
    larguras[i] = Math.max(...todas.map((l) => largVisivel(l[i] ?? '')));
  }
  const fmt = (linha) =>
    linha
      .map((c, i) => pad(String(c ?? ''), larguras[i]))
      .join('  ')
      .replace(/\s+$/, '');
  const saida = [cianoNegrito(fmt(cabecalho))];
  saida.push(cinza('─'.repeat(larguras.reduce((a, b) => a + b, 0) + (cabecalho.length - 1) * 2)));
  for (const l of linhas) saida.push(fmt(l));
  return saida.join('\n');
}

/** Formata USD no padrão brasileiro: US$ 1.234,56 */
export const fmtUSD = (n) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD' }).format(n);

/** Formata quantidade de moeda (compacta para números gigantes/minúsculos). */
export function fmtQtd(n) {
  if (!isFinite(n)) return '0';
  if (n === 0) return '0';
  const abs = Math.abs(n);
  if (abs >= 1000) return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(n);
  if (abs >= 1) return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 }).format(n);
  return n.toPrecision(4).replace('.', ',');
}

/** Formata preço da moeda. */
export function fmtPreco(n) {
  if (n >= 1) return fmtUSD(n);
  return '$ ' + n.toPrecision(4).replace('.', ',');
}

/** Porcentagem com sinal e vírgula: +12,34% */
export const fmtPct = (n) => `${n >= 0 ? '+' : ''}${n.toFixed(2).replace('.', ',')}%`;

const BLOCOS = '▁▂▃▄▅▆▇█';

/** Mini-gráfico Unicode a partir de uma série de valores. */
export function sparkline(valores, largura = 40) {
  if (!valores || valores.length < 2) return '';
  const serie = valores.slice(-largura);
  const min = Math.min(...serie);
  const max = Math.max(...serie);
  const range = max - min || 1;
  return serie
    .map((v) => BLOCOS[Math.min(BLOCOS.length - 1, Math.floor(((v - min) / range) * (BLOCOS.length - 1)))])
    .join('');
}

/** Banner principal do robô. */
export function banner() {
  const arte = renderizarLetras('COIN MIND');
  const linhas = arte.split('\n').map((l) => cianoNegrito(l));
  return [
    '',
    ...linhas,
    '',
    cinza(`        🧠  CoinMind v${VERSAO} · o robô de cripto do terminal  ·  memes, blue chips e Web3`),
    cinza(`            simulação grátis  ·  ordens REAIS via Binance, Bybit e OKX  ·  zero dependências`),
    '',
  ].join('\n');
}

/** Título de seção. */
export function titulo(txt) {
  return `\n${cianoNegrito(`▸ ${txt}`)}\n`;
}

/** Linha de resultado: verde se positivo, vermelho se negativo. */
export function corResultado(n, txt) {
  return n >= 0 ? verde(txt) : vermelho(txt);
}

export const seta = (n) => (n >= 0 ? verde('▲') : vermelho('▼'));

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
