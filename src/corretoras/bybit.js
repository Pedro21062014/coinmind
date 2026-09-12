// ─────────────────────────────────────────────────────────────────────────────
//  coinmind · adaptador BYBIT (API v5, spot)
//  Docs: https://bybit-exchange.github.io/docs/v5/intro
// ─────────────────────────────────────────────────────────────────────────────

import { requisicao, hmacHex, agoraMs, arredondarParaPasso } from './util.js';

const PRODUCAO = 'https://api.bybit.com';
const TESTE = 'https://api-testnet.bybit.com';

export default {
  id: 'bybit',
  nome: 'Bybit',
  precisaPassphrase: false,
  suportaTestnet: true,
  dicaTestnet: 'testnet em https://testnet.bybit.com',
  env: {
    apiKey: 'COINMIND_BYBIT_API_KEY',
    secret: 'COINMIND_BYBIT_API_SECRET',
    passphrase: null,
  },

  urlBase: (testnet) => (testnet ? TESTE : PRODUCAO),
  par: (simbolo, quote = 'USDT') => `${simbolo.toUpperCase()}${quote.toUpperCase()}`,

  async preco(cfg, simbolo, quote = 'USDT') {
    const j = await requisicao(
      `${this.urlBase(cfg.testnet)}/v5/market/tickers?category=spot&symbol=${this.par(simbolo, quote)}`
    );
    if (j.retCode !== 0) throw new Error(`Bybit: ${j.retMsg} (código ${j.retCode})`);
    const item = j.result?.list?.[0];
    if (!item) throw new Error(`Par ${this.par(simbolo, quote)} não encontrado na Bybit.`);
    return Number(item.lastPrice);
  },

  async saldo(cfg) {
    const j = await this.assinado(cfg, 'GET', '/v5/account/wallet-balance', {
      accountType: 'UNIFIED',
    });
    if (j.retCode !== 0) throw new Error(`Bybit: ${j.retMsg} (código ${j.retCode})`);
    return (j.result?.list?.[0]?.coin || [])
      .map((c) => ({ ativo: c.coin, livre: Number(c.walletBalance) }))
      .filter((b) => b.livre > 0);
  },

  async criarOrdem(cfg, o) {
    const par = this.par(o.simbolo, o.quote);
    const corpo = {
      category: 'spot',
      symbol: par,
      side: o.lado === 'compra' ? 'Buy' : 'Sell',
      orderType: 'Market',
    };
    if (o.lado === 'compra') {
      corpo.qty = String(o.usd);
      corpo.marketUnit = 'quoteCoin'; // qty em USDT
    } else {
      corpo.qty = arredondarParaPasso(o.qtd);
      corpo.marketUnit = 'baseCoin'; // qty em moeda
    }
    const j = await this.assinado(cfg, 'POST', '/v5/order/create', null, corpo);
    if (j.retCode !== 0) throw new Error(`Bybit: ${j.retMsg} (código ${j.retCode})`);
    return {
      idOrdem: j.result.orderId,
      par,
      status: 'enviada',
      qtdExecutada: 0,
      brutoExecutado: 0,
      precoMedio: null,
      cru: j.result,
    };
  },

  async consultarOrdem(cfg, par, idOrdem) {
    const j = await this.assinado(cfg, 'GET', '/v5/order/history', {
      category: 'spot',
      symbol: par,
      orderId: idOrdem,
    });
    const o = j.result?.list?.[0];
    if (!o) return { status: 'desconhecido', qtdExecutada: 0, brutoExecutado: 0, precoMedio: null };
    return {
      status: o.orderStatus,
      qtdExecutada: Number(o.cumExecQty || 0),
      brutoExecutado: Number(o.cumExecValue || 0),
      precoMedio: Number(o.avgPrice || 0) || null,
    };
  },

  /** Assinatura v5: hmac(ts + apiKey + recvWindow + query|corpoJson). */
  async assinado(cfg, metodo, caminho, params = null, corpoObj = null) {
    if (!cfg.apiKey || !cfg.secret) {
      throw new Error(
        'Credenciais da Bybit ausentes — configure COINMIND_BYBIT_API_KEY e COINMIND_BYBIT_API_SECRET (ou ~/.coinmind/corretoras.json).'
      );
    }
    const ts = agoraMs();
    const janela = 5000;
    let url = `${this.urlBase(cfg.testnet)}${caminho}`;
    let carga = '';
    if (metodo === 'GET' && params) {
      const consulta = new URLSearchParams(params).toString();
      url += `?${consulta}`;
      carga = consulta;
    }
    if (metodo === 'POST' && corpoObj) carga = JSON.stringify(corpoObj);
    const assinatura = hmacHex(cfg.secret, `${ts}${cfg.apiKey}${janela}${carga}`);
    return requisicao(url, {
      metodo,
      cabecalhos: {
        'X-BAPI-API-KEY': cfg.apiKey,
        'X-BAPI-TIMESTAMP': String(ts),
        'X-BAPI-RECV-WINDOW': String(janela),
        'X-BAPI-SIGN': assinatura,
        'Content-Type': 'application/json',
      },
      corpo: metodo === 'POST' ? carga : null,
    });
  },
};
