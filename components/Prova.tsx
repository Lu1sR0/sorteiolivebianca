"use client";

import { useCallback, useState } from "react";
import { VERSAO } from "@/lib/prova.mjs";
import { CADEIA } from "@/lib/drand.mjs";

export type Registro = {
  /** Numero sequencial do sorteio nesta sessao. */
  n: number;
  /** Rodada do drand usada como fonte de aleatoriedade. */
  rodada: number;
  /** Assinatura BLS daquela rodada, como publicada pela rede. */
  assinatura: string;
  /** SHA-256 da assinatura — a aleatoriedade em si. */
  aleatoriedade: string;
  listaHash: string;
  /** Hash do sorteio anterior: e o que costura a corrente. */
  anterior: string;
  /** Quem estava fora do pote neste sorteio. */
  excluidos: string[];
  semente: string;
  indice: number;
  tamanhoDoPote: number;
  ganhador: string;
  hash: string;
  momento: string;
  /** Qual espelho do drand respondeu primeiro. Informativo apenas. */
  origem: string;
};

type Props = {
  listaHash: string | null;
  total: number;
  /** Rodada ja anunciada mas ainda nao publicada, durante o giro. */
  rodadaMarcada: number | null;
  registros: Registro[];
  cadeia: string;
};

function curto(hex: string, tamanho = 10) {
  if (hex.length <= tamanho * 2 + 1) return hex;
  return `${hex.slice(0, tamanho)}…${hex.slice(-tamanho)}`;
}

export function Prova({ listaHash, total, rodadaMarcada, registros, cadeia }: Props) {
  const [aberto, setAberto] = useState(false);

  const baixar = useCallback(() => {
    const prova = {
      versao: VERSAO,
      geradoEm: new Date().toISOString(),
      cadeiaDrand: cadeia,
      chavePublicaDrand: CADEIA.chavePublica,
      listaHash,
      totalDeParticipantes: total,
      // Em ordem cronologica: e assim que o verificador percorre a corrente.
      sorteios: [...registros].reverse().map(({ ...r }) => r),
    };

    const blob = new Blob([JSON.stringify(prova, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sorteio.json";
    a.click();
    URL.revokeObjectURL(url);
  }, [cadeia, listaHash, registros, total]);

  return (
    <section className="w-full max-w-[64rem] rounded-[6px] border border-hairline bg-surface/40">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-1.5">
          <span className="rotulo flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-ok" />
            sorteio verificavel
          </span>

          <span className="rotulo">
            lista{" "}
            <span className="font-mono text-ink-2 normal-case">
              {listaHash ? curto(listaHash) : "calculando…"}
            </span>{" "}
            <span className="tabular-nums">({total})</span>
          </span>

          {rodadaMarcada !== null && (
            <span className="rotulo text-accent">
              rodada marcada #{rodadaMarcada} &middot; ainda nao existe
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {registros.length > 0 && (
            <button
              type="button"
              onClick={baixar}
              className="botao rounded-[3px] border border-hairline px-3 py-1.5 text-[0.65rem] tracking-[0.12em] text-ink-2 hover:border-hairline-strong hover:text-ink"
            >
              baixar prova
            </button>
          )}
          <button
            type="button"
            onClick={() => setAberto((v) => !v)}
            aria-expanded={aberto}
            className="botao rounded-[3px] border border-hairline px-3 py-1.5 text-[0.65rem] tracking-[0.12em] text-ink-3 hover:border-hairline-strong hover:text-ink-2"
          >
            {aberto ? "fechar" : `detalhes (${registros.length})`}
          </button>
        </div>
      </div>

      {aberto && (
        <div className="border-t border-hairline px-4 py-3">
          {registros.length === 0 ? (
            <p className="text-xs leading-relaxed text-ink-3">
              Cada sorteio e decidido pela rodada do drand anunciada antes do giro.
              A aleatoriedade vem da rede publica, nao deste computador — e o
              calculo inteiro pode ser refeito depois com{" "}
              <code className="font-mono text-ink-2">npm run verificar</code>.
            </p>
          ) : (
            <ol className="flex flex-col gap-3">
              {registros.map((r) => (
                <li
                  key={r.hash}
                  className="grid gap-x-6 gap-y-1 border-l-2 border-accent/40 pl-3 sm:grid-cols-2"
                >
                  <Linha rotulo={`sorteio ${r.n}`} valor={r.ganhador} destaque />
                  <Linha rotulo="rodada drand" valor={`#${r.rodada}`} />
                  <Linha rotulo="aleatoriedade" valor={curto(r.aleatoriedade, 14)} />
                  <Linha rotulo="semente" valor={curto(r.semente, 14)} />
                  <Linha
                    rotulo="indice"
                    valor={`${r.indice} de ${r.tamanhoDoPote}`}
                  />
                  <Linha rotulo="elo anterior" valor={curto(r.anterior, 14)} />
                  <Linha rotulo="hash" valor={curto(r.hash, 14)} />
                  <Linha rotulo="momento" valor={r.momento} />
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}

function Linha({
  rotulo,
  valor,
  destaque,
}: {
  rotulo: string;
  valor: string;
  destaque?: boolean;
}) {
  return (
    <p className="flex items-baseline gap-2 text-[0.7rem]">
      <span className="rotulo shrink-0">{rotulo}</span>
      <span
        className={`truncate font-mono ${destaque ? "text-ink" : "text-ink-2"}`}
      >
        {valor}
      </span>
    </p>
  );
}
