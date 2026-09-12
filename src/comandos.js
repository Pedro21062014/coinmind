// ─────────────────────────────────────────────────────────────────────────────
//  coinmind · comandos da CLI
// ─────────────────────────────────────────────────────────────────────────────

import {
  banner, tabela, titulo, negrito, apagado, vermelho, verde, amarelo, azul,
  magenta, ciano, cinza, verdeNegrito, vermelhoNegrito, cianoNegrito,
  amareloNegrito, fmtUSD, fmtQtd, fmtPreco, fmtPct, sparkline, corResultado,
  seta, sleep, largVisivel, pad,
} from './ui.js';
import { renderizarLetras } from './letras.js';
import { Mercado, RNG, CATEGORIAS, CATALOGO } from './mercado.js';
import {
  carregar, salvar, reiniciar, comprar, vender, valorTotal,
  pnlNaoRealizado, pnlRealizado, caminhoCarteira,
} from './carteira.js';
import { ESTRATEGIAS, decidir, executar, configEstrategia } from './bot.js';
import { comandoCorretoras, comandoReal } from './comandos-real.js';
import { comandoConfig } from './comandos-config.js';
import { lerConfig, pctParaFrac } from './config.js';
import { VERSAO } from './versao.js';

// ── helpers ──────────────────────────────────────────────────────────────────

function parseFlags(args) {
  const opts = {};
  const resto = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const [chave, valorInline] = a.slice(2).split('=');
      if (valorInline !== undefined) opts[chave] = valorInline;
      else if (i + 1 < args.length && !args[i + 1].startsWith('--')) opts[chave] = args[++i];
      else opts[chave] = true;
    } else resto.push(a);
  }
  return { opts, resto };
}

const num = (v, padrao) => {
  if (v === undefined || v === true) return padrao;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : padrao;
};

function emojiCategoria(cat) {
  return CATEGORIAS[cat]?.rotulo ?? cat;
}

function corVariacao(v, txt) {
  return v >= 0 ? verde(txt ?? fmtPct(v)) : vermelho(txt ?? fmtPct(v));
}

// ── ajuda ────────────────────────────────────────────────────────────────────

