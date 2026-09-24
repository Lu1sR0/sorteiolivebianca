<div align="center">

# Sorteio da Live da Bianca

Máquina de sorteio em formato caça-níquel, feita para rodar ao vivo, com resultado verificável por qualquer pessoa.

[![Ver site](https://img.shields.io/badge/VER_SITE-0D0D0D?style=for-the-badge&logo=vercel&logoColor=FF003C)](https://sorteiolivebianca.vercel.app)

![Next.js](https://img.shields.io/badge/Next.js_16-0D0D0D?style=for-the-badge&logo=next.js&logoColor=FF003C)
![React](https://img.shields.io/badge/React_19-0D0D0D?style=for-the-badge&logo=react&logoColor=FF003C)
![TypeScript](https://img.shields.io/badge/TypeScript-0D0D0D?style=for-the-badge&logo=typescript&logoColor=FF003C)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS_4-0D0D0D?style=for-the-badge&logo=tailwindcss&logoColor=FF003C)
![GSAP](https://img.shields.io/badge/GSAP-0D0D0D?style=for-the-badge&logo=greensock&logoColor=FF003C)
![Node.js](https://img.shields.io/badge/Node.js-0D0D0D?style=for-the-badge&logo=nodedotjs&logoColor=FF003C)

</div>

## Sobre

Puxa a alavanca, os rolos giram e param no número sorteado.

O resultado **não vem do aleatório deste computador**. Vem de um beacon público
de aleatoriedade, e pode ser recalculado por qualquer pessoa depois:

```bash
npm run verificar -- sorteio.json
```

Como isso funciona e o que exatamente fica provado está em
[VERIFICACAO.md](VERIFICACAO.md).

## Como funciona, em resumo

- **Fonte do acaso**: rede `quicknet` do [drand](https://drand.love) (League of Entropy), que publica um número aleatório assinado a cada 3 segundos.
- **Compromisso antes do giro**: ao puxar a alavanca, a máquina escolhe uma rodada do drand que ainda não existe (cerca de 6 s no futuro) e mostra o número dela na tela antes de os rolos pararem.
- **Cálculo determinístico**: o ganhador sai de um SHA-256 que amarra o hash da lista, o número do sorteio, a rodada, a aleatoriedade e o hash do sorteio anterior, com amostragem por rejeição para não haver viés.
- **Corrente de sorteios**: cada sorteio guarda o hash do anterior; apagar ou alterar um quebra todos os seguintes.
- **Verificador independente**: `scripts/verificar.mjs` baixa as rodadas do drand, confere a assinatura BLS12-381 contra a chave pública da rede e recalcula tudo.

A mesma matemática (`lib/prova.mjs`) roda no navegador e no verificador, para não poderem divergir.

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

A trilha sonora é sintetizada na hora com Web Audio (sem arquivos de áudio) e pode ser silenciada.

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

## Tecnologias

- [Next.js 16](https://nextjs.org) (App Router) + React 19 + TypeScript
- Tailwind CSS 4
- [GSAP](https://gsap.com) para a animação dos rolos e da alavanca
- [drand](https://drand.love) (`quicknet`) como fonte pública de aleatoriedade
- [@noble/curves](https://github.com/paulmillr/noble-curves) para verificar as assinaturas BLS12-381
- Web Crypto (SHA-256) e Web Audio, nativos do navegador

## Estrutura

| Arquivo | Papel |
|---|---|
| `components/Maquina.tsx` | A máquina: orquestra alavanca, rolos, confete e o fluxo do sorteio |
| `components/Prova.tsx` | Histórico dos sorteios e exportação do `sorteio.json` |
| `lib/participantes.json` | A lista. Entra no hash exatamente nesta ordem |
| `lib/prova.mjs` | A matemática do sorteio, compartilhada com o verificador |
| `lib/drand.mjs` | Cliente do beacon e parâmetros da rede |
| `lib/som.ts` | Efeitos sonoros sintetizados |
| `scripts/verificar.mjs` | O verificador |

## Como rodar localmente

```bash
npm install
npm run dev
```

A página abre em <http://localhost:3000>.

Para conferir uma prova exportada:

```bash
npm run verificar -- sorteio.json
```

---

<div align="center">

Desenvolvido por <a href="https://github.com/Lu1sR0">Luis Roberto</a> · <a href="https://outframe.dev">Outframe</a>

</div>
