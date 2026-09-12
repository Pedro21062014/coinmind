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

**v1.2:** ⚙️ configuração 100% pela CLI · 🔥 ordens REAIS via **Binance**, **Bybit** e **OKX** com modo **testnet/real**.

`zero dependências` · `Node 18+` · `100% terminal`

</div>

---

## ⚠️ Aviso

O mercado simulado é **educacional** (preços gerados localmente). As ordens reais
(`coinmind real ...`) movimentam **dinheiro de verdade** na corretora escolhida —
use com moderação. Nada aqui é conselho financeiro.

## 📦 Instalação

```bash
npm install -g coinmind     # ou use: npx coinmind
```

## 🚀 Uso rápido

```bash
coinmind                    # banner + ajuda
coinmind mercado            # cotações do mercado simulado
coinmind mercado --ciclos 10 --intervalo 600

coinmind comprar PEPE 100   # simulação: gasta US$ 100 fictícios
coinmind vender PEPE tudo
coinmind carteira           # posições, saldo e lucro/prejuízo

coinmind teste              # 🧪 teste real completo: LUCRO ou PERDA
coinmind letras HODL        # letras gigantes estilo ANSI Shadow
```

## ⚙️ Configuração direto na CLI (v1.2)

Sem `export`, sem editar JSON — o assistente pergunta tudo:

```bash
coinmind config
```

O assistente conduz: **corretora → chaves da API → modo (testnet/real) → estratégia**
e já testa a conexão no final. Ou passo a passo:

```bash
coinmind config chaves --corretora binance --api-key SUA_KEY --secret SEU_SECRET
coinmind config modo --testnet      # dinheiro de mentira (padrão, seguro)
coinmind config modo --real         # dinheiro de verdade 🔥
coinmind config estrategia dip --lote 120 --queda 5 --lucro 6 --stop 8
coinmind config mostrar             # vê tudo que está salvo
coinmind config apagar binance      # remove as chaves
```

Configurou uma vez, vale pra sempre — corretora, chaves, modo e estratégia
ficam salvos em `~/.coinmind/config.json` e todos os comandos usam sozinhos.

> Se preferir, também funcionam as variáveis de ambiente
> (`COINMIND_BINANCE_API_KEY`, `COINMIND_BYBIT_API_KEY`, `COINMIND_OKX_API_KEY`...).

## 🤖 Modo robô (usa a estratégia que você salvou)

```bash
coinmind rodar                          # usa a estratégia do coinmind config
coinmind rodar --estrategia dip --queda 7 --lucro 8    # ajusta na hora (em %)
coinmind rodar --estrategia momentum --ciclos 60 --capital 2000
coinmind rodar --estrategia dca --cada 5 --moedas BTC,DOGE
```

| Estratégia | Emoji | Como funciona | Parâmetros |
|---|---|---|---|
| `dip` | 🎣 | Compra quando a moeda cai X% da máxima; vende no lucro-alvo ou stop-loss | `--lote --queda --lucro --stop` |
| `momentum` | 🏃 | Compra no cruzamento de médias (alta), vende na reversão | `--lote --curta --longa` |
| `dca` | 🕰️ | Compra valor fixo a cada N ciclos, sem olhar preço | `--lote --cada --moedas` |

## 🔥 Ordens REAIS — Binance, Bybit e OKX

```bash
coinmind corretoras                        # painel: o que está configurado
coinmind real preco BTC                    # preço real agora (público)
coinmind real saldo                        # seus saldos na corretora salva
coinmind real comprar BTC 25 --prever      # 👁️ mostra a ordem SEM enviar nada
coinmind real comprar BTC 25 --sim         # 🔥 ordem REAL a mercado
coinmind real vender PEPE tudo             # 🔥 vende TODA a PEPE real
```

- O **modo** (testnet/real) é o que você salvou em `coinmind config modo`;
  sobrescreva pontualmente com `--real` ou `--testnet`.
- `-c bybit` troca a corretora numa execução só.
- Ordem a mercado usa `quoteOrderQty` (compra por valor em USDT) e respeita
  `stepSize`/`minNotional` de cada par; o preenchimento é consultado logo depois.

### 🛟 Segurança em camadas

| Camada | O que faz |
|---|---|
| Padrão testnet | sem config explícita de modo real, nada real acontece |
| Comando separado (`real`) | impossível confundir com a simulação |
| `--prever` | dry-run: mostra exatamente a ordem, não envia nada |
| Confirmação digitada | sem `--sim`, você precisa digitar `SIM` no terminal |
| Chave só-trade | crie a chave **sem permissão de saque** e com IP restrito |
| Segredos ocultos | na tela só aparece `••••últimos4` |

## 🧪 O teste real (simulado)

```bash
coinmind teste [--semente 42]
```

Monta carteira de US$ 1.000 (BTC, ETH, SOL, LINK, DOGE, PEPE), o robô opera 60
ciclos no mercado volátil, vende tudo e entrega o veredito **LUCRO** ou **PERDA**
com tabela por moeda, eventos do mercado e curva do patrimônio.

## 🐸 O mercado simulado

| Categoria | Moedas | Volatilidade | Eventos |
|---|---|---|---|
| 🔵 Blue Chip | BTC, ETH, SOL, BNB, XRP | baixa | Fed, ETFs, macro |
| 🐸 Meme | DOGE, SHIB, PEPE, BONK, FLOKI, WIF | insana | tweets do Elon, rug pulls, listagens |
| 🌐 Web3 | LINK, UNI, AAVE, ARB, OP, TIA | alta | airdrops, unlocks, exploits |

## 🛠️ Desenvolvimento

```bash
git clone https://github.com/Pedro21062014/coinmind.git
cd coinmind
npm test          # 21 testes (node:test, zero deps)
npm start         # roda a CLI local
```

Publicar versão nova (o workflow usa o segredo `NPM_TOKEN`):

```bash
npm version patch   # ou minor/major
git push --follow-tags
```

## 📄 Licença

MIT — veja [LICENSE](LICENSE).