export function ajuda() {
  console.log(banner());
  console.log(cianoNegrito('USO'));
  console.log(`  ${negrito('coinmind <comando> [opções]')}\n`);
  console.log(cianoNegrito('SIMULAÇÃO (paper trading)'));
  const cmds = [
    ['mercado', 'cotações ao vivo do mercado simulado (opcional: --ciclos N --intervalo ms)'],
    ['comprar <MOEDA> <US$>', 'compra uma moeda com dólares fictícios · ex: comprar PEPE 100'],
    ['vender <MOEDA> [US$|tudo]', 'vende uma moeda · ex: vender DOGE 50  ·  vender DOGE tudo'],
    ['carteira', 'suas posições, saldo e lucro/prejuízo'],
    ['rodar', '🤖 o robô opera sozinho · --estrategia dip|momentum|dca --ciclos 40 --lote 150'],
    ['teste', '🧪 teste real completo: monta carteira, opera e revela LUCRO ou PERDA'],
    ['letras <TEXTO>', 'gera letras gigantes estilo ANSI Shadow · ex: letras HODL'],
    ['historico', 'log de todas as operações'],
    ['reiniciar', 'zera a carteira com novo capital (--capital 10000)'],
  ];
  for (const [cmd, desc] of cmds) {
    console.log(`  ${amarelo(pad(cmd, 26))} ${cinza(desc)}`);
  }
  console.log(`\n${cianoNegrito('🔥 ORDENS REAIS (dinheiro de verdade)')}`);
  const reais = [
    ['corretoras', '💱 corretoras suportadas (Binance, Bybit, OKX) e como configurar'],
    ['real preco <MOEDA>', 'preço real agora · ex: real preco BTC -c bybit'],
    ['real saldo', 'seus saldos reais · ex: real saldo -c binance'],
    ['real comprar <MOEDA> <US$>', 'ordem REAL a mercado · ex: real comprar BTC 25 --prever'],
    ['real vender <MOEDA> <QTD|tudo>', 'ordem REAL a mercado · ex: real vender PEPE tudo --sim'],
  ];
  for (const [cmd, desc] of reais) {
    console.log(`  ${vermelho(pad(cmd, 26))} ${cinza(desc)}`);
  }
  console.log(`\n${cianoNegrito('⚙️  CONFIGURAÇÃO (chaves, modo e estratégia — sem export, direto na CLI)')}`);
  const cfgCmds = [
    ['config', '⚡ assistente interativo: corretora, chaves, modo, estratégia'],
    ['config chaves', 'salva chaves · --corretora binance --api-key K --secret S'],
    ['config modo', 'testnet ou real · ex: config modo --real (padrão: testnet)'],
    ['config estrategia', 'salva sua estratégia · ex: config estrategia dip --lote 120 --queda 5 --lucro 6 --stop 8'],
    ['config mostrar', 'mostra tudo que está salvo'],
  ];
  for (const [cmd, desc] of cfgCmds) {
    console.log(`  ${azul(pad(cmd, 26))} ${cinza(desc)}`);
  }
  console.log(`\n${cianoNegrito('GERAIS')}`);
  for (const [cmd, desc] of [['ajuda', 'mostra esta ajuda'], ['versao', 'mostra a versão']]) {
    console.log(`  ${amarelo(pad(cmd, 26))} ${cinza(desc)}`);
  }
  console.log(`\n${cianoNegrito('ESTRATÉGIAS DO ROBÔ')}`);
  for (const [chave, e] of Object.entries(ESTRATEGIAS)) {
    console.log(`  ${magenta(pad(`${chave} ${e.emoji}`, 26))} ${cinza(`${e.nome} — ${e.desc}`)}`);
  }
  console.log(`\n${cinza('Carteira salva em: ' + caminhoCarteira())}`);
  console.log(`${cinza('⚠️  A simulação é educacional. Ordens reais movimentam dinheiro de verdade — cuidado.')}\n`);
}

// ── mercado ──────────────────────────────────────────────────────────────────

function imprimirMercado(mercado, eventos) {
  const porCategoria = { normal: [], meme: [], web3: [] };
  for (const m of mercado.moedas) porCategoria[m.categoria].push(m);

  for (const [cat, moedas] of Object.entries(porCategoria)) {
    console.log(`\n  ${negrito(emojiCategoria(cat))}`);
    for (const m of moedas) {
      const varSessao = mercado.variacao(m);
      const spark = apagado(sparkline(m.historico, 18));
      const linha = `    ${m.emoji} ${negrito(pad(m.simbolo, 6))} ${cinza(pad(m.nome, 10))} ${pad(fmtPreco(m.preco), 20)} ${corVariacao(varSessao, pad(fmtPct(varSessao), 9))}  ${spark}`;
      console.log(linha);
    }
  }

  if (eventos && eventos.length) {
    console.log(`\n  ${amareloNegrito('📣 EVENTOS')}`);
    for (const ev of eventos.slice(-6)) {
      const imp = ev.impacto >= 0 ? `+${ev.impacto.toFixed(1)}%` : `${ev.impacto.toFixed(1)}%`;
      console.log(`    ${ev.desc} em ${ev.emoji} ${ev.nome} ${corVariacao(ev.impacto, imp)}`);
    }
  }
  console.log();
}

