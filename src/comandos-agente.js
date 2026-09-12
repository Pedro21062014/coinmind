// ─────────────────────────────────────────────────────────────────────────────
//  coinmind · comandos do AGENTE 24H
//    coinmind agente                     → painel de status
//    coinmind agente ligar               → LIGA o robô autônomo (pede confirmação)
//    coinmind agente desligar            → DESLIGA (mesmo rodando em outro terminal)
//    coinmind agente ia --api-key ...    → conecta o cérebro de IA (opcional)
//    coinmind agente limites ...         → limites de risco
// ─────────────────────────────────────────────────────────────────────────────

import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import {
  banner, titulo, tabela, negrito, apagado, vermelho, verde, amarelo, azul,
  cianoNegrito, cinza, verdeNegrito, vermelhoNegrito, amareloNegrito,
  fmtUSD, fmtQtd, fmtPreco, fmtPct, corResultado,
} from './ui.js';
import { lerConfig, salvarConfig, pctParaFrac } from './config.js';
import { contexto } from './corretoras/index.js';
import { mascara } from './corretoras/util.js';
import { ESTRATEGIAS, configEstrategia } from './bot.js';
import {
  lerEstado, salvarEstado, estadoInicial, pidVivo, LIMITES_PADRAO,
  decidirTick, limiteBloqueia, iaConfigurada, consultarIA, testarIA,
} from './agente.js';

function parseFlags(args) {
  const opts = {};
  const resto = [];
  const comValor = ['corretora', 'api-key', 'base-url', 'modelo', 'max-ordem', 'max-dia', 'perda-dia', 'cooldown', 'moedas', 'lote', 'queda', 'lucro', 'stop', 'curta', 'longa', 'cada', 'intervalo', 'ciclos'];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const [chave, inline] = a.slice(2).split('=');
      if (inline !== undefined) opts[chave] = inline;
      else if (comValor.includes(chave) && i + 1 < args.length && !args[i + 1].startsWith('--')) opts[chave] = args[++i];
      else opts[chave] = true;
    } else resto.push(a);
  }
  return { opts, resto };
}

const num = (v, padrao) => {
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : padrao;
};

const agoraHora = () => new Date().toLocaleTimeString('pt-BR', { hour12: false });

// ── painel de status ─────────────────────────────────────────────────────────

