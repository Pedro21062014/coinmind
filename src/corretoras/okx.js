// ─────────────────────────────────────────────────────────────────────────────
//  coinmind · adaptador OKX (API v5, spot)
//  Docs: https://www.okx.com/docs-v5/en/
// ─────────────────────────────────────────────────────────────────────────────

import { requisicao, hmacBase64, agoraIso, arredondarParaPasso } from './util.js';

const PRODUCAO = 'https://www.okx.com';

export default {
  id: 'okx',
  nome: 'OKX',
  precisaPassphrase: true,
  suportaTestnet: true, // via header x-simulated-trading
  dicaTestnet: 'modo demo da OKX (header x-simulated-trading)',
  env: {
    apiKey: 'COINMIND_OKX_API_KEY',
    secret: 'COINMIND_OKX_API_SECRET',
    passphrase: 'COINMIND_OKX_PASSPHRASE',
  },

  urlBase: () => PRODUCAO,
  par: (simbolo, quote = 'USDT') => `${simbolo.toUpperCase()}-${quote.toUpperCase()}`,

  async preco(cfg, simbolo, quote = 'USDT') {
    const j = await requisicao(
      `${this.urlBase()}/api/v5/market/ticker?instId=${this.par(simbolo, quote)}`
    );
    if (j.code !== '0') throw new Error(`OKX: ${j.msg || j.data?.[0]?.sMsg || 'erro'}`);
    const d = j.data?.[0];
    if (!d) throw new Error(`Par ${this.par(simbolo, quote)} não encontrado na OKX.`);
    return Number(d.last);
  },

  async saldo(cfg) {
    const j = await this.assinado(cfg, 'GET', '/api/v5/account/balance');
    if (j.code !== '0') throw new Error(`OKX: ${j.msg}`);
    return (j.data?.[0]?.details || [])
      .map((d) => ({ ativo: d.ccy, livre: Number(d.availEq || d.cashBal || 0) }))
      .filter((b) => b.livre > 0);
  },

  async criarOrdem(cfg, o) {
    const par = this.par(o.simbolo, o.quote);
    const corpo = {
      instId: par,
      tdMode: 'cash',
      side: o.lado === 'compra' ? 'buy' : 'sell',
      ordType: 'market',
    };
    if (o.lado === 'compra') {
      corpo.sz = String(o.usd);
      corpo.tgtCcy = 'quote_ccy'; // sz em USDT
    } else {
      corpo.sz = arredondarParaPasso(o.qtd);
      corpo.tgtCcy = 'base_ccy'; // sz em moeda
    }
    const j = await this.assinado(cfg, 'POST', '/api/v5/trade/order', null, corpo);
    if (j.code !== '0' || j.data?.[0]?.sCode !== '0') {
      throw new Error(`OKX: ${j.data?.[0]?.sMsg || j.msg}`);
    }
    return {
      idOrdem: j.data[0].ordId,
      par,
      status: 'enviada',
      qtdExecutada: 0,
      brutoExecutado: 0,
      precoMedio: null,
      cru: j.data[0],
    };
  },

  async consultarOrdem(cfg, par, idOrdem) {
    const j = await this.assinado(cfg, 'GET', '/api/v5/trade/order', {
      instId: par,
      ordId: idOrdem,
    });
    const o = j.data?.[0];
    if (j.code !== '0' || !o) throw new Error(`OKX: ${j.msg || 'ordem não encontrada'}`);
    const qtd = Number(o.accFillSz || 0);
    const pm = Number(o.avgPx || 0) || null;
    return {
      status: o.state,
      qtdExecutada: qtd,
      brutoExecutado: pm ? qtd * pm : 0,
      precoMedio: pm,
    };
  },

  /** Assinatura OKX: base64(hmac(secret, ts + METODO + caminho(+query) + corpo)). */
  async assinado(cfg, metodo, caminho, params = null, corpoObj = null) {
    if (!cfg.apiKey || !cfg.secret || !cfg.passphrase) {
      throw new Error(
        'Credenciais da OKX ausentes — configure COINMIND_OKX_API_KEY, COINMIND_OKX_API_SECRET e COINMIND_OKX_PASSPHRASE (ou ~/.coinmind/corretoras.json).'
      );
    }
    let url = `${this.urlBase()}${caminho}`;
    let consulta = '';
    if (metodo === 'GET' && params) {
      consulta = new URLSearchParams(params).toString();
      url += `?${consulta}`;
    }
    const corpo = corpoObj ? JSON.stringify(corpoObj) : '';
    const ts = agoraIso();
    const assinatura = hmacBase64(
      cfg.secret,
      `${ts}${metodo}${caminho}${consulta ? `?${consulta}` : ''}${corpo}`
    );
    const cabecalhos = {
      'OK-ACCESS-KEY': cfg.apiKey,
      'OK-ACCESS-SIGN': assinatura,
      'OK-ACCESS-TIMESTAMP': ts,
      'OK-ACCESS-PASSPHRASE': cfg.passphrase,
      'Content-Type': 'application/json',
    };
    if (cfg.testnet) cabecalhos['x-simulated-trading'] = '1';
    return requisicao(url, { metodo, cabecalhos, corpo: corpoObj ? corpo : null });
  },
};