export async function comandoMercado(args) {
  const { opts } = parseFlags(args);
  const ciclos = num(opts.ciclos, 0);
  const intervalo = num(opts.intervalo, 700);
  const mercado = new Mercado(new RNG(opts.semente ? num(opts.semente, 1) : undefined));

  if (ciclos <= 0) {
    console.log(banner());
    mercado.tick();
    imprimirMercado(mercado, []);
    console.log(cinza('  Dica: --ciclos 10 assiste o mercado se mexer ao vivo.\n'));
    return;
  }

  console.log(cianoNegrito(`\n  📡 mercado ao vivo — ${ciclos} ciclos, ${intervalo}ms por ciclo (ctrl+c pra sair)\n`));
  for (let i = 1; i <= ciclos; i++) {
    const eventos = mercado.tick();
    if (i === ciclos || i % 5 === 0) {
      console.log(`${negrito(`  ── ciclo ${i}/${ciclos} `)}${cinza('· valor total do mercado: ' + fmtUSD(mercado.moedas.reduce((s, m) => s + m.preco * 1e6, 0)))}`);
      imprimirMercado(mercado, eventos);
    }
    if (i < ciclos) await sleep(intervalo);
  }
}

// ── comprar / vender ─────────────────────────────────────────────────────────

export function comandoComprar(args) {
  const [simbolo, valorStr] = args;
  if (!simbolo || !valorStr) {
    console.log(vermelho('Uso: coinmind comprar <MOEDA> <US$>   ex: coinmind comprar PEPE 100'));
    return;
  }
  const carteira = carregar();
  const mercado = new Mercado(new RNG());
  mercado.tick();
  const m = mercado.moeda(simbolo);
  const r = comprar(carteira, m.simbolo, num(valorStr, 0), m.preco, mercado.ciclo);
  salvar(carteira);
  console.log(`\n  ${verdeNegrito('✔ COMPRA EXECUTADA')}`);
  console.log(`  ${m.emoji} ${negrito(m.simbolo)} (${m.nome}) a ${fmtPreco(m.preco)}`);
  console.log(`  Quantidade: ${negrito(fmtQtd(r.qtd))} ${m.simbolo}  ·  Total gasto: ${fmtUSD(r.usd)}`);
  console.log(`  Saldo restante: ${fmtUSD(carteira.saldo)}\n`);
}

export function comandoVender(args) {
  const [simbolo, valorStr] = args;
  if (!simbolo) {
    console.log(vermelho('Uso: coinmind vender <MOEDA> [US$|tudo]   ex: coinmind vender DOGE tudo'));
    return;
  }
  const carteira = carregar();
  const mercado = new Mercado(new RNG());
  mercado.tick();
  const m = mercado.moeda(simbolo);
  const usd = !valorStr || valorStr === 'tudo' || valorStr === 'all' ? null : num(valorStr, null);
  const r = vender(carteira, m.simbolo, usd, m.preco, mercado.ciclo);
  salvar(carteira);
  console.log(`\n  ${r.lucro >= 0 ? verdeNegrito('✔ VENDA COM LUCRO') : vermelhoNegrito('✖ VENDA NO PREJUÍZO')}`);
  console.log(`  ${m.emoji} ${negrito(m.simbolo)} (${m.nome}) a ${fmtPreco(m.preco)}`);
  console.log(`  Quantidade: ${negrito(fmtQtd(r.qtd))} ${m.simbolo}  ·  Recebido: ${fmtUSD(r.bruto)}`);
  console.log(`  Resultado: ${corResultado(r.lucro, `${fmtUSD(r.lucro)} (${fmtPct(r.retornoPct)})`)}`);
  console.log(`  Saldo atual: ${fmtUSD(carteira.saldo)}\n`);
}

// ── carteira / histórico / reiniciar ─────────────────────────────────────────

