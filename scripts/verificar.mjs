#!/usr/bin/env node
/**
 * Verificador independente do sorteio.
 *
 *   npm run verificar -- sorteio.json
 *
 * Refaz o sorteio inteiro do zero, sem confiar em nada que o organizador diga:
 *
 *   1. Confere que a lista de participantes publicada bate com o hash que
 *      estava na tela durante a live.
 *   2. Baixa cada rodada do drand direto da rede publica.
 *   3. Verifica a assinatura BLS de cada rodada contra a chave publica da
 *      quicknet — ou seja, confirma que aquele numero aleatorio foi mesmo
 *      produzido pela rede, e nao inventado por alguem.
 *   4. Recalcula a aleatoriedade, a semente e o indice, e compara o ganhador.
 *   5. Confere a corrente de hashes: um sorteio alterado ou apagado no meio
 *      quebra todos os seguintes.
 *   6. Confere que so foram tirados do pote numeros que ja tinham ganhado antes.
 *
 * Qualquer divergencia derruba a verificacao e o script sai com codigo 1.
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { bls12_381 } from "@noble/curves/bls12-381.js";

import {
  GENESIS,
  VERSAO,
  derivarSemente,
  hashDaEntrada,
  hashDaLista,
  hexParaBytes,
  idCanonico,
  indiceDaSemente,
  montarPote,
  sha256,
} from "../lib/prova.mjs";
import { CADEIA, ESPELHOS } from "../lib/drand.mjs";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Dominio de separacao do esquema bls-unchained-g1-rfc9380 usado pela quicknet. */
const DST = "BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_NUL_";

const c = {
  ok: (s) => `\x1b[32m${s}\x1b[0m`,
  erro: (s) => `\x1b[31m${s}\x1b[0m`,
  fraco: (s) => `\x1b[90m${s}\x1b[0m`,
  forte: (s) => `\x1b[1m${s}\x1b[0m`,
};

let falhas = 0;

function checar(condicao, descricao, detalhe) {
  if (condicao) {
    console.log(`  ${c.ok("OK")}  ${descricao}`);
  } else {
    falhas++;
    console.log(`  ${c.erro("FALHOU")}  ${descricao}`);
    if (detalhe) console.log(`        ${c.fraco(detalhe)}`);
  }
  return condicao;
}

/**
 * Confere a assinatura BLS de uma rodada contra a chave publica da rede.
 *
 * Este e o passo que dispensa confiar no servidor: mesmo que alguem sirva uma
 * rodada falsificada, a assinatura nao fecha com a chave publica da quicknet.
 */
function assinaturaValida(rodada, assinaturaHex) {
  const numero = new Uint8Array(8);
  new DataView(numero.buffer).setBigUint64(0, BigInt(rodada), false);
  return crypto.subtle.digest("SHA-256", numero).then((digest) => {
    const mensagem = bls12_381.shortSignatures.hash(new Uint8Array(digest), DST);
    return bls12_381.shortSignatures.verify(
      hexParaBytes(assinaturaHex),
      mensagem,
      hexParaBytes(CADEIA.chavePublica),
    );
  });
}

