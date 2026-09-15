/**
 * Cliente do drand — a fonte de aleatoriedade publica do sorteio.
 *
 * drand (League of Entropy) e uma rede de nos independentes — Cloudflare,
 * Protocol Labs, universidades e outros — que produz um numero aleatorio a cada
 * 3 segundos. Cada rodada e assinada coletivamente: ninguem sozinho consegue
 * prever a proxima nem forjar uma passada.
 *
 * E por isso que ela e usada aqui em vez do aleatorio local do navegador: o
 * sorteio passa a depender de um numero que o organizador nao controla, nao
 * conhece de antemao e nao pode fabricar — e que qualquer pessoa pode conferir
 * depois, direto na fonte.
 */

/** Rede quicknet: uma rodada a cada 3s, assinatura BLS12-381 em G1. */
export const CADEIA = {
  hash: "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971",
  chavePublica:
    "83cf0f2896adee7eb8b5f01fcad3912212c437e0073e911fb90022d3e760183c8c4b450b6a0a6c3ac6a5776a2d1064510d1fec758c921cc22b0e17e63aaf4bcb5ed66304de9cf809bd274ca73bab4af5a6e9c76a4bc09e76eae8991ef5ece45a",
  esquema: "bls-unchained-g1-rfc9380",
  genesis: 1692803367,
  periodo: 3,
};

/**
 * Servidores independentes da mesma rede. Consultar mais de um protege contra
 * um endpoint mentiroso: se dois operadores diferentes devolvem a mesma
 * assinatura, ela e autentica (e o verificador ainda confere a assinatura
 * criptograficamente, sem confiar em nenhum deles).
 */
export const ESPELHOS = [
  "https://api.drand.sh",
  "https://api2.drand.sh",
  "https://api3.drand.sh",
];

/** Numero da rodada que estara publicada em determinado instante. */
export function rodadaEm(msEpoch) {
  const s = Math.floor(msEpoch / 1000);
  return Math.floor((s - CADEIA.genesis) / CADEIA.periodo) + 1;
}

/** Instante (ms) em que uma rodada e publicada. */
export function instanteDaRodada(rodada) {
  return (CADEIA.genesis + (rodada - 1) * CADEIA.periodo) * 1000;
}

export function rodadaAtual() {
  return rodadaEm(Date.now());
}

async function buscarEm(base, rodada, sinal) {
  const alvo = rodada === "latest" ? "latest" : String(rodada);
  const r = await fetch(`${base}/v2/beacons/quicknet/rounds/${alvo}`, {
    signal: sinal,
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`${base} respondeu ${r.status}`);

  const json = await r.json();
  if (typeof json.round !== "number" || typeof json.signature !== "string") {
    throw new Error(`${base} devolveu resposta fora do formato`);
  }
  return { rodada: json.round, assinatura: json.signature.toLowerCase(), origem: base };
}

/**
 * Busca uma rodada, aceitando a primeira resposta valida entre os espelhos.
 * `rodada` pode ser um numero ou "latest".
 */
export async function buscarRodada(rodada, { timeoutMs = 8000, espelhos = ESPELHOS } = {}) {
  const ctrl = new AbortController();
  const relogio = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await Promise.any(espelhos.map((base) => buscarEm(base, rodada, ctrl.signal)));
  } catch (e) {
    const causas = e instanceof AggregateError ? e.errors.map((x) => x.message).join("; ") : String(e);
    throw new Error(`Nenhum espelho do drand respondeu (${causas})`);
  } finally {
    clearTimeout(relogio);
  }
}

/**
 * Espera uma rodada futura ser publicada.
 *
 * Fica tentando ate a rodada existir: a rede publica a cada 3s, mas a
 * propagacao ate os espelhos leva um instante.
 */
export async function esperarRodada(rodada, { timeoutMs = 25000, aoTentar } = {}) {
  const limite = Date.now() + timeoutMs;
  let ultimoErro;

  while (Date.now() < limite) {
    const faltam = instanteDaRodada(rodada) - Date.now();
    if (faltam > 0) {
      aoTentar?.({ faltamMs: faltam });
      await new Promise((r) => setTimeout(r, Math.min(faltam + 250, 1500)));
      continue;
    }

    try {
      return await buscarRodada(rodada, { timeoutMs: 5000 });
    } catch (e) {
      ultimoErro = e;
      aoTentar?.({ faltamMs: 0 });
      await new Promise((r) => setTimeout(r, 700));
    }
  }

  throw new Error(
    `A rodada ${rodada} do drand nao chegou a tempo${ultimoErro ? `: ${ultimoErro.message}` : ""}`,
  );
}

/**
 * Aleatoriedade da rodada.
 *
 * Na quicknet (esquema "unchained") a aleatoriedade e o SHA-256 da assinatura.
 * Calculamos localmente em vez de aceitar o campo pronto do servidor: assim o
 * numero vem da assinatura — que e verificavel — e nao da palavra do endpoint.
 */
export async function aleatoriedadeDe(assinatura, sha256) {
  return sha256(hexParaBytesLocal(assinatura));
}

function hexParaBytesLocal(s) {
  const limpo = s.trim().toLowerCase();
  if (!/^[0-9a-f]+$/.test(limpo) || limpo.length % 2 !== 0) {
    throw new Error(`Assinatura em hexadecimal invalido: "${s}"`);
  }
  const out = new Uint8Array(limpo.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(limpo.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
