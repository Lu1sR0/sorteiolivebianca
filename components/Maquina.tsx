"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import {
  CASAS,
  PARTICIPANTES,
  REPOUSO,
  type Participante,
} from "@/lib/participantes";
import { idDoSorteio, sortear } from "@/lib/sorteio";
import * as som from "@/lib/som";
import { Alavanca } from "./Alavanca";
import { Confete, type ConfeteHandle } from "./Confete";
import { Rolo, type RoloHandle } from "./Rolo";

/** Tempo de giro do primeiro rolo, em segundos. */
const BASE = 2.1;
/** Quanto cada rolo seguinte demora a mais que o anterior. */
const PASSO = 0.2;
/** Folga extra no ultimo rolo — e onde mora o suspense. */
const SUSPENSE = 0.55;

type Fase = "parada" | "girando" | "premiada";

type Registro = {
  codigo: string;
  participante: Participante;
  hora: string;
};

function agora(): string {
  return new Date().toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function Maquina() {
  const [fase, setFase] = useState<Fase>("parada");
  const [ganhador, setGanhador] = useState<Participante | null>(null);
  const [historico, setHistorico] = useState<Registro[]>([]);
  const [excluirSorteados, setExcluirSorteados] = useState(true);
  const [mudo, setMudo] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  const rolos = useRef<(RoloHandle | null)[]>([]);
  const confeteRef = useRef<ConfeteHandle>(null);
  const claraoRef = useRef<HTMLDivElement>(null);
  const pararZunido = useRef<(() => void) | null>(null);

  const pote = useMemo(() => {
    if (!excluirSorteados) return PARTICIPANTES;
    const fora = new Set(historico.map((h) => h.participante.id));
    return PARTICIPANTES.filter((p) => !fora.has(p.id));
  }, [excluirSorteados, historico]);

  const vazio = pote.length === 0;

  const repousar = useCallback(() => {
    REPOUSO.forEach((c, i) => rolos.current[i]?.fixar(c));
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

  const puxar = useCallback(() => {
    if (fase === "girando" || vazio) return;

    const escolhido = sortear(pote);
    const codigo = idDoSorteio();

    setFase("girando");
    setGanhador(null);
    setCopiado(false);
    setConfirmando(false);

    pararZunido.current?.();
    pararZunido.current = som.girar();

    escolhido.casas.forEach((simbolo, i) => {
      const ultimo = i === CASAS - 1;
      const duracao = BASE + i * PASSO + (ultimo ? SUSPENSE : 0);

      rolos.current[i]?.girar(simbolo, duracao, () => {
        som.travar(i);
        if (!ultimo) return;

        pararZunido.current?.();
        pararZunido.current = null;

        setFase("premiada");
        setGanhador(escolhido);
        setHistorico((h) => [
          { codigo, participante: escolhido, hora: agora() },
          ...h,
        ]);

        som.premio();
        confeteRef.current?.disparar();
        gsap.fromTo(
          claraoRef.current,
          { opacity: 0.5 },
          { opacity: 0, duration: 0.7, ease: "power2.out" },
        );
      });
    });
  }, [fase, pote, vazio]);

  // Barra de espaco puxa a alavanca, desde que o foco nao esteja num controle.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      const alvo = e.target as HTMLElement | null;
      if (alvo && alvo.closest("button, a, input, select, textarea")) return;
      e.preventDefault();
      puxar();
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
    setHistorico([]);
    setGanhador(null);
    setFase("parada");
    setConfirmando(false);
    repousar();
  }, [fase, repousar]);

  const atual = historico[0];
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
            <Alavanca aoPuxar={puxar} desabilitada={fase === "girando" || vazio} />
          </div>
        </div>

        <div className="flex min-h-[7.5rem] w-full max-w-[64rem] flex-col items-center justify-center gap-3 text-center">
          {vazio && fase !== "premiada" ? (
            <>
              <p className="font-display text-xl font-semibold text-ink uppercase">
                Acabou o pote
              </p>
              <p className="text-sm text-ink-2">
                Todo mundo ja foi sorteado. Reinicie pra rodar tudo de novo.
              </p>
            </>
          ) : fase === "girando" ? (
            <p className="font-display text-xl tracking-[0.3em] text-ink-2 uppercase">
              Sorteando
            </p>
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
                sorteio #{atual.codigo} &middot; {atual.hora} &middot;{" "}
                {excluirSorteados ? pote.length + 1 : pote.length} concorrendo
              </p>
            </>
          ) : (
            <>
              <p className="font-display text-xl font-semibold text-ink uppercase">
                Puxe a alavanca
              </p>
              <p className="text-sm text-ink-2">
                {PARTICIPANTES.length} numeros no pote. Arraste a bola pra baixo
                ou aperte espaco.
              </p>
            </>
          )}
        </div>
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

            {historico.length > 0 && (
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
                  : `zerar sorteio (${historico.length})`}
              </button>
            )}
          </div>

          {historico.length > 0 && (
            <div className="flex min-w-0 items-center gap-2 overflow-x-auto">
              <span className="rotulo shrink-0">ja sairam</span>
              {historico.map((h, i) => (
                <span
                  key={`${h.codigo}-${i}`}
                  className="shrink-0 rounded-[3px] border border-hairline px-2 py-1 font-mono text-[0.68rem] text-ink-2"
                >
                  {h.participante.display}
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