export async function comandoAgenteStatus() {
  const cfgGeral = lerConfig();
  const estado = lerEstado();
  const limites = { ...LIMITES_PADRAO, ...(cfgGeral.agente?.limites || {}) };
  const ia = cfgGeral.ia;
  const rodando = estado.ligado && pidVivo(estado.pid);

  console.log(banner());
  console.log(titulo('🤖 agente 24h — status'));
  console.log(`  ${cinza('estado:')}      ${rodando ? verdeNegrito('🟢 RODANDO AGORA') : estado.ligado ? amarelo('⚠ marcado como ligado mas o processo morreu') : vermelho('⚪ desligado (padrão — precisa ligar na mão)')}`);
  if (estado.pid) console.log(`  ${cinza('processo:')}    PID ${estado.pid} ${cinza(`· desde ${estado.iniciadoEm?.replace('T', ' ').slice(0, 19) || '—'}`)}`);
  console.log(`  ${cinza('corretora:')}   ${negrito(cfgGeral.corretora || '(não configurada)')}  ${cinza('· modo:')} ${cfgGeral.modo === 'real' ? vermelhoNegrito('REAL 🔥') : amareloNegrito('TESTNET 🧪')}`);
  const estr = cfgGeral.estrategia?.nome || 'dip';
  console.log(`  ${cinza('estratégia:')}  ${negrito(estr + ' ' + (ESTRATEGIAS[estr]?.emoji || ''))} ${cinza(JSON.stringify(cfgGeral.estrategia?.cfg || {}))}`);
  console.log(`  ${cinza('cérebro IA:')}   ${iaConfigurada(ia) ? verde(`🧠 conectado (${ia.modelo})`) : cinza('desconectada — o robô usa só a estratégia · conecte com: coinmind agente ia --api-key ...')}`);
  console.log(`  ${cinza('limites:')}     máx US$ ${limites.maxOrdem}/ordem · teto US$ ${limites.maxPosicao} · desliga se perder US$ ${limites.perdaDia} no dia · cooldown ${limites.cooldown}s`);
  console.log(`  ${cinza('moedas:')}      ${limites.moedas.join(', ')}`);

  if (estado.trades?.length) {
    console.log(titulo('trades do agente (últimos 10)'));
    const linhas = estado.trades.slice(-10).reverse().map((t) => [
      (t.quando || '').replace('T', ' ').slice(5, 16),
      t.acao === 'compra' ? verde('COMPRA ') : vermelho('VENDA  '),
      `${t.simbolo}`,
      fmtUSD(t.usd || 0),
      t.lucro === undefined || t.lucro === null ? apagado('—') : corResultado(t.lucro, fmtUSD(t.lucro)),
      cinza((t.motivo || '').slice(0, 46)),
    ]);
    console.log(tabela(['QUANDO', 'AÇÃO', 'MOEDA', 'VALOR', 'L/P', 'MOTIVO'], linhas));
    console.log(`\n  ${cinza('realizado hoje:')} ${corResultado(estado.realizadoDia, fmtUSD(estado.realizadoDia))} ${cinza(`(desliga em -US$ ${limites.perdaDia})`)}`);
  }
  if (estado.pausadoMotivo) {
    console.log(`\n  ${vermelhoNegrito('⏸ motivo da última parada:')} ${vermelho(estado.pausadoMotivo)}`);
  }
  console.log(`\n  ${cinza('ligar: coinmind agente ligar  ·  desligar: coinmind agente desligar')}\n`);
}

// ── desligar ─────────────────────────────────────────────────────────────────

async function agenteDesligar() {
  const estado = lerEstado();
  if (!estado.ligado && !pidVivo(estado.pid)) {
    console.log(`\n  ${cinza('O agente já está desligado.')} ${cinza('Pra ligar: coinmind agente ligar')}\n`);
    return;
  }
  if (pidVivo(estado.pid) && estado.pid !== process.pid) {
    try {
      process.kill(estado.pid, 'SIGTERM');
      console.log(`\n  ${amareloNegrito('⏹  sinal de desligamento enviado ao agente')} ${cinza(`(PID ${estado.pid})`)}`);
      console.log(`  ${cinza('ele finaliza o tick atual, salva tudo e para em segundos.')}\n`);
    } catch (e) {
      console.log(vermelho(`\n  Não consegui sinalizar o PID ${estado.pid}: ${e.message}\n`));
    }
  }
  const novo = { ...estado, ligado: false, pausadoMotivo: 'desligado por comando' };
  salvarEstado(novo);
  if (estado.pid === process.pid) process.emit('SIGINT');
}

// ── configurar IA / limites ──────────────────────────────────────────────────

