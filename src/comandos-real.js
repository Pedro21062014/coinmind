// ─────────────────────────────────────────────────────────────────────────────
//  coinmind · ORDENS REAIS 🔥 — comandos que falam com corretoras de verdade
//  O MODO (testnet/real) vem do "coinmind config modo" e pode ser sobrescrito
//  na execução com --real ou --testnet.
//  Segurança em camadas:
//    · comando separado sob "real" (impossível confundir com simulação)
//    · --prever mostra a ordem sem enviar nada
//    · sem --sim, pede confirmação digitada (SIM) no terminal
//    · padrão é testnet — modo real só se você configurou explicitamente
//    · segredos nunca aparecem na tela (só ••••últimos4)
// ─────────────────────────────────────────────────────────────────────────────

import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import {
  banner, titulo, tabela, negrito, apagado, vermelho, verde, amarelo,
  cianoNegrito, cinza, verdeNegrito, vermelhoNegrito, amareloNegrito,
  fmtUSD, fmtQtd, fmtPreco, corResultado,
} from './ui.js';
import { CORRETORAS, configurada, contexto } from './corretoras/index.js';
import { mascara } from './corretoras/util.js';
import { lerConfig } from './config.js';

function parseFlags(args) {
  const opts = {};
  const resto = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const [chave, valorInline] = a.slice(2).split('=');
      if (valorInline !== undefined) opts[chave] = valorInline;
      else if (i + 1 < args.length && !args[i + 1].startsWith('--') && ['corretora', 'quote'].includes(a.slice(2))) opts[chave] = args[++i];
      else opts[chave] = true;
    } else if (a === '-c' && i + 1 < args.length) {
      opts.corretora = args[++i];
    } else resto.push(a);
  }
  return { opts, resto };
}

function avisoModo(modo) {
  if (modo === 'real') {
    console.log(`\n  ${vermelhoNegrito('⚠️  MODO REAL — ISSO É DINHEIRO DE VERDADE')} ${vermelho('(configurado com coinmind config modo --real)')}`);
    console.log(`  ${vermelho('Memecoins são voláteis DEMAIS. Revise a ordem. Nada aqui é conselho financeiro.')}`);
  } else {
    console.log(`\n  ${amareloNegrito('🧪 MODO TESTNET — dinheiro de MENTIRA, pode errar à vontade.')}`);
    console.log(`  ${cinza('Pra operar com dinheiro de verdade: coinmind config modo --real')}`);
  }
  console.log();
}

async function confirmar(opts, resumo) {
  if (opts.prever) {
    console.log(`\n  ${amarelo('👁️  MODO PREVER — nada foi enviado à corretora.')}`);
    console.log(`  ${cinza('Rode de novo com --sim pra executar de verdade.')}\n`);
    return false;
  }
  if (opts.sim) return true;
  if (!stdin.isTTY) {
    throw new Error(
      'Ordem real precisa de confirmação: rode num terminal (vai pedir pra digitar SIM) ou use --sim pra pular a confirmação.'
    );
  }
  const rl = readline.createInterface({ input: stdin, output: stdout });
  console.log(resumo);
  const r = await rl.question(`\n  ${vermelhoNegrito('Digite SIM para enviar a ordem REAL')} (qualquer outra coisa cancela): `);
  rl.close();
  return r.trim().toUpperCase() === 'SIM';
}

// ── coinmind corretoras ──────────────────────────────────────────────────────

export async function comandoCorretoras() {
  const c = lerConfig();
  console.log(banner());
  console.log(titulo('corretoras de verdade suportadas'));
  const linhas = Object.values(CORRETORAS).map((mod) => {
    const ch = c.chaves?.[mod.id];
    return [
      `${negrito(mod.nome)}${c.corretora === mod.id ? verde(' ← padrão') : ''}`,
      ch ? verde(`✓ chaves salvas`) : configurada(mod.id) ? amarelo('✓ via ambiente') : cinza('não configurada'),
      cinza(`config chaves --corretora ${mod.id}`),
    ];
  });
  console.log(tabela(['CORRETORA', 'STATUS', 'COMO CONFIGURAR'], linhas));

  const modo = c.modo || 'testnet';
  console.log(`\n  ${negrito('Modo atual:')} ${modo === 'real' ? vermelhoNegrito('REAL 🔥 (dinheiro de verdade)') : amareloNegrito('TESTNET 🧪 (dinheiro de mentira)')}`);
  console.log(`  ${cinza(`trocar com: coinmind config modo --${modo === 'real' ? 'testnet' : 'real'}`)}`);

  console.log(`
  ${cianoNegrito('Comece em 30 segundos')}

    ${negrito('coinmind config')}
    ${cinza('↑ assistente interativo pergunta: corretora, chaves, modo e estratégia')}

    ${negrito('coinmind real comprar DOGE 10')}
    ${cinza('↑ envia a ordem usando o que você configurou (use --prever pra ensaio)')}

  ${amarelo('🔒 Dicas de segurança:')}
    ${cinza('· crie a chave SÓ com permissão de "Spot Trading" (nunca saque)')}
    ${cinza('· restrinja a chave ao seu IP na corretora')}
    ${cinza('· os segredos ficam só na sua máquina — o coinmind nunca os envia pra outro lugar')}
`);
}

