// ─────────────────────────────────────────────────────────────────────────────
//  coinmind · comando "config" — configurar TUDO pela CLI, sem export nem JSON
//    coinmind config                    → assistente interativo completo
//    coinmind config chaves ...         → salva chaves da corretora
//    coinmind config modo --real|--testnet
//    coinmind config estrategia dip ... → salva a estratégia preferida
//    coinmind config mostrar            → mostra o que está salvo
//    coinmind config apagar <corretora> → remove chaves
// ─────────────────────────────────────────────────────────────────────────────

import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import {
  banner, titulo, tabela, negrito, apagado, vermelho, verde, amarelo,
  cianoNegrito, cinza, verdeNegrito, vermelhoNegrito, amareloNegrito, fmtUSD,
} from './ui.js';
import { lerConfig, salvarConfig, apagarChaves, pctParaFrac } from './config.js';
import { CORRETORAS, configurada, contexto } from './corretoras/index.js';
import { mascara } from './corretoras/util.js';
import { ESTRATEGIAS, configEstrategia } from './bot.js';

function parseFlags(args) {
  const opts = {};
  const resto = [];
  const comValor = ['corretora', 'api-key', 'secret', 'passphrase', 'quote', 'lote', 'queda', 'lucro', 'stop', 'curta', 'longa', 'cada', 'moedas'];
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

async function perguntar(rl, pergunta, padrao = '') {
  const sufixo = padrao !== '' ? cinza(` (${padrao})`) : '';
  const r = await rl.question(`  ${pergunta}${sufixo}: `);
  return r.trim() || String(padrao);
}

function semTTY() {
  if (!stdin.isTTY) {
    console.log(vermelho('\n  Este comando é interativo — rode num terminal de verdade.'));
    console.log(cinza('  Ou use as flags, ex: coinmind config chaves --corretora binance --api-key SUA_KEY --secret SEU_SECRET\n'));
    return true;
  }
  return false;
}

// ── assistente completo ──────────────────────────────────────────────────────

export async function assistente() {
  if (semTTY()) return;
  const rl = readline.createInterface({ input: stdin, output: stdout });
  console.log(banner());
  console.log(cianoNegrito('  ⚙️  ASSISTENTE DE CONFIGURAÇÃO — corretora, chaves, modo e estratégia em 1 minuto\n'));

  try {
    // 1 · corretora
    console.log(`  ${negrito('1 · Corretora')}`);
    console.log(`     ${amarelo('1')}) Binance   ${amarelo('2')}) Bybit   ${amarelo('3')}) OKX`);
    const opCorretora = await perguntar(rl, '     Qual corretora?', '1');
    const id = { '1': 'binance', '2': 'bybit', '3': 'okx' }[opCorretora] || 'binance';
    const mod = CORRETORAS[id];

    // 2 · chaves
    console.log(`\n  ${negrito(`2 · Chaves da ${mod.nome}`)} ${cinza(`(${mod.dicaTestnet})`)}`);
    const apiKey = await perguntar(rl, `     API Key`);
    const secret = await perguntar(rl, `     API Secret`);
    let passphrase;
    if (mod.precisaPassphrase) passphrase = await perguntar(rl, `     Passphrase`);

    // 3 · modo
    console.log(`\n  ${negrito('3 · Modo das ordens')}`);
    console.log(`     ${amarelo('1')}) TESTNET — dinheiro de mentira, pra aprender sem medo ${cinza('(recomendado)')}`);
    console.log(`     ${vermelho('2')}) REAL — dinheiro de verdade 🔥`);
    const opModo = await perguntar(rl, '     Qual modo?', '1');
    const modo = opModo === '2' ? 'real' : 'testnet';

    // 4 · testar conexão
    let testeOk = false;
    if (apiKey && secret) {
      console.log(`\n  ${negrito('4 · Testando a conexão com a ' + mod.nome + '...')}`);
      try {
        const ctxTeste = { id, mod, cfg: { apiKey, secret, passphrase, testnet: modo === 'testnet' } };
        const saldos = await ctxTeste.mod.saldo(ctxTeste.cfg);
        testeOk = true;
        console.log(`     ${verde('✓ funcionou!')} ${cinza(`${saldos.length} ativo(s) com saldo · chave ${mascara(apiKey)}`)}`);
      } catch (e) {
        console.log(`     ${vermelho('✗ ' + e.message)}`);
        const mesmoAssim = await perguntar(rl, '     Salvar as chaves mesmo assim? [s/N]', 'n');
        testeOk = true; // segue, mas o usuário decidiu
        if (mesmoAssim.toLowerCase() !== 's') {
          console.log(`\n  ${amarelo('Ok — chaves NÃO salvas. Rode coinmind config de novo quando tiver as chaves certas.')}\n`);
          return;
        }
      }
    }

    // 5 · estratégia
    console.log(`\n  ${negrito('5 · Estratégia do robô')}`);
    const lista = Object.entries(ESTRATEGIAS);
    lista.forEach(([chave, e], i) => {
      console.log(`     ${amarelo(String(i + 1))}) ${chave} ${e.emoji} — ${cinza(e.desc)}`);
    });
    const opEstr = await perguntar(rl, `     Qual estratégia?`, '1');
    const nomeEstr = lista[Number(opEstr) - 1]?.[0] || 'dip';
    const padroes = configEstrategia(nomeEstr);

    const cfgEstr = { };
    if (nomeEstr === 'dip') {
      cfgEstr.lote = num(await perguntar(rl, `     Lote por compra (US$)`, padroes.lote), padroes.lote);
      cfgEstr.queda = pctParaFrac(num(await perguntar(rl, `     Comprar quando cair quanto % da máxima?`, padroes.queda * 100), padroes.queda * 100));
      cfgEstr.lucroAlvo = pctParaFrac(num(await perguntar(rl, `     Vender com quanto % de lucro?`, padroes.lucroAlvo * 100), padroes.lucroAlvo * 100));
      cfgEstr.stopLoss = pctParaFrac(num(await perguntar(rl, `     Stop-loss em quantos % de prejuízo?`, padroes.stopLoss * 100), padroes.stopLoss * 100));
    } else if (nomeEstr === 'momentum') {
      cfgEstr.lote = num(await perguntar(rl, `     Lote por compra (US$)`, padroes.lote), padroes.lote);
      cfgEstr.curta = num(await perguntar(rl, `     Média curta (ciclos)`, padroes.curta), padroes.curta);
      cfgEstr.longa = num(await perguntar(rl, `     Média longa (ciclos)`, padroes.longa), padroes.longa);
    } else {
      cfgEstr.lote = num(await perguntar(rl, `     Lote por compra (US$)`, padroes.lote), padroes.lote);
      cfgEstr.cadaNCiclos = num(await perguntar(rl, `     Comprar a cada quantos ciclos?`, padroes.cadaNCiclos), padroes.cadaNCiclos);
    }

    // salvar
    const chaves = apiKey ? { [id]: { apiKey, secret, ...(passphrase ? { passphrase } : {}) } } : {};
    salvarConfig({ corretora: id, modo, estrategia: { nome: nomeEstr, cfg: cfgEstr }, ...(Object.keys(chaves).length ? { chaves } : {}) });

    console.log(`\n  ${verdeNegrito('✅ Configuração salva em ~/.coinmind/config.json')}`);
    console.log(`     corretora: ${negrito(mod.nome)}  ·  modo: ${modo === 'real' ? vermelho('REAL 🔥') : amarelo('TESTNET 🧪')}${testeOk ? '' : vermelho('  (chaves não testadas!)')}`);
    console.log(`     estratégia: ${negrito(nomeEstr)} ${ESTRATEGIAS[nomeEstr].emoji}  ${cinza(JSON.stringify(cfgEstr))}`);
    console.log(`\n  ${cinza('Agora é só usar:  coinmind real comprar DOGE 10   ·   coinmind rodar --ciclos 40')}`);
    if (modo === 'real') {
      console.log(`  ${vermelho('⚠️  modo REAL ativo — cada ordem gasta dinheiro de verdade. Revise antes de digitar SIM.')}`);
    }
    console.log();
  } finally {
    rl.close();
  }
}

// ── config chaves ────────────────────────────────────────────────────────────

async function configChaves(args) {
  const { opts } = parseFlags(args);
  let id = opts.corretora;
  let apiKey = opts['api-key'];
  let secret = opts.secret;
  let passphrase = opts.passphrase;

  if (!id || !apiKey || !secret) {
    if (semTTY()) return;
    const rl = readline.createInterface({ input: stdin, output: stdout });
    try {
      const nomes = Object.values(CORRETORAS).map((c) => c.nome).join(', ');
      id = id || (await perguntar(rl, `Corretora (${nomes})`, 'binance')).toLowerCase();
      apiKey = apiKey || (await perguntar(rl, 'API Key'));
      secret = secret || (await perguntar(rl, 'API Secret'));
      if (CORRETORAS[id]?.precisaPassphrase && !passphrase) passphrase = await perguntar(rl, 'Passphrase');
    } finally {
      rl.close();
    }
  }

  if (!CORRETORAS[id]) {
    console.log(vermelho(`Corretora desconhecida: ${id}. Use: ${Object.keys(CORRETORAS).join(', ')}`));
    return;
  }
  if (!apiKey || !secret) {
    console.log(vermelho('Faltou a chave: use --api-key e --secret (ou rode interativo num terminal).'));
    return;
  }

  salvarConfig({
    corretora: id,
    chaves: { [id]: { apiKey, secret, ...(passphrase ? { passphrase } : {}) } },
  });

  console.log(`\n  ${verdeNegrito(`✅ Chaves da ${CORRETORAS[id].nome} salvas`)} ${cinza(`(${mascara(apiKey)}) em ~/.coinmind/config.json`)}`);

  // testa a conexão na hora (modo testnet por padrão — seguro)
  try {
    const ctx = contexto({ corretora: id, modo: 'testnet' });
    const saldos = await ctx.mod.saldo(ctx.cfg);
    console.log(`  ${verde('✓ testnet OK')} ${cinza('· ' + saldos.length + ' ativo(s) com saldo')}`);
  } catch (e) {
    try {
      const ctx = contexto({ corretora: id, modo: 'real' });
      const saldos = await ctx.mod.saldo(ctx.cfg);
      console.log(`  ${verde('✓ produção OK')} ${cinza('· ' + saldos.length + ' ativo(s) com saldo (chave parece ser de produção)')}`);
    } catch {
      console.log(`  ${amarelo('⚠ não consegui validar agora: ' + e.message)}`);
      console.log(`  ${cinza('salvei do mesmo jeito — teste com: coinmind real saldo')}`);
    }
  }
  console.log(`  ${cinza('modo atual: ' + (lerConfig().modo || 'testnet') + ' · mude com coinmind config modo --real|--testnet')}\n`);
}

// ── config modo ──────────────────────────────────────────────────────────────

async function configModo(args) {
  const { opts } = parseFlags(args);
  let modo;
  if (opts.real) modo = 'real';
  else if (opts.testnet) modo = 'testnet';
  else {
    if (semTTY()) return;
    const rl = readline.createInterface({ input: stdin, output: stdout });
    try {
      console.log(`  ${amarelo('1')}) TESTNET — dinheiro de mentira ${cinza('(seguro pra aprender)')}`);
      console.log(`  ${vermelho('2')}) REAL — dinheiro de verdade 🔥`);
      const r = await perguntar(rl, 'Qual modo?', '1');
      modo = r === '2' ? 'real' : 'testnet';
    } finally {
      rl.close();
    }
  }
  salvarConfig({ modo });
  console.log('');
  if (modo === 'real') {
    console.log(`  ${vermelhoNegrito('🔥 MODO REAL ATIVO — ordens vão gastar dinheiro de verdade!')}`);
    console.log(`  ${vermelho('Cada "coinmind real comprar/vender" executa na corretora. Confira sempre com --prever antes.')}`);
  } else {
    console.log(`  ${amareloNegrito('🧪 MODO TESTNET ATIVO — ordens usam dinheiro de mentira da testnet.')}`);
    console.log(`  ${cinza('Pra ligar o modo real quando estiver pronto: coinmind config modo --real')}`);
  }
  console.log();
}

// ── config estrategia ────────────────────────────────────────────────────────

async function configEstrategiaCmd(args) {
  const { opts, resto } = parseFlags(args);
  const nome = String(opts.nome || resto[0] || '').toLowerCase();

  if (!ESTRATEGIAS[nome]) {
    if (semTTY()) return;
    const rl = readline.createInterface({ input: stdin, output: stdout });
    try {
      const lista = Object.entries(ESTRATEGIAS);
      lista.forEach(([chave, e], i) => {
        console.log(`  ${amarelo(String(i + 1))}) ${chave} ${e.emoji} — ${cinza(e.desc)}`);
      });
      const op = await perguntar(rl, 'Qual estratégia?', '1');
      return configEstrategiaCmd([lista[Number(op) - 1]?.[0] || 'dip']);
    } finally {
      rl.close();
    }
  }

  const padroes = configEstrategia(nome);
  const cfg = {};
  if (opts.lote !== undefined) cfg.lote = num(opts.lote, padroes.lote);
  if (nome === 'dip') {
    if (opts.queda !== undefined) cfg.queda = pctParaFrac(num(opts.queda, padroes.queda));
    if (opts.lucro !== undefined) cfg.lucroAlvo = pctParaFrac(num(opts.lucro, padroes.lucroAlvo));
    if (opts.stop !== undefined) cfg.stopLoss = pctParaFrac(num(opts.stop, padroes.stopLoss));
  }
  if (nome === 'momentum') {
    if (opts.curta !== undefined) cfg.curta = num(opts.curta, padroes.curta);
    if (opts.longa !== undefined) cfg.longa = num(opts.longa, padroes.longa);
  }
  if (nome === 'dca') {
    if (opts.cada !== undefined) cfg.cadaNCiclos = num(opts.cada, padroes.cadaNCiclos);
    if (opts.moedas) cfg.moedas = String(opts.moedas).split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  }

  salvarConfig({ estrategia: { nome, cfg } });

  const final = configEstrategia(nome, cfg);
  console.log(`\n  ${verdeNegrito(`✅ Estratégia salva: ${nome} ${ESTRATEGIAS[nome].emoji}`)} ${cinza('— ' + ESTRATEGIAS[nome].desc)}`);
  const linhas = Object.entries(final).map(([k, v]) => [cinza(k), typeof v === 'number' && k !== 'cadaNCiclos' && k !== 'curta' && k !== 'longa' && v < 1 ? `${(v * 100).toFixed(0)}%` : String(Array.isArray(v) ? v.join(', ') : v)]);
  console.log(tabela(['PARÂMETRO', 'VALOR'], linhas));
  console.log(`\n  ${cinza('O coinmind rodar já usa essa estratégia. Pra ver: coinmind config mostrar')}\n`);
}

// ── config mostrar / apagar ──────────────────────────────────────────────────

function configMostrar() {
  const c = lerConfig();
  console.log(titulo('configuração atual (~/.coinmind/config.json)'));
  console.log(`  ${cinza('corretora padrão:')} ${negrito(c.corretora || '(nenhuma — será a primeira com chaves)')}`);
  const modo = c.modo || 'testnet';
  console.log(`  ${cinza('modo das ordens:')} ${modo === 'real' ? vermelhoNegrito('REAL 🔥') : amareloNegrito('TESTNET 🧪')}`);
  if (c.estrategia?.nome) {
    console.log(`  ${cinza('estratégia:')} ${negrito(c.estrategia.nome + ' ' + (ESTRATEGIAS[c.estrategia.nome]?.emoji || ''))} ${cinza(JSON.stringify(c.estrategia.cfg || {}))}`);
  } else {
    console.log(`  ${cinza('estratégia: (padrão dip) — salve com: coinmind config estrategia dip')}`);
  }
  const linhas = Object.values(CORRETORAS).map((mod) => {
    const ch = c.chaves?.[mod.id];
    const noArquivo = configurada(mod.id);
    return [
      mod.nome,
      ch ? verde(`✓ ${mascara(ch.apiKey)}`) : noArquivo ? amarelo('✓ via env/legado') : cinza('—'),
      mod.precisaPassphrase ? cinza('pede passphrase') : apagado('—'),
    ];
  });
  console.log('\n' + tabela(['CORRETORA', 'CHAVES', 'EXTRA'], linhas));
  console.log(`\n  ${cinza('trocar modo: coinmind config modo --real|--testnet  ·  apagar chaves: coinmind config apagar <corretora>')}\n`);
}

function configApagar(args) {
  const [id] = args.map((s) => String(s).toLowerCase());
  if (!CORRETORAS[id]) {
    console.log(vermelho(`Uso: coinmind config apagar <corretora>  (${Object.keys(CORRETORAS).join(' | ')})`));
    return;
  }
  apagarChaves(id);
  console.log(`\n  🗑️  Chaves da ${CORRETORAS[id].nome} apagadas do config.\n`);
}

// ── dispatcher ───────────────────────────────────────────────────────────────

export async function comandoConfig(args) {
  const [sub, ...resto] = args;
  if (!sub || ['ajuda', 'help'].includes(sub)) {
    if (!sub) return assistente();
    console.log(cianoNegrito('\nUSO: coinmind config <subcomando>\n'));
    const cmds = [
      ['config', 'assistente interativo completo (corretora, chaves, modo, estratégia)'],
      ['config chaves', 'salva chaves · --corretora binance --api-key K --secret S [--passphrase P]'],
      ['config modo', 'define o modo · --testnet (padrão) ou --real'],
      ['config estrategia', 'salva estratégia · ex: config estrategia dip --lote 120 --queda 5 --lucro 6 --stop 8'],
      ['config mostrar', 'mostra a configuração salva'],
      ['config apagar <corretora>', 'remove as chaves da corretora'],
    ];
    for (const [c, d] of cmds) console.log(`  ${amarelo(c.padEnd(30))} ${cinza(d)}`);
    console.log();
    return;
  }
  switch (sub) {
    case 'chaves':
    case 'chave':
      return configChaves(resto);
    case 'modo':
      return configModo(resto);
    case 'estrategia':
    case 'estratégia':
      return configEstrategiaCmd(resto);
    case 'mostrar':
    case 'status':
      return configMostrar();
    case 'apagar':
      return configApagar(resto);
    default:
      console.log(vermelho(`Subcomando desconhecido: config ${sub}`));
      return comandoConfig(['ajuda']);
  }
}
