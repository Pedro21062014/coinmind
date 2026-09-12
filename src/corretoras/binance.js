// ─────────────────────────────────────────────────────────────────────────────
//  coinmind · adaptador BINANCE (Spot API v3)
//  Docs: https://developers.binance.com/docs/binance-spot-api-docs
// ─────────────────────────────────────────────────────────────────────────────

import { requisicao, hmacHex, qs, agoraMs, arredondarParaPasso } from './util.js';

const PRODUCAO = 'https://api.binance.com';
const TESTE = 'https://testnet.binance.vision'; // testnet com BTC/USDT de mentira grátis
const loteCache = new Map();

export default {
  id: 'binance',
  nome: 'Binance',
  precisaPassphrase: false,
  suportaTestnet: true,
  dicaTestnet: 'chaves de teste grátis em https://testnet.binance.vision',
  env: {
    apiKey: 'COINMIND_BINANCE_API_KEY',
    secret: 'COINMIND_BINANCE_API_SECRET',
    passphrase: null,
  },

  urlBase: (testnet) => (testnet ? TESTE : PRODUCAO),
  par: (simbolo, quote = 'USDT') => `${simbolo.toUpperCase()}${quote.toUpperCase()}`,

  /** Preço atual (endpoint público, sem chave). */
  async preco(cfg, simbolo, quote = 'USDT') {
    const j = await requisicao(
      `${this.urlBase(cfg.testnet)}/api/v3/ticker/price?symbol=${this.par(simbolo, quote)}`
    );
    return Number(j.price);
  },

  /** Saldos com valor livre > 0. */
  async saldo(cfg) {
    const j = await this.assinado(cfg, 'GET', '/api/v3/account');
    return (j.balances || [])
      .map((b) => ({ ativo: b.asset, livre: Number(b.free) }))
      .filter((b) => b.livre > 0);
  },

  /** Lote mínimo (stepSize) e noção mínima do par, com cache. */
  async filtros(cfg, par) {
    if (loteCache.has(par)) return loteCache.get(par);
    const j = await requisicao(
      `${this.urlBase(cfg.testnet)}/api/v3/exchangeInfo?symbol=${par}`
    );
    const s = j.symbols?.[0];
    if (!s) throw new Error(`Par ${par} não existe na Binance.`);
    const passo =
      s.filters.find((f) => f.filterType === 'LOT_SIZE')?.stepSize || '0.00000001';
    const minNocional =
      s.filters.find((f) => f.filterType === 'NOTIONAL' || f.filterType === 'MIN_NOTIONAL')
        ?.minNotional || '5';
    const f = { passo, minNocional: Number(minNocional) };
    loteCache.set(par, f);
    return f;
  },

  /** Ordem a mercado. o = { lado:'compra'|'venda', simbolo, quote, usd?, qtd? } */
  async criarOrdem(cfg, o) {
    const par = this.par(o.simbolo, o.quote);
    const filtros = await this.filtros(cfg, par);
    const params = {
      symbol: par,
      side: o.lado === 'compra' ? 'BUY' : 'SELL',
      type: 'MARKET',
      newOrderRespType: 'FULL',
    };
    if (o.lado === 'compra') {
      if (o.usd < filtros.minNocional) {
        throw new Error(
          `Binance exige no mínimo ${filtros.minNocional} ${o.quote} por ordem (você tentou ${o.usd}).`
        );
      }
      params.quoteOrderQty = String(o.usd); // compra X USDT da moeda
    } else {
      params.quantity = arredondarParaPasso(o.qtd, filtros.passo);
    }
    const j = await this.assinado(cfg, 'POST', '/api/v3/order', params);
    const qtd = Number(j.executedQty || 0);
    const bruto = Number(j.cummulativeQuoteQty || 0);
    return {
      idOrdem: String(j.orderId),
      par,
      status: j.status,
      qtdExecutada: qtd,
      brutoExecutado: bruto,
      precoMedio: qtd > 0 ? bruto / qtd : null,
      cru: j,
    };
  },

  async consultarOrdem(cfg, par, idOrdem) {
    const j = await this.assinado(cfg, 'GET', '/api/v3/order', { symbol: par, orderId: idOrdem });
    const qtd = Number(j.executedQty || 0);
    const bruto = Number(j.cummulativeQuoteQty || 0);
    return {
      status: j.status,
      qtdExecutada: qtd,
      brutoExecutado: bruto,
      precoMedio: qtd > 0 ? bruto / qtd : null,
    };
  },

  /** Requisição assinada (HMAC SHA256 na query). */
  async assinado(cfg, metodo, caminho, params = {}) {
    if (!cfg.apiKey || !cfg.secret) {
      throw new Error(
        'Credenciais da Binance ausentes — configure COINMIND_BINANCE_API_KEY e COINMIND_BINANCE_API_SECRET (ou ~/.coinmind/corretoras.json).'
      );
    }
    const consulta = qs({ ...params, timestamp: agoraMs(), recvWindow: 5000 });
    const assinatura = hmacHex(cfg.secret, consulta);
    const url = `${this.urlBase(cfg.testnet)}${caminho}?${consulta}&signature=${assinatura}`;
    return requisicao(url, { metodo, cabecalhos: { 'X-MBX-APIKEY': cfg.apiKey } });
  },
};