// ── subcomandos de `real` ────────────────────────────────────────────────────

function linhaOrdem(ctx, o) {
  return [
    `  ${cinza('corretora')}  ${negrito(ctx.mod.nome)}${ctx.modo === 'testnet' ? amarelo(' · TESTNET (dinheiro de mentira)') : vermelho(' · PRODUÇÃO (dinheiro de verdade)')}`,
    `  ${cinza('chave')}      ${cinza(mascara(ctx.cfg.apiKey))}`,
    `  ${cinza('par')}        ${negrito(ctx.mod.par(o.simbolo, o.quote))}`,
    `  ${cinza('tipo')}       ${negrito('ordem a MERCADO')}`,
    o.usd !== undefined
      ? `  ${cinza('valor')}      ${negrito(fmtUSD(o.usd))} em ${o.quote}`
      : `  ${cinza('quantidade')} ${negrito(String(o.qtd))} ${o.simbolo}`,
  ].join('\n');
}

async function executarERelatar(ctx, o) {
  const r = await ctx.mod.criarOrdem(ctx.cfg, o);
  console.log(`\n  ${verdeNegrito(`📨 ORDEM ${o.lado.toUpperCase()} ENVIADA`)}  ${cinza(`id ${r.idOrdem}`)}`);
  console.log(`  ${cinza('status inicial:')} ${r.status}`);
  await new Promise((res) => setTimeout(res, 1200));
  try {
    const d = await ctx.mod.consultarOrdem(ctx.cfg, r.par, r.idOrdem);
    console.log(`  ${cinza('status agora:')}   ${d.status}`);
    if (d.qtdExecutada > 0) {
      console.log(`  ${cinza('executado:')}     ${negrito(fmtQtd(d.qtdExecutada))} ${o.simbolo}`);
      if (d.precoMedio) console.log(`  ${cinza('preço médio:')}   ${fmtPreco(d.precoMedio)}`);
      if (d.brutoExecutado > 0) console.log(`  ${cinza('total:')}         ${fmtUSD(d.brutoExecutado)}`);
    }
  } catch (e) {
    console.log(`  ${cinza(`(não consegui consultar o preenchimento: ${e.message})`)}`);
  }
  console.log();
}