export function comandoCarteira() {
  const carteira = carregar();
  const mercado = new Mercado(new RNG());
  mercado.tick();
  const total = valorTotal(carteira, mercado);
  const rendimento = total / carteira.capitalInicial - 1;

  console.log(banner());
  console.log(`  ${negrito('💰 Patrimônio:')} ${negrito(fmtUSD(total))}  ${corVariacao(rendimento * 100)}`);
  console.log(`  ${negrito('💵 Saldo livre:')} ${fmtUSD(carteira.saldo)}`);
  console.log(`  ${negrito('📈 Realizado:')} ${corResultado(pnlRealizado(carteira), fmtUSD(pnlRealizado(carteira)))}  ${cinza('·')}  ${negrito('⏳ Não realizado:')} ${corResultado(pnlNaoRealizado(carteira, mercado), fmtUSD(pnlNaoRealizado(carteira, mercado)))}`);

  const posicoes = Object.entries(carteira.posicoes);
  if (!posicoes.length) {
    console.log(`\n  ${cinza('Sem posições abertas. Que tal comprar uma DOGE? 🐕')}\n`);
    return;
  }
  console.log(titulo('posições abertas'));
  const linhas = posicoes.map(([simbolo, pos]) => {
    const m = mercado.moeda(simbolo);
    const valor = pos.qtd * m.preco;
    const lucro = pos.qtd * (m.preco - pos.precoMedio);
    const pct = (m.preco / pos.precoMedio - 1) * 100;
    return [
      `${m.emoji} ${negrito(simbolo)}`,
      fmtQtd(pos.qtd),
      fmtPreco(pos.precoMedio),
      fmtPreco(m.preco),
      fmtUSD(valor),
      corResultado(lucro, `${fmtUSD(lucro)} (${fmtPct(pct)})`),
    ];
  });
  console.log(tabela(['MOEDA', 'QTD', 'PREÇO MÉDIO', 'AGORA', 'VALOR', 'L/P'], linhas));
  console.log();
}

export function comandoHistorico() {
  const carteira = carregar();
  console.log(titulo('histórico de operações'));
  if (!carteira.operacoes.length) {
    console.log(`  ${cinza('Nenhuma operação ainda. Comece com: coinmind comprar BTC 100')}\n`);
    return;
  }
  const linhas = carteira.operacoes.slice(-30).map((o) => [
    o.tipo === 'compra' ? verde('COMPRA') : vermelho('VENDA '),
    `${CATALOGO.find((c) => c.simbolo === o.simbolo)?.emoji ?? ''} ${o.simbolo}`,
    fmtQtd(o.qtd),
    fmtPreco(o.preco),
    fmtUSD(o.usd),
    o.lucro === undefined ? apagado('—') : corResultado(o.lucro, fmtUSD(o.lucro)),
  ]);
  console.log(tabela(['TIPO', 'MOEDA', 'QTD', 'PREÇO', 'TOTAL', 'L/P'], linhas));
  console.log();
}

export function comandoReiniciar(args) {
  const { opts } = parseFlags(args);
  const capital = num(opts.capital, 10000);
  reiniciar(capital);
  console.log(`\n  ♻️  Carteira zerada com ${negrito(fmtUSD(capital))}. Bora de novo! 🔄\n`);
}

// ── robô automático ──────────────────────────────────────────────────────────

