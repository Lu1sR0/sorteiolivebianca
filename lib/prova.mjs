/**
 * Nucleo do sorteio verificavel.
 *
 * Este arquivo e a fonte da verdade do sorteio e roda identico nos dois lados:
 * no navegador durante a live e no script `npm run verificar` que qualquer
 * pessoa pode executar depois. Se o app e o verificador divergissem, a prova
 * nao valeria nada — por isso a matematica mora aqui, em um lugar so.
 *
 * Tudo aqui e deterministico: dadas a lista, a rodada do drand e o numero do
 * sorteio, o ganhador e sempre o mesmo. Nao ha `Math.random()` nem
 * `crypto.getRandomValues()` em lugar nenhum desta cadeia.
 *
 * Usa apenas Web Crypto (SHA-256), disponivel tanto no navegador quanto no
 * Node moderno, sem dependencia externa.
 */

/** Marca do formato. Muda se o esquema mudar, pra nao confundir provas velhas. */
export const VERSAO = "sorteiolivebianca/v1";

/** Elo inicial da corrente, antes do primeiro sorteio. */
export const GENESIS = "genesis";

const enc = new TextEncoder();

function hex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** SHA-256 de um texto (ou de bytes), devolvido em hexadecimal. */
/**
 * @param {string | Uint8Array} entrada
 * @returns {Promise<string>}
 */
export async function sha256(entrada) {
  const dados = typeof entrada === "string" ? enc.encode(entrada) : entrada;
  const digest = await crypto.subtle.digest("SHA-256", dados);
  return hex(new Uint8Array(digest));
}

/**
 * @param {string} s
 * @returns {Uint8Array}
 */
export function hexParaBytes(s) {
  const limpo = s.trim().toLowerCase();
  if (!/^[0-9a-f]*$/.test(limpo) || limpo.length % 2 !== 0) {
    throw new Error(`Hexadecimal invalido: "${s}"`);
  }
  const out = new Uint8Array(limpo.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(limpo.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/**
 * Identidade canonica de um participante: so os digitos, sem espaco nem traco.
 * "21 96545-3526" -> "21965453526"
 */
/**
 * @param {string} linha
 * @returns {string}
 */
export function idCanonico(linha) {
  const m = /^(\d{2}) (\d{4,5})-(\d{4})$/.exec(linha.trim());
  if (!m) throw new Error(`Numero fora do formato "DDD NNNNN-NNNN": "${linha}"`);
  return m[1] + m[2] + m[3];
}

/**
 * Impressao digital da lista de participantes.
 *
 * Prende quem esta concorrendo *e em que ordem*, porque a ordem determina qual
 * indice cai em quem. Publicado antes do sorteio, este hash impede que alguem
 * inclua, remova ou reordene participantes depois de ver o resultado.
 */
/**
 * @param {readonly string[]} linhas
 * @returns {Promise<string>}
 */
export async function hashDaLista(linhas) {
  const ids = linhas.map(idCanonico);
  if (new Set(ids).size !== ids.length) {
    throw new Error("Ha numeros repetidos na lista");
  }
  return sha256(`${VERSAO}|lista|${ids.length}|${ids.join(",")}`);
}

/**
 * Semente de um sorteio.
 *
 * Amarra tudo que precisa ser imutavel: a lista, o numero sequencial do
 * sorteio, a rodada do drand, a aleatoriedade daquela rodada e o hash do
 * sorteio anterior. Nenhuma dessas partes pode ser trocada depois sem que a
 * semente mude — e a semente decide o ganhador.
 */
/**
 * @param {{listaHash: string, n: number, rodada: number, aleatoriedade: string,
 *          anterior: string, excluidos?: readonly string[]}} p
 * @returns {Promise<string>}
 */
export async function derivarSemente({ listaHash, n, rodada, aleatoriedade, anterior, excluidos }) {
  return sha256(
    [
      VERSAO,
      "semente",
      listaHash,
      String(n),
      String(rodada),
      aleatoriedade,
      anterior,
      (excluidos ?? []).join(","),
    ].join("|"),
  );
}

/**
 * Quem estava concorrendo num sorteio: a lista inteira menos os ja sorteados
 * que foram tirados do pote. Fica registrada em cada entrada e entra na
 * semente, entao o pote de cada rodada e reconstruivel e imutavel.
 */
/**
 * @param {readonly string[]} ids
 * @param {readonly string[]} [excluidos]
 * @returns {string[]}
 */
export function montarPote(ids, excluidos) {
  const fora = new Set(excluidos ?? []);
  return ids.filter((id) => !fora.has(id));
}

/**
 * Indice do ganhador, extraido da semente sem vies.
 *
 * O `% tamanho` ingenuo favorece os primeiros indices sempre que 2^32 nao e
 * multiplo do tamanho da lista. Aqui a gente descarta a sobra do topo da faixa
 * (amostragem por rejeicao) e, quando um bloco e descartado, deriva o proximo
 * com um contador — mantendo o processo deterministico e reproduzivel.
 */
/**
 * @param {string} semente
 * @param {number} tamanho
 * @returns {Promise<number>}
 */
export async function indiceDaSemente(semente, tamanho) {
  if (!Number.isInteger(tamanho) || tamanho <= 0) {
    throw new Error(`Tamanho de lista invalido: ${tamanho}`);
  }

  const FAIXA = 2 ** 32;
  const limite = Math.floor(FAIXA / tamanho) * tamanho;

  for (let contador = 0; contador < 10000; contador++) {
    const bloco = hexParaBytes(await sha256(`${semente}|${contador}`));
    const valor =
      ((bloco[0] << 24) >>> 0) + (bloco[1] << 16) + (bloco[2] << 8) + bloco[3];
    if (valor < limite) return valor % tamanho;
  }

  // Probabilidade astronomicamente baixa; existe pra nunca virar laco infinito.
  throw new Error("Nao foi possivel derivar um indice sem vies");
}

/**
 * Hash de um sorteio ja concluido. Vira o elo `anterior` do proximo, formando
 * uma corrente: mexer num sorteio antigo quebra todos os seguintes, e apagar um
 * sorteio do meio deixa um buraco visivel.
 */
/**
 * @param {{semente: string, indice: number, ganhador: string}} p
 * @returns {Promise<string>}
 */
export async function hashDaEntrada({ semente, indice, ganhador }) {
  return sha256([VERSAO, "entrada", semente, String(indice), ganhador].join("|"));
}

/**
 * Executa um sorteio inteiro de forma deterministica.
 * Mesmas entradas, mesmo ganhador — no navegador ou no terminal.
 */
/**
 * @param {{ids: readonly string[], listaHash: string, n: number, rodada: number,
 *          aleatoriedade: string, anterior: string, excluidos?: readonly string[]}} p
 * @returns {Promise<{semente: string, indice: number, ganhador: string,
 *          hash: string, tamanhoDoPote: number}>}
 */
export async function sortearVerificavel({
  ids,
  listaHash,
  n,
  rodada,
  aleatoriedade,
  anterior,
  excluidos = [],
}) {
  const pote = montarPote(ids, excluidos);
  if (pote.length === 0) throw new Error("Pote vazio: nao ha quem sortear");

  const semente = await derivarSemente({ listaHash, n, rodada, aleatoriedade, anterior, excluidos });
  const indice = await indiceDaSemente(semente, pote.length);
  const ganhador = pote[indice];
  const hash = await hashDaEntrada({ semente, indice, ganhador });
  return { semente, indice, ganhador, hash, tamanhoDoPote: pote.length };
}
