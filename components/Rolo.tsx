"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import gsap from "gsap";
import { VAZIO } from "@/lib/participantes";

const DIGITOS = "0123456789".split("");

/** Quantas voltas a fita tem. Mais voltas = mais corrida antes de travar. */
const VOLTAS = 6;

export type RoloHandle = {
  /** Comeca a girar solto, sem destino. Usado enquanto o beacon nao chega. */
  girarSolto: () => void;
  /** Interrompe o giro solto e trava no simbolo. `aoTravar` dispara no baque. */
  travarEm: (alvo: string, duracao: number, aoTravar: () => void) => void;
  /** Coloca o simbolo na janela sem animacao. */
  fixar: (alvo: string) => void;
  /** Mata qualquer animacao em curso. */
  encerrar: () => void;
};

type Props = {
  /** So o primeiro rolo do prefixo aceita casa vazia (numeros de 8 digitos). */
  aceitaVazio?: boolean;
  inicial?: string;
};

export const Rolo = forwardRef<RoloHandle, Props>(function Rolo(
  { aceitaVazio = false, inicial = "0" },
  ref,
) {
  const simbolos = useMemo(
    () => (aceitaVazio ? [...DIGITOS, VAZIO] : DIGITOS),
    [aceitaVazio],
  );

  const janelaRef = useRef<HTMLDivElement>(null);
  const fitaRef = useRef<HTMLDivElement>(null);
  const atual = useRef(inicial);
  const animacao = useRef<gsap.core.Timeline | null>(null);

  // A altura da casa e medida do DOM: ela vem de um clamp() em vw e muda
  // junto com a janela, entao nao da pra assumir um valor fixo.
  const alturaCasa = useCallback(
    () => janelaRef.current?.getBoundingClientRect().height ?? 0,
    [],
  );

  const posicionar = useCallback(
    (simbolo: string, volta = 0) => {
      const i = simbolos.indexOf(simbolo);
      const indice = volta * simbolos.length + (i < 0 ? 0 : i);
      gsap.set(fitaRef.current, { y: -(indice * alturaCasa()) });
    },
    [simbolos, alturaCasa],
  );

  useEffect(() => {
    posicionar(atual.current);

    // Redimensionou a janela? A altura da casa mudou e a fita sai do lugar.
    const janela = janelaRef.current;
    if (!janela) return;
    const obs = new ResizeObserver(() => {
      if (animacao.current?.isActive()) return;
      posicionar(atual.current);
    });
    obs.observe(janela);
    return () => obs.disconnect();
  }, [posicionar]);

  useImperativeHandle(ref, () => ({
    fixar(alvo) {
      animacao.current?.kill();
      animacao.current = null;
      atual.current = alvo;
      janelaRef.current?.classList.remove("girando-rolo", "travando");
      posicionar(alvo);
    },

    girarSolto() {
      const fita = fitaRef.current;
      const janela = janelaRef.current;
      if (!fita || !janela) return;

      animacao.current?.kill();
      posicionar(atual.current);

      janela.classList.add("girando-rolo");
      janela.classList.remove("travando");

      // Laco sem fim: a fita repete os mesmos simbolos a cada volta, entao
      // voltar ao topo no fim do ciclo nao aparece.
      const h = alturaCasa();
      const voltaCompleta = (VOLTAS - 1) * simbolos.length * h;
      const tl = gsap.timeline({ repeat: -1 });
      tl.fromTo(
        fita,
        { y: 0 },
        { y: -voltaCompleta, duration: 1.15, ease: "none" },
      );
      animacao.current = tl;
    },

    travarEm(alvo, duracao, aoTravar) {
      const fita = fitaRef.current;
      const janela = janelaRef.current;
      if (!fita || !janela) return;

      animacao.current?.kill();

      const h = alturaCasa();
      const i = simbolos.indexOf(alvo);
      const destino = (VOLTAS - 1) * simbolos.length + (i < 0 ? 0 : i);
      const yFinal = -(destino * h);

      // Recua um numero inteiro de voltas: a face visivel nao muda (os simbolos
      // se repetem), mas garante pista suficiente pra desacelerar bonito.
      const yAtual = (gsap.getProperty(fita, "y") as number) ?? 0;
      const ciclo = simbolos.length * h;
      gsap.set(fita, { y: yAtual + Math.floor(-yAtual / ciclo) * ciclo });

      atual.current = alvo;

      janela.classList.add("girando-rolo");
      janela.classList.remove("travando");

      const tl = gsap.timeline();
      // Passa um tico do destino e volta: e esse exagero que da o "tec" mecanico.
      tl.to(fita, {
        y: yFinal - h * 0.16,
        duration: duracao,
        ease: "power4.out",
      });
      tl.to(fita, {
        y: yFinal,
        duration: 0.42,
        ease: "elastic.out(1, 0.52)",
        onStart: () => {
          janela.classList.remove("girando-rolo");
          janela.classList.add("travando");
          aoTravar();
        },
      });

      animacao.current = tl;
    },

    encerrar() {
      animacao.current?.kill();
      animacao.current = null;
      janelaRef.current?.classList.remove("girando-rolo", "travando");
    },
  }));

  return (
    <div ref={janelaRef} className="janela" aria-hidden="true">
      <div ref={fitaRef} className="fita">
        {Array.from({ length: VOLTAS }, (_, volta) =>
          simbolos.map((s) => (
            <div
              key={`${volta}-${s}`}
              className={s === VAZIO ? "casa casa-vazia" : "casa"}
            >
              {s}
            </div>
          )),
        )}
      </div>
    </div>
  );
});