export async function comandoRodar(args) {
  const { opts } = parseFlags(args);
  const salvo = lerConfig().estrategia || {};
  const estrategia = String(opts.estrategia || opts.estrategias || salvo.nome || 'dip');
  if (!ESTRATEGIAS[estrategia]) {
    console.log(vermelho(`Estratégia inválida: "${estrategia}". Opções: ${Object.keys(ESTRATEGIAS).join(', ')}`));
    return;
  }
  const ciclos = num(opts.ciclos, 40);
  const intervalo = num(opts.intervalo, 200);
  const capital = opts.capital !== undefined ? num(opts.capital, null) : null;

  const carteira = capital !== null ? reiniciar(capital) : carregar();
  const mercado = new Mercado(new RNG(opts.semente ? num(opts.semente, 1) : undefined));
  // prioridade: flags da CLI > estratégia salva no config > padrões
  const cfg = configEstrategia(estrategia, salvo.nome === estrategia ? salvo.cfg : {});
  if (opts.lote !== undefined) cfg.lote = num(opts.lote, cfg.lote);
  if (opts.queda !== undefined) cfg.queda = pctParaFrac(num(opts.queda, cfg.queda));
  if (opts.lucro !== undefined) cfg.lucroAlvo = pctParaFrac(num(opts.lucro, cfg.lucroAlvo));
  if (opts.stop !== undefined) cfg.stopLoss = pctParaFrac(num(opts.stop, cfg.stopLoss));
  if (opts.curta !== undefined) cfg.curta = num(opts.curta, cfg.curta);
  if (opts.longa !== undefined) cfg.longa = num(opts.longa, cfg.longa);
  if (opts.cada !== undefined) cfg.cadaNCiclos = num(opts.cada, cfg.cadaNCiclos);
  if (opts.moedas) cfg.moedas = String(opts.moedas).split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  const origem = opts.estrategia || opts.lote || opts.queda || opts.lucro || opts.stop ? 'ajustes da CLI' : salvo.nome === estrategia ? 'config salvo' : 'padrões';
  const eq = [];

  console.log(banner());
  console.log(`  ${negrito(`🤖 ${ESTRATEGIAS[estrategia].emoji} ${ESTRATEGIAS[estrategia].nome}`)} ${cinza('— ' + ESTRATEGIAS[estrategia].desc)}`);
  console.log(`  ${cinza(`${ciclos} ciclos · ${intervalo}ms · lote de ${fmtUSD(cfg.lote)} · ${origem}`)}\n`);

  for (let i = 1; i <= ciclos; i++) {
    mercado.tick();
    const acoes = decidir(estrategia, mercado, carteira, cfg);
    const feitas = executar(mercado, carteira, acoes, i);
    const total = valorTotal(carteira, mercado);
    eq.push(total);
    salvar(carteira);

    for (const f of feitas) {
      const m = mercado.moeda(f.simbolo);
      if (f.acao === 'compra') {
        console.log(`  ${verde(`[ciclo ${String(i).padStart(3)}]`)} 🟢 COMPROU  ${m.emoji} ${pad(f.simbolo, 5)} ${fmtUSD(f.usd).padEnd(16)} ${cinza(f.motivo)}`);
      } else {
        console.log(`  ${vermelho(`[ciclo ${String(i).padStart(3)}]`)} 🔴 VENDEU   ${m.emoji} ${pad(f.simbolo, 5)} ${fmtUSD(f.usd).padEnd(16)} ${corResultado(f.lucro, `${fmtUSD(f.lucro)} ${fmtPct(f.retornoPct)}`)} ${cinza(f.motivo)}`);
      }
    }
    if (i % 10 === 0) {
      const rend = total / carteira.capitalInicial - 1;
      console.log(`  ${apagado(`· · · ciclo ${i}/${ciclos} · patrimônio ${fmtUSD(total)} (${fmtPct(rend * 100)}) ${sparkline(eq, 24)}`)}`);
    }
    if (i < ciclos) await sleep(intervalo);
  }

  relatorioFinal(mercado, carteira, eq, estrategia);
}

function relatorioFinal(mercado, carteira, eq, estrategia) {
  const total = valorTotal(carteira, mercado);
  const resultado = total - carteira.capitalInicial;
  const pct = (total / carteira.capitalInicial - 1) * 100;
  const deuLucro = resultado >= 0;

  console.log(relatorio(mercado, carteira, eq, total, resultado, pct, deuLucro, estrategia));
}