async function agenteIA(args) {
  const { opts } = parseFlags(args);
  const atual = lerConfig().ia || {};
  const apiKey = opts['api-key'] || atual.apiKey;
  const baseUrl = opts['base-url'] || atual.baseUrl || process.env.COINMIND_IA_BASE_URL || 'https://api.openai.com/v1';
  const modelo = opts.modelo || atual.modelo || process.env.COINMIND_IA_MODELO || 'gpt-4o-mini';

  if (!apiKey) {
    console.log(cianoNegrito('\n🧠 CÉREBRO DE IA DO AGENTE (opcional)'));
    console.log(`\n  ${cinza('Sem IA, o agente opera só com a estratégia. Com IA, cada ENTRADA é')}`);
    console.log(`  ${cinza('analisada pelo modelo, que APROVA ou VETA a operação (fail-safe: erro = veta).')}`);
    console.log(`\n  ${negrito('Conectar:')}`);
    console.log(`  ${amarelo('coinmind agente ia --api-key SUA_KEY')}`);
    console.log(`  ${cinza('opções: --base-url https://api.groq.com/openai/v1  --modelo llama-3.3-70b-versatile')}`);
    console.log(`  ${cinza('funciona com: OpenAI · Groq · OpenRouter · Ollama (http://localhost:11434/v1) · qualquer endpoint OpenAI-compatível')}\n`);
    return;
  }

  salvarConfig({ ia: { apiKey, baseUrl, modelo } });
  console.log(`\n  ${verdeNegrito('✅ IA conectada')} ${cinza(`· modelo ${negrito(modelo)} · ${mascara(apiKey)} · ${baseUrl}`)}`);

  if (opts.testar || true) {
    console.log(`  ${cinza('testando o cérebro...')}`);
    try {
      const r = await testarIA({ apiKey, baseUrl, modelo });
      console.log(`  ${verde('✓ a IA respondeu:')} ${negrito(r.slice(0, 60))}`);
      console.log(`  ${cinza('a partir de agora o agente consulta ela antes de cada compra.')}\n`);
    } catch (e) {
      console.log(`  ${vermelho('✗ ' + e.message)}`);
      console.log(`  ${cinza('salvei a configuração, mas confira a chave/base-url. O agente vetaria trades enquanto a IA não responder.')}\n`);
    }
  }
}

function agenteLimites(args) {
  const { opts } = parseFlags(args);
  const atual = { ...LIMITES_PADRAO, ...(lerConfig().agente?.limites || {}) };
  const novos = { ...atual };
  if (opts['max-ordem'] !== undefined) novos.maxOrdem = num(opts['max-ordem'], atual.maxOrdem);
  if (opts['max-dia'] !== undefined) novos.maxPosicao = num(opts['max-dia'], atual.maxPosicao);
  if (opts.perda !== undefined) novos.perdaDia = num(opts.perda, atual.perdaDia);
  if (opts['perda-dia'] !== undefined) novos.perdaDia = num(opts['perda-dia'], atual.perdaDia);
  if (opts.cooldown !== undefined) novos.cooldown = num(opts.cooldown, atual.cooldown);
  if (opts.moedas) novos.moedas = String(opts.moedas).split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  salvarConfig({ agente: { limites: novos } });
  console.log(`\n  ${verdeNegrito('✅ Limites de risco atualizados')}`);
  console.log(tabela(['LIMITE', 'VALOR'], [
    ['máximo por ordem', fmtUSD(novos.maxOrdem)],
    ['teto de posição total', fmtUSD(novos.maxPosicao)],
    ['perda diária que DESLIGA o agente', vermelho(fmtUSD(novos.perdaDia))],
    ['cooldown entre trades', `${novos.cooldown}s`],
    ['moedas permitidas', novos.moedas.join(', ')],
  ]));
  console.log();
}

// ── o LOOP 24h ───────────────────────────────────────────────────────────────

