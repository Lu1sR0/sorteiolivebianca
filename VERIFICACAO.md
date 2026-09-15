# Como conferir que o sorteio não foi manipulado

Este sorteio foi feito de um jeito que **não depende de confiar em quem organizou**.
Você não precisa acreditar na palavra de ninguém, nem auditar o código: dá pra
recalcular o resultado inteiro por conta própria e comparar.

```bash
npm install
npm run verificar -- sorteio.json
```

Se sair `Tudo confere`, o resultado anunciado é exatamente o que a matemática
produz a partir de dados públicos. Se qualquer coisa tiver sido mexida, o script
falha e diz onde.

---

## Por que não bastava um `random()`

A versão inicial sorteava com `crypto.getRandomValues()` do navegador. É
imparcial e imprevisível, mas tem um problema fatal pra um sorteio público: **não
deixa prova**. O número sai, e depois não existe nada que permita a alguém de
fora confirmar que ele foi mesmo sorteado, e não escolhido. Publicar o código não
resolve — ninguém consegue provar que o código publicado foi o que rodou na hora.

Então a aleatoriedade foi tirada das mãos de quem organiza.

## De onde vem o acaso

Do [drand](https://drand.love), da **League of Entropy** — uma rede pública mantida
por organizações independentes (Cloudflare, Protocol Labs, universidades, entre
outras) que publica um número aleatório a cada 3 segundos.

Cada número é assinado coletivamente pela rede, usando criptografia de limiar: só
sai se um número mínimo de participantes independentes concordar. Três
consequências:

- **Ninguém prevê o próximo.** Nem a rede inteira junta, antes da hora.
- **Ninguém forja um passado.** A assinatura não fecha se o número for inventado.
- **Todo mundo pode conferir.** As rodadas são públicas e permanentes.

A rede usada é a `quicknet`, cadeia
`52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971`.

## O compromisso antes do giro

Quando a alavanca é puxada, a máquina escolhe uma rodada do drand que **ainda não
existe** (cerca de 6 segundos no futuro) e mostra o número dela na tela *antes* de
os rolos pararem. Os rolos giram soltos enquanto essa rodada não é publicada.

Esse é o ponto central: no instante em que o número da rodada aparece na tela, o
resultado já está determinado e **ninguém no mundo sabe qual é** — nem quem está
operando a máquina. Quando a rodada sai, o ganhador é consequência, não escolha.

## Como o ganhador é calculado

Tudo determinístico, sem nenhuma aleatoriedade local:

```
aleatoriedade = SHA-256(assinatura da rodada)

semente = SHA-256(
  "sorteiolivebianca/v1" | "semente" | hashDaLista | nº do sorteio |
  rodada | aleatoriedade | hash do sorteio anterior | excluídos
)

índice = amostragem por rejeição sobre a semente, módulo o tamanho do pote
ganhador = pote[índice]
```

Detalhes que importam:

- **`aleatoriedade` é derivada da assinatura**, não lida de um campo que o
  servidor mandou. Assim ela vem de algo verificável.
- **Amostragem por rejeição.** Um `% n` simples favorece os primeiros índices
  sempre que 2³² não é múltiplo de `n` — com 64 participantes o viés seria
  pequeno, mas existiria. Aqui a sobra do topo da faixa é descartada e um
  contador deriva o próximo bloco, mantendo todo mundo com exatamente a mesma
  chance.
- **`hashDaLista`** prende quem estava concorrendo **e em que ordem**, já que a
  ordem é o que liga cada índice a uma pessoa.
- **`excluídos`** registra quem tinha saído do pote por já ter ganhado. O
  verificador exige que todo excluído seja ganhador de um sorteio anterior da
  mesma prova — não dá pra tirar alguém do pote por conta própria.

## A corrente

Cada sorteio guarda o hash do anterior. Isso forma uma corrente: alterar um
sorteio antigo quebra todos os seguintes, e apagar um do meio deixa um buraco
que o verificador aponta na hora.

É o que impede o truque mais óbvio — sortear várias vezes escondido e publicar só
o resultado que agradou. Os sorteios descartados ou aparecem na prova, ou a
corrente não fecha.

## O que o verificador confere

| Verificação | O que impede |
|---|---|
| Hash da lista bate com `lib/participantes.json` | Incluir, remover ou reordenar participantes depois |
| Rodada bate com a publicada pelo drand | Inventar a aleatoriedade |
| Assinatura BLS12-381 fecha com a chave da rede | Forjar uma rodada, mesmo servindo um servidor falso |
| `aleatoriedade == SHA-256(assinatura)` | Trocar o número por outro |
| Semente, índice e ganhador recalculados | Escolher o ganhador |
| Corrente de hashes intacta | Apagar ou reordenar sorteios |
| Todo excluído já tinha ganhado | Tirar alguém do pote sem motivo |

A verificação da assinatura é o passo que dispensa confiar em qualquer servidor:
mesmo que alguém sirva uma rodada falsificada por um endpoint próprio, ela não
fecha com a chave pública da `quicknet`, que está fixa no código e é conferível
em <https://api.drand.sh/v2/beacons/quicknet/info>.

## Conferir na mão, sem este repo

A parte mais importante — de onde veio o acaso — dá pra conferir direto na fonte:

```bash
# a rodada que está na prova, direto do drand
curl https://api.drand.sh/v2/beacons/quicknet/rounds/<rodada>
```

A `signature` que voltar tem que ser idêntica à que está no `sorteio.json`. E
`sha256` dessa assinatura (em bytes, não do texto hex) tem que dar a
`aleatoriedade` registrada.

## Limites — o que isto **não** garante

Sendo honesto sobre o alcance da prova:

- **A lista de participantes é um ato de confiança.** A prova garante que a lista
  não mudou depois do hash ser publicado; ela não garante que a lista original
  correspondia ao grupo do WhatsApp. Para fechar essa ponta, publique o
  `listaHash` **antes** do sorteio — numa mensagem no grupo, num post, em
  qualquer lugar com data.
- **Vários sorteios em sessões separadas** não ficam encadeados entre si: a
  corrente começa do zero a cada `sorteio.json`. Se houver mais de uma sessão,
  publique todas.
- **O hash confere o arquivo, não a intenção.** Ele prova que o `participantes.json`
  publicado é o mesmo usado no sorteio — e só isso.

## Arquivos

| Arquivo | Papel |
|---|---|
| `lib/participantes.json` | A lista. Entra no hash exatamente nesta ordem. |
| `lib/prova.mjs` | A matemática do sorteio. Roda igual no navegador e no verificador — um arquivo só, pra não poderem divergir. |
| `lib/drand.mjs` | Cliente do beacon e parâmetros da rede. |
| `scripts/verificar.mjs` | O verificador. |
| `sorteio.json` | A prova exportada pelo botão **baixar prova**. |