function relatorio(mercado, carteira, eq, total, resultado, pct, deuLucro, estrategia) {
  const partes = [];
  partes.push('\n' + titulo('relatório final'));
  const linhas = Object.entries(carteira.posicoes).map(([simbolo, pos]) => {
    const m = mercado.moeda(simbolo);
    const valor = pos.qtd * m.preco;
    const lucro = pos.qtd * (m.preco - pos.precoMedio);
    return [
      `${m.emoji} ${simbolo}`,
      fmtQtd(pos.qtd),
      fmtUSD(pos.investido),
      fmtUSD(valor),
      corResultado(lucro, fmtUSD(lucro)),
    ];
  });
  if (linhas.length) partes.push(tabela(['MOEDA', 'QTD', 'INVESTIDO', 'VALOR AGORA', 'L/P'], linhas) + '\n');
  partes.push(`  ${negrito('Patrimônio final:')} ${negrito(fmtUSD(total))}  ${corResultado(resultado, `${fmtUSD(resultado)} (${fmtPct(pct)})`)}`);
  partes.push(`  ${negrito('Realizado:')} ${corResultado(pnlRealizado(carteira), fmtUSD(pnlRealizado(carteira)))}   ${negrito('Em aberto:')} ${corResultado(pnlNaoRealizado(carteira, mercado), fmtUSD(pnlNaoRealizado(carteira, mercado)))}`);
  partes.push(`  ${negrito('Curva do patrimônio:')} ${sparkline(eq, 48)}\n`);
  partes.push(veredito(deuLucro, resultado, pct, estrategia));
  return partes.join('\n');
}

function veredito(deuLucro, resultado, pct, estrategia) {
  const arte = renderizarLetras(deuLucro ? 'LUCRO' : 'PERDA');
  const pinta = deuLucro ? verdeNegrito : vermelhoNegrito;
  const emoji = deuLucro ? '🎉🚀💰' : '💀🩸🔥';
  const frase = deuLucro
    ? `O robô${estrategia ? ` (${estrategia})` : ''} fez dinheiro! Vende antes que vire meme.`
    : `O robô${estrategia ? ` (${estrategia})` : ''} levou um rug na moral. Acontece com os melhores.`;
  return [
    pinta(arte),
    `  ${pinta(`${fmtUSD(Math.abs(resultado))} ${deuLucro ? 'DE LUCRO' : 'DE PERDA'} (${fmtPct(pct)})`)}  ${emoji}`,
    `  ${cinza(frase)}`,
    '',
  ].join('\n');
}

// ── TESTE REAL ───────────────────────────────────────────────────────────────