async function agenteLigar(args) {
  const { opts } = parseFlags(args);
  const cfgGeral = lerConfig();

  const ctx = contexto({
    corretora: opts.corretora,
    modo: opts.real ? 'real' : opts.testnet ? 'testnet' : undefined,
  });
  const limites = { ...LIMITES_PADRAO, ...(cfgGeral.agente?.limites || {}) };
  const salvo = cfgGeral.estrategia || {};
  const nomeEstr = String(opts.estrategia || salvo.nome || 'dip');
  const cfgEstr = configEstrategia(nomeEstr, salvo.nome === nomeEstr ? salvo.cfg : {});
  if (opts.lote !== undefined) cfgEstr.lote = num(opts.lote, cfgEstr.lote);
  if (opts.queda !== undefined) cfgEstr.queda = pctParaFrac(num(opts.queda, cfgEstr.queda));
  if (opts.lucro !== undefined) cfgEstr.lucroAlvo = pctParaFrac(num(opts.lucro, cfgEstr.lucroAlvo));
  if (opts.stop !== undefined) cfgEstr.stopLoss = pctParaFrac(num(opts.stop, cfgEstr.stopLoss));
  if (opts.curta !== undefined) cfgEstr.curta = num(opts.curta, cfgEstr.curta);
  if (opts.longa !== undefined) cfgEstr.longa = num(opts.longa, cfgEstr.longa);
  if (opts.cada !== undefined) cfgEstr.cadaNCiclos = num(opts.cada, cfgEstr.cadaNCiclos);
  if (opts.moedas) limites.moedas = String(opts.moedas).split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (opts['max-ordem'] !== undefined) limites.maxOrdem = num(opts['max-ordem'], limites.maxOrdem);
  if (opts['perda-dia'] !== undefined) limites.perdaDia = num(opts['perda-dia'], limites.perdaDia);

  const intervaloMs = Math.max(1, num(opts.intervalo, 60)) * 1000;
  const ciclos = opts.ciclos !== undefined ? num(opts.ciclos, Infinity) : Infinity;
  const sombra = !!opts.prever; // modo sombra: decide mas NÃO envia ordens
  const ia = cfgGeral.ia;
  const comIA = iaConfigurada(ia);

  // já rodando?
  const estadoAnterior = lerEstado();
  if (estadoAnterior.ligado && pidVivo(estadoAnterior.pid) && estadoAnterior.pid !== process.pid) {
    console.log(vermelho(`\n  ⚠ O agente JÁ está rodando (PID ${estadoAnterior.pid}). Desligue primeiro: coinmind agente desligar\n`));
    return;
  }

  // ── confirmação (opt-in obrigatório)
  const resumo = [
    `  ${cinza('corretora')}  ${negrito(ctx.mod.nome)} · ${ctx.modo === 'real' ? vermelhoNegrito('modo REAL 🔥') : amareloNegrito('modo TESTNET 🧪')}`,
    `  ${cinza('estratégia')} ${negrito(nomeEstr + ' ' + (ESTRATEGIAS[nomeEstr]?.emoji || ''))} ${cinza(`lote ${fmtUSD(cfgEstr.lote)}`)}`,
    `  ${cinza('cérebro')}     ${comIA ? verde(`IA ${ia.modelo}`) : cinza('só estratégia (IA opcional: coinmind agente ia)')}`,
    `  ${cinza('moedas')}      ${limites.moedas.join(', ')}`,
    `  ${cinza('limites')}     máx ${fmtUSD(limites.maxOrdem)}/ordem · teto ${fmtUSD(limites.maxPosicao)} · desliga se perder ${fmtUSD(limites.perdaDia)} no dia · ${intervaloMs / 1000}s por tick`,
    sombra
      ? `  ${amareloNegrito('modo')}      👁️ SOMBRA — vai DECIDIR mas não enviar ordens`
      : ctx.modo === 'real'
        ? `  ${vermelhoNegrito('modo')}      🔥 vai ENVIAR ORDENS REAIS sem perguntar nada até ser desligado`
        : `  ${amareloNegrito('modo')}      🧪 vai enviar ordens na TESTNET (dinheiro de mentira)`,
  ].join('\n');

  console.log(banner());
  console.log(cianoNegrito('  🤖 AGENTE 24H — trading autônomo de verdade\n'));
  console.log(resumo);

  if (!sombra && !opts.sim) {
    if (!stdin.isTTY) {
      throw new Error('Ligar o agente precisa de confirmação: use --sim (ou --prever pro modo sombra) num script.');
    }
    const rl = readline.createInterface({ input: stdin, output: stdout });
    const r = await rl.question(`\n  ${vermelhoNegrito('Digite LIGAR')} para o agente operar sozinho 24h (qualquer outra coisa cancela): `);
    rl.close();
    if (r.trim().toUpperCase() !== 'LIGAR') {
      console.log(`\n  ${cinza('Cancelado. O agente continua desligado.')}\n`);
      return;
    }
  } else if (!sombra) {
    console.log(`  ${amarelo('(--sim usado: confirmação pulada)')}`);
  }

  // ── estado inicial + handlers de desligamento gracioso
  const estado = estadoInicial({
    corretora: ctx.id,
    modo: ctx.modo,
    estrategia: nomeEstr,
    sombra,
    series: estadoAnterior.series || {},
  });
  salvarEstado(estado);

  let rodando = true;
  const parar = (sinal) => {
    if (!rodando) return;
    rodando = false;
    const e = lerEstado();
    salvarEstado({ ...e, ligado: false, pausadoMotivo: `parado por ${sinal} em ${agoraHora()}` });
    console.log(`\n\n  ${amareloNegrito('⏹  AGENTE DESLIGADO')} ${cinza(`(${sinal} · estado salvo em ~/.coinmind/agente.json)`)}`);
    console.log(`  ${cinza('trades nesta sessão: ' + (e.trades?.length || 0))}  ${cinza('realizado hoje: ' + fmtUSD(e.realizadoDia || 0))}`);
    console.log(`  ${cinza('Pra ligar de novo: coinmind agente ligar')}\n`);
    process.exit(0);
  };
  process.on('SIGINT', () => parar('ctrl+c'));
  process.on('SIGTERM', () => parar('SIGTERM'));

  console.log(`\n  ${verdeNegrito('🟢 AGENTE LIGADO')} ${cinza(`PID ${process.pid} · Ctrl+C para parar · de outro terminal: coinmind agente desligar`)}`);
  console.log(`  ${cinza('pra rodar 24h mesmo fechando o terminal:')}`);
  console.log(`  ${cinza('   nohup coinmind agente ligar --sim >> ~/.coinmind/agente.log 2>&1 &')}\n`);

  // ── loop principal
  const series = estado.series || {};
  let tickBase = estado.tick || 0;

  for (let i = 1; i <= ciclos && rodando; i++) {
    const e = lerEstado();
    const limitesAgora = { ...limites, ...(lerConfig().agente?.limites || {}) };

    // reset do dia
    const hoje = new Date().toISOString().slice(0, 10);
    if (e.dia !== hoje) {
      await salvarEstadoAsync({ ...e, dia: hoje, realizadoDia: 0 });
    }

    // 1 · busca preços reais (público)
    const precos = await buscarPrecos(ctx, limitesAgora.moedas);
    for (const [simbolo, preco] of Object.entries(precos)) {
      if (!preco) continue;
      series[simbolo] = [...(series[simbolo] || []), preco].slice(-240);
    }

    // 2 · posições valorizadas + halt por perda diária
    const tickCount = tickBase + i;
    let propostas = decidirTick(nomeEstr, series, e.posicoes || {}, cfgEstr, tickCount);

    if ((e.realizadoDia || 0) <= -limitesAgora.perdaDia) {
      const motivo = `🛑 PERDA DIÁRIA ATINGIDA (${fmtUSD(e.realizadoDia || 0)}) — agente se desligou sozinho por segurança`;
      const e2 = { ...lerEstado(), tick: tickCount, series, ligado: false, pausadoMotivo: motivo, trades: e.trades || [] };
      salvarEstado(e2);
      console.log(`\n  ${vermelhoNegrito(motivo)}\n`);
      process.exit(0);
    }

    // 3 · executa propostas (saídas primeiro — proteção)
    propostas.sort((a, b) => (a.tipo === 'saida' ? -1 : 1) - (b.tipo === 'saida' ? -1 : 1));
    for (const p of propostas) {
      const bloqueio = limiteBloqueia(p, e, limitesAgora, cfgEstr);
      if (bloqueio) {
        console.log(`  ${apagado(`[${agoraHora()}] ⏳ ${p.acao} ${p.simbolo} bloqueado: ${bloqueio}`)}`);
        continue;
      }

      // IA só entra nas ENTRADAS; saídas de proteção são sempre automáticas
      if (comIA && p.tipo === 'entrada') {
        console.log(`  ${cinza(`[${agoraHora()}] 🧠 consultando a IA sobre ${p.acao} ${p.simbolo}...`)}`);
        const voto = await consultarIA(ia, p, montarSnapshot(series, e.posicoes || {}, limitesAgora));
        console.log(`  ${voto.decisao === 'APROVAR' ? verde(`🧠 IA APROVOU (${voto.confianca ?? '?'}%): ${voto.motivo}`) : vermelho(`🧠 IA VETOU: ${voto.motivo}`)}`);
        if (voto.decisao !== 'APROVAR') continue;
      }

      if (sombra) {
        console.log(`  ${amarelo(`[${agoraHora()}] 👁️ SOMBRA: ${p.acao === 'compra' ? 'comprou' : 'venderia'} ${p.simbolo} — ${p.motivo}`)}`);
        continue;
      }

      try {
        if (p.acao === 'compra') {
          const r = await ctx.mod.criarOrdem(ctx.cfg, { lado: 'compra', simbolo: p.simbolo, quote: 'USDT', usd: cfgEstr.lote });
          const d = await ctx.mod.consultarOrdem(ctx.cfg, r.par, r.idOrdem).catch(() => null);
          const qtd = d?.qtdExecutada || r.qtdExecutada || cfgEstr.lote / (series[p.simbolo]?.at(-1) || 1);
          const pm = d?.precoMedio || r.precoMedio || series[p.simbolo]?.at(-1);
          const pos = e.posicoes[p.simbolo] || { qtd: 0, investido: 0 };
          pos.qtd += qtd;
          pos.investido += cfgEstr.lote;
          pos.precoMedio = pos.investido / pos.qtd;
          e.posicoes[p.simbolo] = pos;
          e.trades = [...(e.trades || []), { quando: new Date().toISOString(), acao: 'compra', simbolo: p.simbolo, usd: cfgEstr.lote, qtd, precoMedio: pm, motivo: p.motivo + (comIA ? ' · IA ok' : '') }];
          console.log(`  ${verde(`[${agoraHora()}] 🟢 COMPROU ${p.simbolo} ${fmtUSD(cfgEstr.lote)} — ${p.motivo}`)} ${cinza(`id ${r.idOrdem}`)}`);
        } else {
          const pos = e.posicoes[p.simbolo];
          if (!pos) continue;
          const r = await ctx.mod.criarOrdem(ctx.cfg, { lado: 'venda', simbolo: p.simbolo, quote: 'USDT', qtd: pos.qtd });
          const d = await ctx.mod.consultarOrdem(ctx.cfg, r.par, r.idOrdem).catch(() => null);
          const bruto = d?.brutoExecutado || r.brutoExecutado || pos.qtd * (series[p.simbolo]?.at(-1) || 0);
          const lucro = bruto - pos.investido;
          delete e.posicoes[p.simbolo];
          e.realizadoDia = (e.realizadoDia || 0) + lucro;
          e.trades = [...(e.trades || []), { quando: new Date().toISOString(), acao: 'venda', simbolo: p.simbolo, usd: bruto, lucro, motivo: p.motivo }];
          console.log(`  ${corResultado(lucro, `[${agoraHora()}] 🔴 VENDEU ${p.simbolo} ${fmtUSD(bruto)} · ${lucro >= 0 ? 'lucro' : 'perda'} ${fmtUSD(Math.abs(lucro))} — ${p.motivo}`)}`);
        }
        e.ultimoTradeEm = Date.now();
      } catch (err) {
        console.log(`  ${vermelho(`[${agoraHora()}] ✖ falha ao ${p.acao} ${p.simbolo}: ${err.message}`)}`);
      }
    }

    // 4 · salva estado
    await salvarEstadoAsync({ ...e, tick: tickCount, series, posicoes: e.posicoes, trades: e.trades, realizadoDia: e.realizadoDia, ultimoTradeEm: e.ultimoTradeEm, ligado: true });

    // 5 · batimento a cada 10 ticks
    if (i % 10 === 0) {
      const investido = Object.entries(e.posicoes || {}).map(([s, p]) => `${s} ${fmtUSD((p.qtd || 0) * (series[s]?.at(-1) || 0))}`).join(' · ') || 'sem posições';
      console.log(`  ${apagado(`[${agoraHora()}] · · · tick ${tickCount} · ${investido} · hoje ${fmtUSD(e.realizadoDia || 0)}`)}`);
    }

    if (i < ciclos) await new Promise((r) => setTimeout(r, intervaloMs));
  }

  parar('fim dos ciclos');
}