async function baixarRodada(rodada) {
  const erros = [];
  for (const base of ESPELHOS) {
    try {
      const r = await fetch(`${base}/v2/beacons/quicknet/rounds/${rodada}`, {
        cache: "no-store",
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      if (j.round !== rodada) throw new Error(`devolveu a rodada ${j.round}`);
      return { assinatura: String(j.signature).toLowerCase(), origem: base };
    } catch (e) {
      erros.push(`${base}: ${e.message}`);
    }
  }
  throw new Error(`nenhum espelho respondeu (${erros.join("; ")})`);
}

async function principal() {
  const caminho = resolve(process.cwd(), process.argv[2] ?? "sorteio.json");

  let prova;
  try {
    prova = JSON.parse(await readFile(caminho, "utf8"));
  } catch (e) {
    console.error(c.erro(`Nao consegui ler a prova em ${caminho}`));
    console.error(c.fraco(String(e.message)));
    console.error("\nUso: npm run verificar -- caminho/para/sorteio.json");
    process.exitCode = 2;
    return;
  }

  const linhas = JSON.parse(await readFile(resolve(RAIZ, "lib/participantes.json"), "utf8"));
  const ids = linhas.map(idCanonico);

  console.log(c.forte("\nVerificacao do sorteio"));
  console.log(c.fraco(`prova        ${caminho}`));
  console.log(c.fraco(`participantes ${resolve(RAIZ, "lib/participantes.json")}`));
  console.log();

  // ---- 1. a lista e a mesma que estava na tela ----
  console.log(c.forte("Lista de participantes"));
  checar(prova.versao === VERSAO, `formato da prova e ${VERSAO}`, `veio "${prova.versao}"`);

  const hashCalculado = await hashDaLista(linhas);
  checar(
    hashCalculado === prova.listaHash,
    "o hash da lista bate com o publicado",
    `calculado ${hashCalculado}\n        na prova  ${prova.listaHash}`,
  );
  checar(
    ids.length === prova.totalDeParticipantes,
    `a lista tem ${prova.totalDeParticipantes} participantes`,
    `o arquivo tem ${ids.length}`,
  );
  console.log();

  // ---- 2. cada sorteio, em ordem ----
  const sorteios = prova.sorteios ?? [];
  if (sorteios.length === 0) {
    console.log(c.erro("A prova nao contem nenhum sorteio."));
    process.exitCode = 2;
    return;
  }

  let elo = GENESIS;
  const jaGanharam = new Set();

  for (const s of sorteios) {
    console.log(c.forte(`Sorteio ${s.n}`));

    // a corrente
    checar(
      s.anterior === elo,
      "aponta pro sorteio anterior (corrente intacta)",
      `esperado ${elo}\n        na prova ${s.anterior}`,
    );

    // so pode ter saido do pote quem ja ganhou antes
    const excluidos = s.excluidos ?? [];
    const intrusos = excluidos.filter((id) => !jaGanharam.has(id));
    checar(
      intrusos.length === 0,
      "so tirou do pote quem ja tinha ganhado",
      intrusos.length ? `tirados sem ter ganhado: ${intrusos.join(", ")}` : undefined,
    );

    // a rodada veio mesmo da rede do drand
    let assinatura = s.assinatura;
    try {
      const daRede = await baixarRodada(s.rodada);
      checar(
        daRede.assinatura === s.assinatura,
        `a rodada #${s.rodada} bate com a publicada pelo drand`,
        `da rede  ${daRede.assinatura}\n        na prova ${s.assinatura}`,
      );
      assinatura = daRede.assinatura;
    } catch (e) {
      // Sem rede ainda da pra verificar a assinatura que esta na prova.
      console.log(`  ${c.fraco("--")}  nao consegui consultar o drand (${e.message})`);
      console.log(`      ${c.fraco("seguindo com a assinatura registrada na prova")}`);
    }

    checar(
      await assinaturaValida(s.rodada, assinatura),
      `a assinatura BLS da rodada #${s.rodada} e autentica`,
      "a assinatura nao fecha com a chave publica da quicknet",
    );

    // a aleatoriedade sai da assinatura
    const aleatoriedade = await sha256(hexParaBytes(assinatura));
    checar(
      aleatoriedade === s.aleatoriedade,
      "a aleatoriedade e o SHA-256 da assinatura",
      `calculada ${aleatoriedade}\n        na prova  ${s.aleatoriedade}`,
    );

    // e o ganhador sai da aleatoriedade
    const semente = await derivarSemente({
      listaHash: prova.listaHash,
      n: s.n,
      rodada: s.rodada,
      aleatoriedade,
      anterior: s.anterior,
      excluidos,
    });
    checar(semente === s.semente, "a semente confere");

    const pote = montarPote(ids, excluidos);
    checar(
      pote.length === s.tamanhoDoPote,
      `o pote tinha ${s.tamanhoDoPote} numeros`,
      `recalculado: ${pote.length}`,
    );

    const indice = await indiceDaSemente(semente, pote.length);
    checar(indice === s.indice, `o indice sorteado e ${s.indice}`, `recalculado: ${indice}`);
    checar(
      pote[indice] === s.ganhador,
      `o ganhador e ${s.ganhador}`,
      `recalculado: ${pote[indice]}`,
    );

    const hash = await hashDaEntrada({ semente, indice, ganhador: pote[indice] });
    checar(hash === s.hash, "o hash da entrada confere");

    elo = s.hash;
    jaGanharam.add(s.ganhador);
    console.log();
  }

  // ---- resultado ----
  if (falhas === 0) {
    console.log(c.ok(c.forte(`Tudo confere. ${sorteios.length} sorteio(s) verificado(s).`)));
    console.log(
      c.fraco(
        "Cada ganhador foi recalculado a partir da aleatoriedade publica do drand,\n" +
          "cuja assinatura foi conferida contra a chave da rede. O resultado nao\n" +
          "poderia ter sido escolhido por quem operou o sorteio.",
      ),
    );
    process.exitCode = 0;
    return;
  }

  console.log(c.erro(c.forte(`${falhas} verificacao(oes) falharam.`)));
  console.log(c.fraco("A prova nao sustenta o resultado anunciado."));
  process.exitCode = 1;
}

principal().catch((e) => {
  console.error(c.erro(`\nErro inesperado: ${e.message}`));
  process.exitCode = 2;
});
