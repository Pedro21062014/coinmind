// ─────────────────────────────────────────────────────────────────────────────
//  coinmind · testes automatizados (node:test, sem dependências)
//  roda com: npm test
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderizarLetras, normalizar, FONT } from '../src/letras.js';
import { Mercado, RNG } from '../src/mercado.js';
import { novaCarteira, comprar, vender, valorTotal, pnlRealizado } from '../src/carteira.js';
import { decidir, executar, configEstrategia } from '../src/bot.js';
import { sparkline, fmtPct, largVisivel, pad } from '../src/ui.js';
import { hmacHex, hmacBase64, arredondarParaPasso } from '../src/corretoras/util.js';
import binance from '../src/corretoras/binance.js';
import bybit from '../src/corretoras/bybit.js';
import okx from '../src/corretoras/okx.js';
import { configurada, credenciais, CORRETORAS } from '../src/corretoras/index.js';

// ── letras ───────────────────────────────────────────────────────────────────

test('letras: renderiza 6 linhas não vazias', () => {
  const arte = renderizarLetras('COIN MIND');
  const linhas = arte.split('\n');
  assert.equal(linhas.length, 6);
  for (const l of linhas) assert.ok(l.length > 0, 'linha vazia');
  assert.ok((arte.match(/█/g) || []).length > 50, 'deveria ter muitos blocos');
});

test('letras: todos os glifos têm as 6 linhas com o mesmo comprimento', () => {
  for (const [ch, rows] of Object.entries(FONT)) {
    assert.equal(rows.length, 6, `glifo ${ch} não tem 6 linhas`);
    const larguras = new Set(rows.map((r) => r.length));
    assert.equal(larguras.size, 1, `glifo ${ch} tem linhas desalinhadas: ${[...larguras].join(',')}`);
  }
});

test('letras: remove acentos e ignora caracteres desconhecidos', () => {
  assert.equal(normalizar('Ômega'), 'OMEGA');
  const arte = renderizarLetras('V@LOR!'); // @ vira espaço
  assert.ok(arte.includes('█'));
});

// ── rng ──────────────────────────────────────────────────────────────────────

test('rng: mesma semente gera mesma sequência', () => {
  const a = new RNG(42);
  const b = new RNG(42);
  for (let i = 0; i < 100; i++) assert.equal(a.proximo(), b.proximo());
});

test('rng: gauss é determinístico e não explode', () => {
  const a = new RNG(7);
  const b = new RNG(7);
  for (let i = 0; i < 500; i++) {
    const g = a.gauss();
    assert.equal(g, b.gauss());
    assert.ok(Math.abs(g) < 8, 'gauss explodiu');
  }
});

// ── mercado ──────────────────────────────────────────────────────────────────

test('mercado: preços sempre positivos e histórico cresce', () => {
  const mercado = new Mercado(new RNG(123));
  for (let i = 0; i < 200; i++) mercado.tick();
  for (const m of mercado.moedas) {
    assert.ok(m.preco > 0, `${m.simbolo} ficou com preço ${m.preco}`);
    assert.equal(m.historico.length, 201); // 1 preço inicial + 200 ticks
  }
});

test('mercado: eventos mudam o preço de verdade às vezes', () => {
  const mercado = new Mercado(new RNG(99));
  let eventos = 0;
  for (let i = 0; i < 300; i++) eventos += mercado.tick().length;
  assert.ok(eventos > 0, 'em 300 ciclos deveria haver eventos');
});

// ── carteira ─────────────────────────────────────────────────────────────────

test('carteira: compra e venda fecham a matemática certa', () => {
  const c = novaCarteira(1000);
  comprar(c, 'BTC', 100, 10); // 10 BTC a $10
  assert.equal(c.saldo, 900);
  assert.ok(Math.abs(c.posicoes.BTC.qtd - 10) < 1e-9);
  const r = vender(c, 'BTC', null, 12); // vende tudo a $12
  assert.ok(Math.abs(r.lucro - 20) < 1e-9, `lucro esperado 20, veio ${r.lucro}`);
  assert.equal(c.saldo, 1020);
  assert.equal(pnlRealizado(c), 20);
  assert.ok(Math.abs(valorTotal(c, { moeda: () => ({ preco: 1 }) }) - 1020) < 1e-9);
});

test('carteira: preço médio ponderado após compras em preços diferentes', () => {
  const c = novaCarteira(1000);
  comprar(c, 'PEPE', 100, 1); // 100 un a $1
  comprar(c, 'PEPE', 300, 3); // 100 un a $3
  assert.ok(Math.abs(c.posicoes.PEPE.precoMedio - 2) < 1e-9);
  assert.ok(Math.abs(c.posicoes.PEPE.qtd - 200) < 1e-9);
});

