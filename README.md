<div align="center">

```
 ██████╗  ██████╗  ██╗ ███╗   ██╗      ███╗   ███╗ ██╗ ███╗   ██╗ ██████╗
██╔════╝ ██╔═══██╗ ██║ ████╗  ██║      ████╗ ████║ ██║ ████╗  ██║ ██╔══██╗
██║      ██║   ██║ ██║ ██╔██╗ ██║      ██╔████╔██║ ██║ ██╔██╗ ██║ ██║  ██║
██║      ██║   ██║ ██║ ██║╚██╗██║      ██║╚██╔╝██║ ██║ ██║╚██╗██║ ██║  ██║
╚██████╗ ╚██████╔╝ ██║ ██║ ╚████║      ██║ ╚═╝ ██║ ██║ ██║ ╚████║ ██████╔╝
 ╚═════╝  ╚═════╝  ╚═╝ ╚═╝  ╚═══╝      ╚═╝     ╚═╝ ╚═╝ ╚═╝  ╚═══╝ ╚═════╝
```

**🧠 O robô de cripto que mora no seu terminal**

Simulador de mercado com moedas memes, blue chips e Web3 — preços que sobem e caem,
estratégias de trading automático e um veredito honesto: **LUCRO** ou **PERDA**.

**Novo na v1.1:** 🔥 ordens **REAIS** a mercado via **Binance**, **Bybit** e **OKX**.

`zero dependências` · `Node 18+` · `100% terminal`

</div>

---

## ⚠️ Aviso

Isto é um **simulador / paper trading educacional**. Os preços são gerados por um
motor de mercado local (random walk geométrico + eventos de choque). Nada aqui é
conselho financeiro e nenhum dinheiro real é movimentado.

## 📦 Instalação

```bash
npm install -g coinmind
```

Ou rode direto sem instalar:

```bash
npx coinmind teste
```

## 🚀 Uso rápido

```bash
coinmind                 # banner + ajuda
coinmind mercado         # cotações do mercado simulado
coinmind mercado --ciclos 10 --intervalo 600   # assiste ao vivo por 10 ciclos

coinmind comprar PEPE 100     # gasta US$ 100 em PEPE
coinmind vender PEPE tudo     # vende toda a posição
coinmind carteira             # posições, saldo e lucro/prejuízo
coinmind historico            # log de operações

coinmind letras HODL          # gera letras gigantes estilo ANSI Shadow
```

## 🤖 Modo robô (trading automático)

```bash
coinmind rodar --estrategia dip --ciclos 40 --lote 150
coinmind rodar --estrategia momentum --ciclos 60 --capital 2000
coinmind rodar --estrategia dca --ciclos 50
```

| Estratégia | Emoji | Como funciona |
|---|---|---|
| `dip` | 🎣 | Compra quando a moeda cai X% da máxima recente; vende no lucro-alvo (+6%) ou stop-loss (−8%) |
| `momentum` | 🏃 | Compra no cruzamento de médias (tendência de alta), vende na reversão |
| `dca` | 🕰️ | Compra valor fixo a cada N ciclos, sem olhar preço |

## 🧪 O teste real

Quer ver o robô provar na prática se dá lucro ou perda?

```bash
coinmind teste
```

O comando monta uma carteira de **US$ 1.000** com moedas de exemplo
(BTC, ETH, SOL, LINK, DOGE, PEPE), aquece o mercado, deixa o robô operar 60 ciclos,
vende tudo e te entrega o veredito:

```
 ▸ RESULTADO POR MOEDA
 MOEDA   INVESTIDO      VALOR FINAL    LUCRO/PERDA
 🟠 BTC  US$ 250,00     US$ 261,42     US$ +11,42 (+4,57%)
 🐸 PEPE US$ 100,00     US$ 63,17      US$ -36,83 (-36,83%)  <- um rug, clássico
 ...
  US$ 84,12 DE LUCRO (+8,41%)  🎉🚀💰
```

Rodadas são aleatórias (como a vida). Use `--semente 42` para uma rodada reproduzível.

## 🐸 O mercado simulado

| Categoria | Moedas | Volatilidade | Eventos |
|---|---|---|---|
| 🔵 Blue Chip | BTC, ETH, SOL, BNB, XRP | baixa | decisões do Fed, ETFs, macro |
| 🐸 Meme | DOGE, SHIB, PEPE, BONK, FLOKI, WIF | insana | tweets do Elon, rug pulls, listagens |
| 🌐 Web3 | LINK, UNI, AAVE, ARB, OP, TIA | alta | airdrops, unlocks, exploits |

Cada tick aplica um random walk geométrico por moeda, com chance de evento de
choque que multiplica o preço na hora. A carteira fica salva em `~/.coinmind/carteira.json`.

## 🛠️ Desenvolvimento

```bash
git clone https://github.com/Pedro21062014/coinmind.git
cd coinmind
npm test          # testes automatizados (node:test, zero deps)
npm start         # roda a CLI local
```

Publicar uma versão nova:

```bash
npm version patch   # 1.0.0 → 1.0.1 (major/minor também funcionam)
git push --follow-tags
```

O workflow **Publicar no NPM** (`.github/workflows/publicar.yml`) roda os testes
e publica sozinho usando o segredo `NPM_TOKEN` — sem `npm login` na máquina.

### 🔑 Configurar o NPM_TOKEN (uma vez só)

1. Gere um *Access Token* no npm: [npmjs.com → Access Tokens](https://www.npmjs.com/settings/~/tokens) → **Generate New Token** → tipo **Automation**
2. No GitHub do repo: **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `NPM_TOKEN`
   - Secret: cole o token
3. Pronto! A publicação acontece por tag (`v*`) ou pelo botão **Run workflow** na aba Actions.

O workflow também roda `npm test` antes de publicar e avisa se você esqueceu de
dar bump na versão.

## 📄 Licença

MIT — veja [LICENSE](LICENSE).
