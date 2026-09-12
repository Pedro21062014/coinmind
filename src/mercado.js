// ─────────────────────────────────────────────────────────────────────────────
//  coinmind · motor de mercado simulado
//  Random walk geométrico + eventos de choque (tweets, rug pulls, ETFs...).
// ─────────────────────────────────────────────────────────────────────────────

/** PRNG determinístico (mulberry32) — permite testes reproduzíveis com --semente. */
export class RNG {
  constructor(semente = Date.now() % 2147483647) {
    this.semente = semente >>> 0;
    this.estado = this.semente;
  }
  /** float [0,1) */
  proximo() {
    this.estado = (this.estado + 0x6d2b79f5) >>> 0;
    let t = this.estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** float em [a,b) */
  intervalo(a, b) {
    return a + this.proximo() * (b - a);
  }
  /** inteiro em [a,b] */
  inteiro(a, b) {
    return Math.floor(this.intervalo(a, b + 1));
  }
  /** distribuição normal padrão (Box-Muller) */
  gauss() {
    let u = 0;
    let v = 0;
    while (u === 0) u = this.proximo();
    while (v === 0) v = this.proximo();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  escolher(arr) {
    return arr[Math.floor(this.proximo() * arr.length)];
  }
}

export const CATEGORIAS = {
  normal: { rotulo: '🔵 Blue Chip', vol: 'baixa' },
  meme: { rotulo: '🐸 Meme', vol: 'insana' },
  web3: { rotulo: '🌐 Web3', vol: 'alta' },
};

/** Catálogo de moedas do mercado simulado. */
export const CATALOGO = [
  // 🔵 Blue Chips — oscilação "de gente grande"
  { simbolo: 'BTC', nome: 'Bitcoin', emoji: '🟠', categoria: 'normal', precoBase: 65230, vol: 0.004, chanceEvento: 0.004 },
  { simbolo: 'ETH', nome: 'Ethereum', emoji: '🔷', categoria: 'normal', precoBase: 3480, vol: 0.005, chanceEvento: 0.005 },
  { simbolo: 'SOL', nome: 'Solana', emoji: '🟣', categoria: 'normal', precoBase: 152, vol: 0.008, chanceEvento: 0.008 },
  { simbolo: 'BNB', nome: 'BNB', emoji: '🟡', categoria: 'normal', precoBase: 585, vol: 0.005, chanceEvento: 0.004 },
  { simbolo: 'XRP', nome: 'XRP', emoji: '✖️', categoria: 'normal', precoBase: 0.54, vol: 0.009, chanceEvento: 0.006 },
  // 🐸 Memes — aqui o chão some e a lua é próxima (ou não)
  { simbolo: 'DOGE', nome: 'Dogecoin', emoji: '🐕', categoria: 'meme', precoBase: 0.158, vol: 0.02, chanceEvento: 0.03 },
  { simbolo: 'SHIB', nome: 'Shiba Inu', emoji: '🐶', categoria: 'meme', precoBase: 0.0000245, vol: 0.025, chanceEvento: 0.03 },
  { simbolo: 'PEPE', nome: 'Pepe', emoji: '🐸', categoria: 'meme', precoBase: 0.0000118, vol: 0.03, chanceEvento: 0.035 },
  { simbolo: 'BONK', nome: 'Bonk', emoji: '🔨', categoria: 'meme', precoBase: 0.0000295, vol: 0.032, chanceEvento: 0.035 },
  { simbolo: 'FLOKI', nome: 'Floki', emoji: '⚔️', categoria: 'meme', precoBase: 0.00021, vol: 0.028, chanceEvento: 0.03 },
  { simbolo: 'WIF', nome: 'dogwifhat', emoji: '🧢', categoria: 'meme', precoBase: 2.45, vol: 0.03, chanceEvento: 0.03 },
  // 🌐 Web3 / DeFi — infraestrutura do futuro (com dose de drama)
  { simbolo: 'LINK', nome: 'Chainlink', emoji: '🔗', categoria: 'web3', precoBase: 14.8, vol: 0.01, chanceEvento: 0.012 },
  { simbolo: 'UNI', nome: 'Uniswap', emoji: '🦄', categoria: 'web3', precoBase: 9.2, vol: 0.012, chanceEvento: 0.012 },
  { simbolo: 'AAVE', nome: 'Aave', emoji: '👻', categoria: 'web3', precoBase: 96, vol: 0.012, chanceEvento: 0.012 },
  { simbolo: 'ARB', nome: 'Arbitrum', emoji: '🔵', categoria: 'web3', precoBase: 1.08, vol: 0.016, chanceEvento: 0.015 },
  { simbolo: 'OP', nome: 'Optimism', emoji: '🔴', categoria: 'web3', precoBase: 2.28, vol: 0.016, chanceEvento: 0.015 },
  { simbolo: 'TIA', nome: 'Celestia', emoji: '🪐', categoria: 'web3', precoBase: 6.1, vol: 0.02, chanceEvento: 0.018 },
];

/** Eventos que chacoalham o preço (multiplicador sorteado no intervalo). */
const EVENTOS = {
  meme: [
    { desc: '🚀 tweet do Elon', min: 1.15, max: 1.65 },
    { desc: '🔥 listagem em exchange gigante', min: 1.1, max: 1.45 },
    { desc: '😂 virou meme viral no TikTok', min: 1.1, max: 1.5 },
    { desc: '📉 rug pull do dev', min: 0.45, max: 0.75 },
    { desc: '🐳 baleia despejou tudo no mercado', min: 0.7, max: 0.9 },
  ],
  web3: [
    { desc: '🦄 airdrop anunciado', min: 1.08, max: 1.3 },
    { desc: '🤝 parceria com protocolo grande', min: 1.05, max: 1.25 },
    { desc: '🔓 unlock gigante de tokens', min: 0.75, max: 0.92 },
    { desc: '⚡ exploit em protocolo irmão', min: 0.7, max: 0.9 },
    { desc: '🏦 fundo gigante entrou na rede', min: 1.06, max: 1.28 },
  ],
  normal: [
    { desc: '🏦 decisão de juros do Fed', min: 0.97, max: 1.04 },
    { desc: '📈 ETF aprovado', min: 1.02, max: 1.08 },
    { desc: '🌍 crise macro global', min: 0.93, max: 0.99 },
    { desc: '🐋 movimento institucional', min: 0.98, max: 1.05 },
  ],
};

export class Mercado {
  constructor(rng = new RNG()) {
    this.rng = rng;
    this.ciclo = 0;
    this.moedas = CATALOGO.map((m) => ({
      ...m,
      preco: m.precoBase * rng.intervalo(0.9, 1.1),
      abertura: 0,
      historico: [],
      max: 0,
      min: Infinity,
      eventos: 0,
    }));
    for (const m of this.moedas) {
      m.abertura = m.preco;
      m.max = m.preco;
      m.min = m.preco;
      m.historico.push(m.preco);
    }
  }

  moeda(simbolo) {
    const s = String(simbolo).toUpperCase();
    const m = this.moedas.find((x) => x.simbolo === s);
    if (!m) throw new Error(`Moeda desconhecida: ${simbolo} (use o comando "mercado" pra ver a lista)`);
    return m;
  }

  /** Avança 1 tick do mercado em todas as moedas. Retorna os eventos ocorridos. */
  tick() {
    this.ciclo++;
    const eventos = [];
    for (const m of this.moedas) {
      // random walk geométrico com leve tendência de alta por ciclo
      let logRet = this.rng.gauss() * m.vol + this.rng.intervalo(-0.0008, 0.0016);

      // choque de evento?
      if (this.rng.proximo() < m.chanceEvento) {
        const ev = this.rng.escolher(EVENTOS[m.categoria]);
        const mult = this.rng.intervalo(ev.min, ev.max);
        logRet += Math.log(mult);
        m.eventos++;
        eventos.push({
          ciclo: this.ciclo,
          simbolo: m.simbolo,
          emoji: m.emoji,
          nome: m.nome,
          desc: ev.desc,
          impacto: (mult - 1) * 100,
        });
      }

      m.preco = Math.max(m.preco * Math.exp(logRet), m.precoBase * 0.01);
      m.historico.push(m.preco);
      if (m.historico.length > 240) m.historico.shift();
      if (m.preco > m.max) m.max = m.preco;
      if (m.preco < m.min) m.min = m.preco;
    }
    return eventos;
  }

  /** Variação % desde a abertura da sessão. */
  variacao(m) {
    return (m.preco / m.abertura - 1) * 100;
  }
}