test('carteira: não deixa comprar sem saldo nem vender sem posição', () => {
  const c = novaCarteira(100);
  assert.throws(() => comprar(c, 'BTC', 200, 5));
  assert.throws(() => vender(c, 'BTC', 10, 5));
});

// ── bot ──────────────────────────────────────────────────────────────────────

test('bot dip: compra na queda e realiza lucro na alta', () => {
  const rng = new RNG(5);
  const mercado = new Mercado(rng);
  const cfg = configEstrategia('dip', { lote: 100, queda: 0.05, lucroAlvo: 0.04, stopLoss: 0.5, janela: 24 });
  const carteira = novaCarteira(5000);

  // aquece o mercado (o bot precisa de histórico)
  for (let i = 0; i < 12; i++) mercado.tick();

  // derruba o PEPE 12% artificialmente
  const pepe = mercado.moeda('PEPE');
  const topo = Math.max(...pepe.historico.slice(-12), pepe.preco);
  pepe.preco = topo * 0.88;
  pepe.historico.push(pepe.preco);

  let acoes = decidir('dip', mercado, carteira, cfg);
  assert.ok(acoes.some((a) => a.simbolo === 'PEPE' && a.acao === 'compra'), 'deveria sinalizar compra no desconto');
  executar(mercado, carteira, acoes, 13);
  assert.ok(carteira.posicoes.PEPE, 'posição aberta em PEPE');

  // sobe 8% → lucro-alvo (simula entrada 8% abaixo do preço atual)
  carteira.posicoes.PEPE.precoMedio = pepe.preco / 1.08;
  acoes = decidir('dip', mercado, carteira, cfg);
  assert.ok(acoes.some((a) => a.simbolo === 'PEPE' && a.acao === 'venda'), 'deveria realizar o lucro');
});

// ── ui ───────────────────────────────────────────────────────────────────────

test('ui: largVisivel e pad lidam com ansi e emoji', () => {
  assert.equal(largVisivel('\x1b[32mok\x1b[0m'), 2);
  assert.equal(largVisivel('🐸x'), 3);
  assert.equal(largVisivel(pad('ab', 5)), 5);
});

test('ui: sparkline só usa blocos válidos e fmtPct usa vírgula', () => {
  const s = sparkline([1, 2, 3, 2, 1], 10);
  assert.ok(/^[▁▂▃▄▅▆▇█]+$/.test(s));
  assert.equal(fmtPct(12.345), '+12,35%');
  assert.equal(fmtPct(-1), '-1,00%');
});

// ── corretoras ───────────────────────────────────────────────────────────────

test('corretoras: hmac-sha256 bate com o vetor conhecido', () => {
  assert.equal(
    hmacHex('key', 'The quick brown fox jumps over the lazy dog'),
    'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8'
  );
  assert.ok(hmacBase64('key', 'msg').length > 20);
});

test('corretoras: cada exchange monta o par do jeito dela', () => {
  assert.equal(binance.par('btc'), 'BTCUSDT');
  assert.equal(bybit.par('doge', 'USDT'), 'DOGEUSDT');
  assert.equal(okx.par('pepe'), 'PEPE-USDT');
});

test('corretoras: arredondarParaPasso respeita o stepSize da corretora', () => {
  assert.equal(arredondarParaPasso(1.23456789, '0.001'), '1.234');
  assert.equal(arredondarParaPasso(0.0000123456, '0.00000001'), '0.00001234');
  assert.equal(arredondarParaPasso(952.3704, '1'), '952');
});

test('corretoras: credenciais vêm de env e de arquivo', () => {
  process.env.COINMIND_BINANCE_API_KEY = 'chave_teste_123';
  process.env.COINMIND_BINANCE_API_SECRET = 'segredo_teste_456';
  assert.ok(configurada('binance'));
  assert.equal(credenciais('binance').apiKey, 'chave_teste_123');
  delete process.env.COINMIND_BINANCE_API_KEY;
  delete process.env.COINMIND_BINANCE_API_SECRET;
  assert.equal(configurada('binance'), false);
});

test('corretoras: registro tem as 3 corretoras e ids únicos', () => {
  const ids = Object.keys(CORRETORAS);
  assert.deepEqual(ids.sort(), ['binance', 'bybit', 'okx']);
  for (const mod of Object.values(CORRETORAS)) {
    assert.ok(mod.nome && mod.env?.apiKey && typeof mod.preco === 'function' && typeof mod.criarOrdem === 'function');
  }
});