async function salvarEstadoAsync(e) {
  const { salvarEstado } = await import('./agente.js');
  salvarEstado(e);
}

async function buscarPrecos(ctx, moedas) {
  const saida = {};
  await Promise.allSettled(
    moedas.map(async (s) => {
      saida[s] = await ctx.mod.preco(ctx.cfg, s, 'USDT');
    })
  );
  return saida;
}

function montarSnapshot(series, posicoes, limites) {
  const resumo = {};
  for (const [s, serie] of Object.entries(series)) {
    if (!serie?.length) continue;
    const atual = serie.at(-1);
    const max24 = Math.max(...serie.slice(-60));
    const min24 = Math.min(...serie.slice(-60));
    resumo[s] = {
      preco: atual,
      variacaoDaSessaoPct: +(((atual / serie[0]) - 1) * 100).toFixed(2),
      distanciaDaMaximaPct: +(((atual / max24) - 1) * 100).toFixed(2),
      distanciaDaMinimaPct: +(((atual / min24) - 1) * 100).toFixed(2),
    };
  }
  return { moedas: resumo, posicoesAbertas: posicoes, limites };
}

// ── dispatcher ───────────────────────────────────────────────────────────────

export async function comandoAgente(args) {
  const [sub, ...resto] = args;
  if (!sub || ['status', 'ajuda', 'help'].includes(sub)) {
    if (!sub) return comandoAgenteStatus();
    console.log(cianoNegrito('\nUSO: coinmind agente <subcomando>\n'));
    const cmds = [
      ['agente', 'painel de status do robô autônomo'],
      ['agente ligar', '🤖 LIGA o robô 24h (pede confirmação) · --prever = modo sombra · --sim pula confirmação'],
      ['agente desligar', '⏹ desliga (mesmo de outro terminal)'],
      ['agente ia', '🧠 conecta o cérebro de IA · --api-key K --base-url U --modelo M'],
      ['agente limites', '🛟 limites de risco · --max-ordem 25 --max-dia 100 --perda-dia 50 --cooldown 300 --moedas BTC,DOGE'],
      ['agente ligar --ciclos 10', 'roda só 10 ticks e para (pra testar)'],
    ];
    for (const [c, d] of cmds) console.log(`  ${amarelo(c.padEnd(32))} ${cinza(d)}`);
    console.log(`\n  ${cinza('o agente NUNCA liga sozinho e respeita o modo (testnet/real) do coinmind config modo.')}\n`);
    return;
  }
  switch (sub) {
    case 'ligar':
    case 'on':
      return agenteLigar(resto);
    case 'desligar':
    case 'off':
      return agenteDesligar();
    case 'ia':
      return agenteIA(resto);
    case 'limites':
      return agenteLimites(resto);
    case 'status':
      return comandoAgenteStatus();
    default:
      console.log(vermelho(`Subcomando desconhecido: agente ${sub}`));
      return comandoAgente(['ajuda']);
  }
}