export async function comandoTeste(args) {
  const { opts } = parseFlags(args);
  const ciclos = num(opts.ciclos, 60);
  const intervalo = num(opts.intervalo, 120);
  const semente = opts.semente !== undefined ? num(opts.semente, 1) : undefined;
  const rng = new RNG(semente ?? undefined);
  const mercado = new Mercado(rng);
  const capital = 1000;

  console.log(banner());
  console.log(cianoNegrito('  🧪 TESTE REAL DO ROBÔ — carteira de ' + fmtUSD(capital) + ', moedas de exemplo, sem dó de verdade'));
  console.log(cinza(`  ${semente !== undefined ? `semente ${semente} (rodada reproduzível)` : 'rodada 100% aleatória'} · ${ciclos} ciclos de mercado\n`));

  // fase 1: aquece o mercado
  console.log(amareloNegrito('  ▸ FASE 1 · AQUECENDO O MERCADO'));
  for (let i = 0; i < 4; i++) mercado.tick();
  for (const m of mercado.moedas.slice(0, 4)) {
    console.log(`    ${m.emoji} ${pad(m.simbolo, 5)} ${fmtPreco(m.preco)}`);
  }

  // fase 2: monta a carteira exemplo
  console.log(`\n${amareloNegrito('  ▸ FASE 2 · MONTANDO A CARTEIRA EXEMPLO')} ${cinza('(blue chips + memes + web3)')}`);
  const cesta = [
    ['BTC', 250], ['ETH', 200], ['SOL', 150],
    ['LINK', 150], ['DOGE', 150], ['PEPE', 100],
  ];
  const carteira = reiniciar(capital);
  const investidoPorMoeda = {};
  for (const [simbolo, usd] of cesta) {
    const m = mercado.moeda(simbolo);
    comprar(carteira, simbolo, usd, m.preco, mercado.ciclo);
    investidoPorMoeda[simbolo] = usd;
    console.log(`    🟢 ${m.emoji} ${pad(simbolo, 5)} ${fmtUSD(usd).padEnd(13)} → ${fmtQtd(usd / m.preco)} ${simbolo} ${cinza(`@ ${fmtPreco(m.preco)}`)}`);
  }
  salvar(carteira);

  // fase 3: o robô opera
  console.log(`\n${amareloNegrito('  ▸ FASE 3 · O ROBÔ OPERA SOZINHO')} ${cinza(`(estrategia dip · ${ciclos} ciclos)`)}`);
  const cfg = configEstrategia('dip', { lote: 120, queda: 0.04, lucroAlvo: 0.05, stopLoss: 0.07 });
  const eq = [];
  const eventosVistos = [];
  for (let i = 1; i <= ciclos; i++) {
    const eventos = mercado.tick();
    eventosVistos.push(...eventos);
    const acoes = decidir('dip', mercado, carteira, cfg);
    const feitas = executar(mercado, carteira, acoes, i);
    eq.push(valorTotal(carteira, mercado));
    salvar(carteira);
    for (const f of feitas) {
      const m = mercado.moeda(f.simbolo);
      if (f.acao === 'compra') {
        console.log(`    ${verde(`[c${String(i).padStart(3)}]`)} 🟢 comprou  ${m.emoji} ${pad(f.simbolo, 5)} ${fmtUSD(f.usd)}  ${cinza(f.motivo)}`);
        investidoPorMoeda[f.simbolo] = (investidoPorMoeda[f.simbolo] || 0) + f.usd;
      } else {
        console.log(`    ${vermelho(`[c${String(i).padStart(3)}]`)} 🔴 vendeu   ${m.emoji} ${pad(f.simbolo, 5)} ${fmtUSD(f.usd).padEnd(13)} ${corResultado(f.lucro, `${fmtUSD(f.lucro)} ${fmtPct(f.retornoPct)}`)}  ${cinza(f.motivo)}`);
      }
    }
    if (i % 15 === 0) {
      const t = eq[eq.length - 1];
      console.log(`    ${apagado(`· ciclo ${i}/${ciclos} · patrimônio ${fmtUSD(t)} (${fmtPct((t / capital - 1) * 100)}) ${sparkline(eq, 24)}`)}`);
    }
    if (i < ciclos) await sleep(intervalo);
  }

  // fase 4: vende tudo
  console.log(`\n${amareloNegrito('  ▸ FASE 4 · ENCERRANDO: VENDENDO TUDO AO PREÇO FINAL')}`);
  const comprasPorMoeda = {};
  const realizadoParcial = {};
  for (const o of carteira.operacoes) {
    if (o.tipo === 'compra') comprasPorMoeda[o.simbolo] = (comprasPorMoeda[o.simbolo] || 0) + o.usd;
    else realizadoParcial[o.simbolo] = (realizadoParcial[o.simbolo] || 0) + o.lucro;
  }
  const liquidacaoPorMoeda = {};
  for (const simbolo of [...Object.keys(carteira.posicoes)]) {
    const m = mercado.moeda(simbolo);
    const r = vender(carteira, simbolo, null, m.preco, mercado.ciclo);
    liquidacaoPorMoeda[simbolo] = r.lucro;
    console.log(`    🔴 ${m.emoji} ${pad(simbolo, 5)} liquidez final ${fmtUSD(r.bruto).padEnd(13)} ${corResultado(r.lucro, fmtUSD(r.lucro))}`);
  }
  salvar(carteira);

  // relatório final
  const total = carteira.saldo;
  const resultado = total - capital;
  const pct = (total / capital - 1) * 100;
  const deuLucro = resultado >= 0;

  console.log(`\n${titulo('resultado por moeda')}`);
  const linhas = Object.keys(comprasPorMoeda).map((simbolo) => {
    const m = mercado.moeda(simbolo);
    const parc = realizadoParcial[simbolo] || 0;
    const liq = liquidacaoPorMoeda[simbolo] || 0;
    return [
      `${m.emoji} ${simbolo}`,
      fmtUSD(comprasPorMoeda[simbolo]),
      parc ? corResultado(parc, fmtUSD(parc)) : apagado('—'),
      liq ? corResultado(liq, fmtUSD(liq)) : apagado('—'),
      corResultado(parc + liq, fmtUSD(parc + liq)),
    ];
  });
  linhas.push([negrito('TOTAL'), negrito(fmtUSD(capital)), '', '', corResultado(resultado, negrito(fmtUSD(resultado)))]);
  console.log(tabela(['MOEDA', 'COMPRADO', 'VENDAS PARCIAIS', 'LIQUIDAÇÃO', 'LUCRO/PERDA'], linhas));

  if (eventosVistos.length) {
    console.log(`\n${titulo('drama do mercado (eventos que marcaram o teste)')}`);
    const ordenados = [...eventosVistos].sort((a, b) => Math.abs(b.impacto) - Math.abs(a.impacto)).slice(0, 6);
    for (const ev of ordenados) {
      const imp = ev.impacto >= 0 ? `+${ev.impacto.toFixed(0)}%` : `${ev.impacto.toFixed(0)}%`;
      console.log(`    [ciclo ${String(ev.ciclo).padStart(3)}] ${ev.desc} → ${ev.emoji} ${pad(ev.nome, 10)} ${corVariacao(ev.impacto, imp)}`);
    }
  }

  console.log(`\n${titulo('curva do patrimônio durante o teste')}`);
  console.log(`    ${sparkline(eq, 60)}`);

  console.log('\n' + veredito(deuLucro, resultado, pct, 'teste'));
  console.log(cinza('  ⚠️  isto foi uma SIMULAÇÃO — mercado de verdade não tem semente, tem almoço.\n'));
}