export async function comandoReal(args) {
  const [sub, ...resto] = args;
  const { opts } = parseFlags(resto);

  if (!sub || ['ajuda', 'help'].includes(sub)) {
    console.log(banner());
    const modo = lerConfig().modo || 'testnet';
    console.log(cianoNegrito('USO: coinmind real <subcomando> [opções]\n'));
    console.log(`  ${cinza('modo atual: ')}${modo === 'real' ? vermelhoNegrito('REAL 🔥') : amareloNegrito('TESTNET 🧪')} ${cinza('· mude com: coinmind config modo --real|--testnet  (ou --real/--testnet no comando)')}\n`);
    const cmds = [
      ['real preco <MOEDA>', 'preço real agora · ex: real preco BTC'],
      ['real saldo', 'seus saldos reais na corretora'],
      ['real comprar <MOEDA> <US$>', 'ordem REAL a mercado · ex: real comprar BTC 25 --prever'],
      ['real vender <MOEDA> <QTD|tudo>', 'ordem REAL a mercado · ex: real vender PEPE tudo'],
    ];
    for (const [c, d] of cmds) console.log(`  ${amarelo(c.padEnd(34))} ${cinza(d)}`);
    console.log(`\n  ${cinza('opções: -c/--corretora binance|bybit|okx · --quote USDT · --real · --testnet')}`);
    console.log(`  ${cinza('       --prever (só mostra a ordem) · --sim (envia sem perguntar)')}\n`);
    return;
  }

  const quote = String(opts.quote || 'USDT').toUpperCase();
  const ctx = contexto({
    corretora: opts.corretora,
    modo: opts.real ? 'real' : opts.testnet ? 'testnet' : undefined,
    precoPublico: sub === 'preco',
    permitirSemCredenciais: !!opts.prever,
  });

  // ── preco (público, não precisa de chave)
  if (sub === 'preco') {
    const simbolo = String(resto[0] || '').toUpperCase();
    if (!simbolo) throw new Error('Uso: coinmind real preco <MOEDA>   ex: coinmind real preco BTC -c bybit');
    const preco = await ctx.mod.preco(ctx.cfg, simbolo, quote);
    console.log(`\n  ${negrito(ctx.mod.nome)} · ${negrito(simbolo)} em ${quote}: ${verdeNegrito(fmtPreco(preco))}${ctx.modo === 'testnet' ? amarelo(' (testnet)') : ''}\n`);
    return;
  }

  // ── saldo
  if (sub === 'saldo') {
    avisoModo(ctx.modo);
    const saldos = await ctx.mod.saldo(ctx.cfg);
    if (!saldos.length) {
      console.log(`  ${cinza('Nenhum saldo livre na ' + ctx.mod.nome + '.')}\n`);
      return;
    }
    console.log(`  ${negrito(`💰 Saldos na ${ctx.mod.nome}`)}${ctx.modo === 'testnet' ? amarelo(' (TESTNET)') : vermelho(' (PRODUÇÃO)')} ${cinza(`· chave ${mascara(ctx.cfg.apiKey)}`)}\n`);
    console.log(tabela(['ATIVO', 'DISPONÍVEL'], saldos.map((s) => [s.ativo, fmtQtd(s.livre)])));
    console.log();
    return;
  }

  // ── comprar
  if (sub === 'comprar') {
    const simbolo = String(resto[0] || '').toUpperCase();
    const usd = Number(String(resto[1] || '').replace(',', '.'));
    if (!simbolo || !isFinite(usd) || usd <= 0) {
      throw new Error('Uso: coinmind real comprar <MOEDA> <US$>   ex: coinmind real comprar BTC 25');
    }
    avisoModo(ctx.modo);
    const o = { lado: 'compra', simbolo, quote, usd };
    console.log(`  ${titulo('ordem a ser enviada').trim()}`);
    console.log(linhaOrdem(ctx, o));
    if (!(await confirmar(opts, ''))) return;
    await executarERelatar(ctx, o);
    return;
  }

  // ── vender
  if (sub === 'vender') {
    const simbolo = String(resto[0] || '').toUpperCase();
    const quantos = resto[1];
    if (!simbolo || !quantos) {
      throw new Error('Uso: coinmind real vender <MOEDA> <QTD|tudo>   ex: coinmind real vender PEPE tudo');
    }
    avisoModo(ctx.modo);
    let qtd;
    if (['tudo', 'all', 'max'].includes(String(quantos).toLowerCase())) {
      console.log(`  ${cinza('buscando seu saldo de ' + simbolo + ' na ' + ctx.mod.nome + '...')}`);
      const saldos = await ctx.mod.saldo(ctx.cfg);
      const pos = saldos.find((s) => s.ativo === simbolo);
      if (!pos) throw new Error(`Você não tem ${simbolo} na ${ctx.mod.nome}.`);
      qtd = pos.livre;
      console.log(`  ${cinza('saldo livre:')} ${fmtQtd(qtd)} ${simbolo}`);
    } else {
      qtd = Number(String(quantos).replace(',', '.'));
      if (!isFinite(qtd) || qtd <= 0) throw new Error(`Quantidade inválida: ${quantos}`);
    }
    const o = { lado: 'venda', simbolo, quote, qtd };
    console.log(`\n  ${titulo('ordem a ser enviada').trim()}`);
    console.log(linhaOrdem(ctx, o));
    if (!(await confirmar(opts, ''))) return;
    await executarERelatar(ctx, o);
    return;
  }

  throw new Error(`Subcomando real desconhecido: "${sub}". Use: preco | saldo | comprar | vender`);
}
