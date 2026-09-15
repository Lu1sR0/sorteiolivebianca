/**
 * Participantes do sorteio — extraidos do grupo do WhatsApp da live.
 *
 * A lista mora em `participantes.json` e e a fonte da verdade do sorteio: o
 * mesmo arquivo alimenta a maquina no navegador e o script `npm run verificar`.
 * Manter um arquivo so, em formato simples, e o que permite a qualquer pessoa
 * recalcular o sorteio sem precisar interpretar codigo.
 *
 * Formato de cada item: "DDD NNNNN-NNNN" (celular com 9 digitos) ou
 * "DDD NNNN-NNNN" (numeros antigos, sem o nono digito).
 */

import bruto from "./participantes.json";
import { idCanonico } from "./prova.mjs";

/** Simbolo que ocupa a casa vaga dos numeros de 8 digitos. */
export const VAZIO = "·";

/** Quantidade de rolos da maquina: 2 do DDD + 5 + 4 do numero. */
export const CASAS = 11;

/**
 * Combinacao que a maquina mostra parada. E de proposito um numero que nao
 * existe (DDD 00 nao e valido no Brasil) pra ninguem no ar confundir a tela
 * de descanso com um resultado de sorteio.
 */
export const REPOUSO = [..."00", ..."12345", ..."6789"];

export type Participante = {
  /** Identidade canonica: so os digitos. E o que entra no hash da lista. */
  id: string;
  ddd: string;
  assinante: string;
  /** Um caractere por rolo, na ordem em que aparecem na maquina. */
  casas: string[];
  /** "+55 11 99326-9013" */
  display: string;
  /** "+55 11 9****-9013" — usado na esteira, pra nao expor todo mundo. */
  mascarado: string;
  /** Link direto pra conversa: wa.me/5511993269013 */
  whatsapp: string;
};

const LINHA = /^(\d{2}) (\d{4,5})-(\d{4})$/;

function montar(linha: string): Participante {
  const m = LINHA.exec(linha.trim());
  if (!m) throw new Error(`Numero fora do formato "DDD NNNNN-NNNN": "${linha}"`);

  const [, ddd, inicio, fim] = m;
  const assinante = inicio + fim;

  // Numeros de 8 digitos ficam com a primeira casa vazia, alinhando todos
  // os participantes nos mesmos 11 rolos sem inventar digito nenhum.
  const casas = [...ddd, ...inicio.padStart(5, VAZIO), ...fim];

  return {
    id: idCanonico(linha),
    ddd,
    assinante,
    casas,
    display: `+55 ${ddd} ${inicio}-${fim}`,
    mascarado: `+55 ${ddd} ${inicio[0]}${"*".repeat(inicio.length - 1)}-${fim}`,
    whatsapp: `55${ddd}${assinante}`,
  };
}

/** As linhas cruas, na ordem exata em que entram no hash da lista. */
export const LINHAS: readonly string[] = (bruto as string[]).map((l) => l.trim());

export const PARTICIPANTES: readonly Participante[] = (() => {
  const lista = LINHAS.map(montar);

  const vistos = new Set<string>();
  for (const p of lista) {
    if (vistos.has(p.id)) throw new Error(`Numero repetido na lista: ${p.display}`);
    vistos.add(p.id);
    if (p.casas.length !== CASAS) {
      throw new Error(`${p.display} gerou ${p.casas.length} casas, esperado ${CASAS}`);
    }
  }

  return lista;
})();

/** Ids canonicos na ordem da lista — e esta ordem que o sorteio indexa. */
export const IDS: readonly string[] = PARTICIPANTES.map((p) => p.id);

export function porId(id: string): Participante | undefined {
  return PARTICIPANTES.find((p) => p.id === id);
}
