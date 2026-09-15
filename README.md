# Sorteio da live da Bianca

Máquina de sorteio em formato caça-níquel, feita pra rodar ao vivo: puxa a
alavanca, os rolos giram e param no número sorteado.

O resultado **não vem do aleatório deste computador**. Vem de um beacon público
de aleatoriedade, e pode ser recalculado por qualquer pessoa depois:

```bash
npm run verificar -- sorteio.json
```

Como isso funciona e o que exatamente fica provado está em
[VERIFICACAO.md](VERIFICACAO.md).

## Rodando

```bash
npm install
npm run dev
```

A página abre em <http://localhost:3000>.

## Usando na live

- **Puxar**: arraste a bola vermelha pra baixo até os marcadores ficarem
  vermelhos e solte. Um clique ou a barra de espaço também servem.
- **Tela cheia**: botão no rodapé, pra transmitir sem a barra do navegador.
- **Tirar sorteados do pote**: ligado por padrão. Se o ganhador não quiser o
  prêmio, é só puxar de novo — ele já sai do pote.
- **Baixar prova**: gera o `sorteio.json` com tudo que é preciso pra verificar.
  **Baixe antes de fechar a aba** — os sorteios ficam só na memória da página.
- **Zerar sorteio**: limpa o histórico e devolve todo mundo ao pote. Pede
  confirmação em dois cliques.

> Precisa de internet durante a live: cada sorteio espera uma rodada do drand.
> Sem rede, a máquina avisa e **não sorteia** — em vez de cair calada num
> aleatório local que ninguém conseguiria conferir depois.

## Antes de sortear

Publique o hash da lista (aparece no rodapé da página, em "sorteio verificável")
em algum lugar com data — o próprio grupo do WhatsApp serve. É isso que prova,
depois, que a lista não foi mexida.

## Editando a lista

Um número por item em [`lib/participantes.json`](lib/participantes.json), no
formato `"DDD NNNNN-NNNN"` (ou `"DDD NNNN-NNNN"` pros antigos de 8 dígitos).
Formato errado ou número repetido quebra na hora, em vez de sumir calado do
sorteio.

Mexer na lista muda o hash — então mexa **antes** de publicá-lo.

## Stack

Next.js 16 · React 19 · Tailwind 4 · GSAP · drand (quicknet) · @noble/curves
