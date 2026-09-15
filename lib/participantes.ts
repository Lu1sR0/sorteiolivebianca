/**
 * Participantes do sorteio — extraidos do grupo do WhatsApp da live.
 *
 * A lista e a fonte da verdade do sorteio: mexeu aqui, mudou o pote.
 * Formato de cada linha: "DDD NNNNN-NNNN" (celular com 9 digitos) ou
 * "DDD NNNN-NNNN" (numeros antigos, sem o nono digito).
 */

const RAW = `
54 9108-1625
49 8921-7941
83 8808-4691
62 9661-6445
35 9915-8086
27 98121-7862
11 99326-9013
88 9645-5127
21 99830-2541
21 98624-1286
24 99962-9761
67 9321-3682
89 9410-2170
11 96752-3376
49 8809-4370
31 9766-7228
71 9913-2008
83 8855-4256
48 8832-5686
11 98057-3846
41 9584-6487
16 99358-6226
75 8136-3163
11 98293-2161
11 98232-2989
63 8103-1373
24 99870-7467
51 8060-7346
21 97091-8270
11 98785-2028
21 96708-2239
48 9659-6293
71 9397-2676
22 98110-4447
61 9382-5344
11 98483-6481
86 9577-1658
11 97477-0162
11 98222-5483
11 98622-2211
27 99276-8081
69 8114-0535
48 9604-0621
14 99744-7406
12 99771-0564
54 9673-5502
11 96706-4125
44 8832-6087
41 9973-8162
21 96909-0324
88 9692-3200
51 9959-2032
21 99691-1531
41 9869-9901
21 99182-2685
21 95904-1483
19 97156-2010
16 99172-0961
79 9824-5706
33 8828-5010
67 9830-6006
63 8490-9829
21 97621-6160
21 96545-3526
`;

/** Simbolo que ocupa a casa vaga dos numeros de 8 digitos. */
export const VAZIO = "\u00B7";

/** Quantidade de rolos da maquina: 2 do DDD + 5 + 4 do numero. */
export const CASAS = 11;

export type Participante = {
  /** Identidade estavel do participante (o proprio numero, so digitos). */
  id: string;
  ddd: string;
  assinante: string;
  /** Um caractere por rolo, na ordem em que aparecem na maquina. */
  casas: string[];
  /** "+55 11 99326-9013" */
  display: string;
  /** "+55 11 9****-9013" — usado na lista do pote, pra nao expor todo mundo. */
  mascarado: string;
  /** Link direto pra conversa: wa.me/5511993269013 */
  whatsapp: string;
};

const LINHA = /^(\d{2}) (\d{4,5})-(\d{4})$/;

function montar(linha: string): Participante {
  const m = LINHA.exec(linha);
  if (!m) throw new Error(`Numero fora do formato "DDD NNNNN-NNNN": "${linha}"`);

  const [, ddd, inicio, fim] = m;
  const assinante = inicio + fim;

  // Numeros de 8 digitos ficam com a primeira casa vazia, alinhando todos
  // os participantes nos mesmos 11 rolos sem inventar digito nenhum.
  const casas = [...ddd, ...inicio.padStart(5, VAZIO), ...fim];

  return {
    id: ddd + assinante,
    ddd,
    assinante,
    casas,
    display: `+55 ${ddd} ${inicio}-${fim}`,
    mascarado: `+55 ${ddd} ${inicio[0]}${"*".repeat(inicio.length - 1)}-${fim}`,
    whatsapp: `55${ddd}${assinante}`,
  };
}

export const PARTICIPANTES: readonly Participante[] = (() => {
  const linhas = RAW.trim().split("\n").map((l) => l.trim()).filter(Boolean);
  const lista = linhas.map(montar);

  const vistos = new Set<string>();
  for (const p of lista) {
    if (vistos.has(p.id)) throw new Error(`Numero repetido na lista: ${p.display}`);
    vistos.add(p.id);
  }
  for (const p of lista) {
    if (p.casas.length !== CASAS) {
      throw new Error(`${p.display} gerou ${p.casas.length} casas, esperado ${CASAS}`);
    }
  }

  return lista;
})();

/**
 * Combinacao que a maquina mostra parada. E de proposito um numero que nao
 * existe (DDD 00 nao e valido no Brasil) pra ninguem no ar confundir a tela
 * de descanso com um resultado de sorteio.
 */
export const REPOUSO = [..."00", ..."12345", ..."6789"];

/** Onde cada grupo de rolos comeca, pro layout separar DDD / prefixo / final. */
export const GRUPOS = [
  { inicio: 0, fim: 2 },
  { inicio: 2, fim: 7 },
  { inicio: 7, fim: 11 },
] as const;
