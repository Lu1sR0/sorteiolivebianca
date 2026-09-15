/**
 * Sorteio justo: indice aleatorio sem vies, tirado do CSPRNG do navegador.
 *
 * Math.random() nao serve aqui — e previsivel e, pior, o `% n` ingenuo
 * favorece os primeiros indices. Usamos crypto.getRandomValues com
 * amostragem por rejeicao, que da probabilidade igual pra todo mundo.
 */

const FAIXA = 2 ** 32;

export function indiceAleatorio(tamanho: number): number {
  if (!Number.isInteger(tamanho) || tamanho <= 0) {
    throw new Error(`Pote vazio ou invalido: ${tamanho}`);
  }

  // Descarta a "sobra" no topo da faixa de 32 bits, que e o que criaria o vies.
  const limite = Math.floor(FAIXA / tamanho) * tamanho;
  const buf = new Uint32Array(1);

  let valor: number;
  do {
    crypto.getRandomValues(buf);
    valor = buf[0];
  } while (valor >= limite);

  return valor % tamanho;
}

export function sortear<T>(pote: readonly T[]): T {
  return pote[indiceAleatorio(pote.length)];
}

/** Identificador curto e legivel pra citar o sorteio na live. */
export function idDoSorteio(): string {
  const buf = new Uint8Array(3);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}
