"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import {
  CASAS,
  IDS,
  LINHAS,
  PARTICIPANTES,
  REPOUSO,
  porId,
  type Participante,
} from "@/lib/participantes";
import {
  GENESIS,
  hashDaLista,
  hexParaBytes,
  sha256,
  sortearVerificavel,
} from "@/lib/prova.mjs";
import { CADEIA, esperarRodada, rodadaAtual } from "@/lib/drand.mjs";
import * as som from "@/lib/som";
import { Alavanca } from "./Alavanca";
import { Confete, type ConfeteHandle } from "./Confete";
import { Prova, type Registro } from "./Prova";
import { Rolo, type RoloHandle } from "./Rolo";

/** Quantas rodadas a frente o sorteio e marcado. 2 x 3s = ~6s de antecedencia. */
const ANTECEDENCIA = 2;
/** Tempo de frenagem do primeiro rolo, em segundos. */
const BASE = 0.9;
/** Quanto cada rolo seguinte demora a mais que o anterior. */
const PASSO = 0.18;
/** Folga extra no ultimo rolo — e onde mora o suspense. */
const SUSPENSE = 0.5;

type Fase = "parada" | "girando" | "premiada";

export function Maquina() {
  const [fase, setFase] = useState<Fase>("parada");
  const [ganhador, setGanhador] = useState<Participante | null>(null);
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [excluirSorteados, setExcluirSorteados] = useState(true);
  const [mudo, setMudo] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [listaHash, setListaHash] = useState<string | null>(null);
  const [rodadaMarcada, setRodadaMarcada] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const rolos = useRef<(RoloHandle | null)[]>([]);
  const confeteRef = useRef<ConfeteHandle>(null);
  const claraoRef = useRef<HTMLDivElement>(null);
  const pararZunido = useRef<(() => void) | null>(null);

  const excluidos = useMemo(
    () => (excluirSorteados ? registros.map((r) => r.ganhador) : []),
    [excluirSorteados, registros],
  );

  const pote = useMemo(() => {
    const fora = new Set(excluidos);
    return PARTICIPANTES.filter((p) => !fora.has(p.id));
  }, [excluidos]);

  const vazio = pote.length === 0;

  const repousar = useCallback(() => {
    REPOUSO.forEach((c, i) => rolos.current[i]?.fixar(c));
  }, []);

  // O hash da lista e calculado uma vez e fica visivel na tela o tempo todo:
  // e ele que prova, depois, que a lista nao mudou durante a live.
  useEffect(() => {
    hashDaLista(LINHAS as string[])
      .then(setListaHash)
      .catch((e: unknown) => setErro(String(e)));
  }, []);

  useEffect(() => {
    repousar();
  }, [repousar]);

  useEffect(() => {
    som.alternarMudo(mudo);
  }, [mudo]);

  useEffect(() => {
    const vivos = rolos.current;
    return () => {
      pararZunido.current?.();
      vivos.forEach((r) => r?.encerrar());
    };
  }, []);

  const puxar = useCallback(async () => {
    if (fase === "girando" || vazio || !listaHash) return;

    // 1. Compromisso: escolhe uma rodada do drand que AINDA NAO EXISTE e mostra
    //    o numero dela na tela antes de girar. Como ninguem — nem quem esta
    //    operando — consegue prever a aleatoriedade dessa rodada, o resultado
    //    esta fora do alcance de qualquer um neste instante.
    const alvo = rodadaAtual() + ANTECEDENCIA;
    const n = registros.length + 1;
    const anterior = registros[0]?.hash ?? GENESIS;
    const excluidosAgora = [...excluidos];

    setFase("girando");
    setGanhador(null);
    setCopiado(false);
    setConfirmando(false);
    setErro(null);
    setRodadaMarcada(alvo);

    rolos.current.forEach((r) => r?.girarSolto());
    pararZunido.current?.();
    pararZunido.current = som.girar();

    try {
      // 2. Espera a rodada ser publicada pela rede do drand.
      const { rodada, assinatura, origem } = await esperarRodada(alvo, {
        timeoutMs: 25000,
      });

      // 3. A aleatoriedade e derivada da assinatura, nao lida do servidor.
      const aleatoriedade = await sha256(hexParaBytes(assinatura));

      const resultado = await sortearVerificavel({
        ids: IDS as string[],
        listaHash,
        n,
        rodada,
        aleatoriedade,
        anterior,
        excluidos: excluidosAgora,
      });

      const premiado = porId(resultado.ganhador);
      if (!premiado) throw new Error(`Ganhador ${resultado.ganhador} nao esta na lista`);

      const registro: Registro = {
        n,
        rodada,
        assinatura,
        aleatoriedade,
        listaHash,
        anterior,
        excluidos: excluidosAgora,
        semente: resultado.semente,
        indice: resultado.indice,
        tamanhoDoPote: resultado.tamanhoDoPote,
        ganhador: resultado.ganhador,
        hash: resultado.hash,
        momento: new Date().toISOString(),
        origem,
      };

      // 4. Trava os rolos no numero que a matematica ja decidiu.
      premiado.casas.forEach((simbolo, i) => {
        const ultimo = i === CASAS - 1;
        const duracao = BASE + i * PASSO + (ultimo ? SUSPENSE : 0);

        rolos.current[i]?.travarEm(simbolo, duracao, () => {
          som.travar(i);
          if (!ultimo) return;

          pararZunido.current?.();
          pararZunido.current = null;

          setFase("premiada");
          setGanhador(premiado);
          setRegistros((rs) => [registro, ...rs]);

          som.premio();
          confeteRef.current?.disparar();
          gsap.fromTo(
            claraoRef.current,
            { opacity: 0.5 },
            { opacity: 0, duration: 0.7, ease: "power2.out" },
          );
        });
      });
    } catch (e) {
      // Sem beacon nao ha sorteio. Melhor falhar na cara do que cair calado
      // num aleatorio local que ninguem consegue conferir depois.
      pararZunido.current?.();
      pararZunido.current = null;
      rolos.current.forEach((r) => r?.encerrar());
      repousar();
      setFase("parada");
      setRodadaMarcada(null);
      setErro(e instanceof Error ? e.message : String(e));
    }
  }, [fase, vazio, listaHash, registros, excluidos, repousar]);

  // Barra de espaco puxa a alavanca, desde que o foco nao esteja num controle.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      const alvo = e.target as HTMLElement | null;
      if (alvo && alvo.closest("button, a, input, select, textarea")) return;
      e.preventDefault();
      void puxar();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [puxar]);

  const copiar = useCallback(async () => {
    if (!ganhador) return;
    try {
      await navigator.clipboard.writeText(ganhador.display);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  }, [ganhador]);

  const telaCheia = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => {});
  }, []);

  const reiniciar = useCallback(() => {
    if (fase === "girando") return;
    setRegistros([]);
    setGanhador(null);
    setFase("parada");
    setConfirmando(false);
    setRodadaMarcada(null);
    setErro(null);
    repousar();
  }, [fase, repousar]);

  const atual = registros[0];
  const emRepouso = fase === "parada" && !ganhador;

  return (
    <div className="palco flex min-h-dvh flex-col">
      <div className="grao" />
      <div ref={claraoRef} className="clarao" />
      <Confete ref={confeteRef} />

      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-hairline px-4 py-3 sm:px-8">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
          </span>
          <span className="rotulo text-ink-2">ao vivo</span>
        </div>

        <h1 className="font-display text-xs font-semibold tracking-[0.28em] text-ink uppercase sm:text-sm">
          Sorteio especial
        </h1>

        <p className="rotulo">
          <span className="text-ink tabular-nums">{pote.length}</span> no pote
        </p>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-8 px-4 py-8 sm:px-6 lg:gap-10">
        <div className="flex flex-col items-center gap-4 lg:flex-row lg:items-stretch lg:gap-2">
          <div
            className={[
              "gabinete w-full max-w-[64rem]",
              fase === "girando" ? "girando" : "",
              fase === "premiada" ? "premiado" : "",
              emRepouso ? "repouso" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <Lampadas />

            <p className="py-1.5 text-center font-display text-[0.65rem] font-semibold tracking-[0.45em] text-lamp uppercase">
              {fase === "premiada" ? "temos ganhador" : "live da bianca"}
            </p>

            <div className="painel px-3 py-4 sm:px-6 sm:py-7">
              <div className="relative flex items-center justify-center gap-[3px]">
                <span className="mr-[clamp(.3rem,1vw,.7rem)] font-mono text-[length:calc(var(--casa)*0.3)] text-ink-3">
                  +55
                </span>

                {Array.from({ length: CASAS }, (_, i) => (
                  <Fragment key={i}>
                    {i === 2 && <span className="w-[clamp(.3rem,1vw,.7rem)]" />}
                    {i === 7 && (
                      <span className="px-[clamp(.15rem,.5vw,.4rem)] font-mono text-[length:calc(var(--casa)*0.3)] text-ink-3">
                        &ndash;
                      </span>
                    )}
                    <Rolo
                      ref={(el) => {
                        rolos.current[i] = el;
                      }}
                      aceitaVazio={i === 2}
                    />
                  </Fragment>
                ))}

                <span className="linha-premio" />
              </div>
            </div>

            <Lampadas />
          </div>

          <div className="flex items-center justify-center lg:items-end">
            <Alavanca
              aoPuxar={() => void puxar()}
              desabilitada={fase === "girando" || vazio || !listaHash}
            />
          </div>
        </div>

        <div className="flex min-h-[7.5rem] w-full max-w-[64rem] flex-col items-center justify-center gap-3 text-center">
          {erro ? (
            <>
              <p className="font-display text-xl font-semibold text-accent uppercase">
                Sorteio nao concluido
              </p>
              <p className="max-w-[34rem] text-sm text-ink-2">{erro}</p>
              <p className="rotulo">
                nenhum ganhador foi escolhido — puxe a alavanca de novo
              </p>
            </>
          ) : vazio && fase !== "premiada" ? (
            <>
              <p className="font-display text-xl font-semibold text-ink uppercase">
                Acabou o pote
              </p>
              <p className="text-sm text-ink-2">
                Todo mundo ja foi sorteado. Zere o sorteio pra rodar tudo de novo.
              </p>
            </>
          ) : fase === "girando" ? (
            <>
              <p className="font-display text-xl tracking-[0.3em] text-ink-2 uppercase">
                Sorteando
              </p>
              <p className="rotulo">
                aguardando a rodada{" "}
                <span className="text-accent tabular-nums">#{rodadaMarcada}</span> do
                drand
              </p>
            </>
          ) : ganhador && atual ? (
            <>
              <p className="rotulo text-accent">Ganhador</p>
              <p className="font-display text-[clamp(1.6rem,5vw,3.2rem)] leading-none font-bold tabular-nums text-ink">
                {ganhador.display}
              </p>

              <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={copiar}
                  className="botao rounded-[4px] border border-hairline-strong px-4 py-2 text-xs text-ink hover:border-accent hover:text-accent"
                >
                  {copiado ? "copiado" : "copiar numero"}
                </button>
                <a
                  href={`https://wa.me/${ganhador.whatsapp}`}
                  target="_blank"
                  rel="noreferrer"
                  className="botao rounded-[4px] bg-accent px-4 py-2 text-xs font-semibold text-accent-ink hover:brightness-110"
                >
                  chamar no whatsapp
                </a>
              </div>

              <p className="rotulo mt-1">
                sorteio {atual.n} &middot; rodada #{atual.rodada} &middot; indice{" "}
                {atual.indice} de {atual.tamanhoDoPote}
              </p>
            </>
          ) : (
            <>
              <p className="font-display text-xl font-semibold text-ink uppercase">
                Puxe a alavanca
              </p>
              <p className="text-sm text-ink-2">
                {pote.length} numeros no pote. Arraste a bola pra baixo ou aperte
                espaco.
              </p>
            </>
          )}
        </div>

        <Prova
          listaHash={listaHash}
          total={PARTICIPANTES.length}
          rodadaMarcada={fase === "girando" ? rodadaMarcada : null}
          registros={registros}
          cadeia={CADEIA.hash}
        />
      </main>

      <footer className="border-t border-hairline">
        <Faixa pote={pote} />

        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3 sm:px-8">
          <div className="flex flex-wrap items-center gap-2">
            <Controle ativo={!mudo} onClick={() => setMudo((m) => !m)}>
              {mudo ? "som off" : "som on"}
            </Controle>
            <Controle
              ativo={excluirSorteados}
              onClick={() => setExcluirSorteados((v) => !v)}
            >
              tirar sorteados do pote
            </Controle>
            <Controle onClick={telaCheia}>tela cheia</Controle>

            {registros.length > 0 && (
              <button
                type="button"
                onClick={() => (confirmando ? reiniciar() : setConfirmando(true))}
                onBlur={() => setConfirmando(false)}
                disabled={fase === "girando"}
                className={`botao rounded-[3px] border px-3 py-1.5 text-[0.65rem] tracking-[0.12em] disabled:opacity-40 ${
                  confirmando
                    ? "border-accent bg-accent font-semibold text-accent-ink"
                    : "border-accent/50 text-accent hover:bg-accent-soft"
                }`}
              >
                {confirmando
                  ? "confirmar? zera tudo"
                  : `zerar sorteio (${registros.length})`}
              </button>
            )}
          </div>

          {registros.length > 0 && (
            <div className="flex min-w-0 items-center gap-2 overflow-x-auto">
              <span className="rotulo shrink-0">ja sairam</span>
              {registros.map((r) => (
                <span
                  key={r.hash}
                  className="shrink-0 rounded-[3px] border border-hairline px-2 py-1 font-mono text-[0.68rem] text-ink-2"
                >
                  {porId(r.ganhador)?.display ?? r.ganhador}
                </span>
              ))}
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}

function Lampadas({ quantidade = 24 }: { quantidade?: number }) {
  return (
    <div className="flex items-center justify-between px-2 py-1.5" aria-hidden="true">
      {Array.from({ length: quantidade }, (_, i) => (
        <span
          key={i}
          className="lampada"
          style={{ "--i": i } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

function Controle({
  children,
  onClick,
  ativo,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  ativo?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={ativo}
      className={`botao rounded-[3px] border px-3 py-1.5 text-[0.65rem] tracking-[0.12em] disabled:opacity-40 ${
        ativo
          ? "border-accent/60 bg-accent-soft text-accent"
          : "border-hairline text-ink-3 hover:border-hairline-strong hover:text-ink-2"
      }`}
    >
      {children}
    </button>
  );
}

/** Esteira com os numeros que ainda estao concorrendo, mascarados. */
function Faixa({ pote }: { pote: readonly Participante[] }) {
  if (pote.length === 0) return null;
  return (
    <div className="faixa border-b border-hairline py-2">
      <div className="faixa-conteudo">
        {[0, 1].map((volta) => (
          <div key={volta} className="flex shrink-0 gap-6 pr-6" aria-hidden={volta === 1}>
            {pote.map((p) => (
              <span key={p.id} className="font-mono text-[0.68rem] text-ink-3">
                {p.mascarado}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