// ── letras ───────────────────────────────────────────────────────────────────

export function comandoLetras(args) {
  const texto = args.join(' ');
  if (!texto) {
    console.log(vermelho('Uso: coinmind letras <TEXTO>   ex: coinmind letras HODL'));
    return;
  }
  console.log('\n' + cianoNegrito(renderizarLetras(texto)) + '\n');
}

// ── versão ───────────────────────────────────────────────────────────────────

export function comandoVersao() {
  console.log(`coinmind v${VERSAO}`);
}

// ── dispatcher ───────────────────────────────────────────────────────────────

const ALIASES = {
  ajuda: ajuda, help: ajuda, '--help': ajuda, '-h': ajuda,
  mercado: comandoMercado, market: comandoMercado, m: comandoMercado,
  comprar: comandoComprar, buy: comandoComprar, c: comandoComprar,
  vender: comandoVender, sell: comandoVender, v: comandoVender,
  carteira: comandoCarteira, portfolio: comandoCarteira, wallet: comandoCarteira,
  rodar: comandoRodar, run: comandoRodar, robo: comandoRodar,
  teste: comandoTeste, test: comandoTeste, t: comandoTeste,
  letras: comandoLetras, ascii: comandoLetras,
  historico: comandoHistorico, history: comandoHistorico,
  reiniciar: comandoReiniciar, reset: comandoReiniciar,
  corretoras: comandoCorretoras, exchanges: comandoCorretoras, corretora: comandoCorretoras,
  config: comandoConfig, configurar: comandoConfig, setup: comandoConfig,
  estrategia: (...a) => comandoConfig(['estrategia', ...a]),
  real: comandoReal, live: comandoReal,
  versao: comandoVersao, '--version': comandoVersao, '-v': comandoVersao,
};

export async function main(argv) {
  const [cmd, ...args] = argv;
  const fn = ALIASES[cmd];
  if (!fn) {
    if (cmd) console.log(vermelho(`Comando desconhecido: ${cmd}\n`));
    ajuda();
    return;
  }
  await fn(args);
}
