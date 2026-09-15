"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import gsap from "gsap";
import * as som from "@/lib/som";

/** Angulo maximo do braco, em graus, com o pivo embaixo. */
const CURSO = 78;
/** A partir daqui, soltar a alavanca vale como puxada valida. */
const GATILHO = 46;
/** Quantos pixels de arrasto correspondem ao curso inteiro. */
const PIXELS = 210;
/** Movimento menor que isso conta como clique, nao como arrasto. */
const TOLERANCIA = 6;
/** De quantos em quantos graus a catraca estala. */
const DENTE = 9;
/** Marcadores do caminho do braco. Usam a mesma rotacao, entao caem no arco. */
const TRILHO = Array.from({ length: 12 }, (_, i) => 8 + i * 6);

/**
 * Resistencia da mola: o comeco do curso e solto e o fim e duro, que e como
 * uma alavanca de verdade reage. Sem isso o arrasto fica "escorregadio".
 */
function resistencia(t: number): number {
  return 1 - Math.pow(1 - t, 1.35);
}

type Props = {
  aoPuxar: () => void;
  desabilitada?: boolean;
};

export function Alavanca({ aoPuxar, desabilitada = false }: Props) {
  const bracoRef = useRef<HTMLButtonElement>(null);
  const arrastando = useRef(false);
  const arrastou = useRef(false);
  const inicioY = useRef(0);
  const anguloRef = useRef(0);
  const ultimoDente = useRef(0);
  const ignorarClique = useRef(false);

  const [puxando, setPuxando] = useState(false);
  const [armado, setArmado] = useState(false);

  const aplicar = useCallback((graus: number) => {
    anguloRef.current = graus;
    gsap.set(bracoRef.current, { rotate: graus });
  }, []);

  const voltar = useCallback(
    (duracao = 1.05) => {
      gsap.to(bracoRef.current, {
        rotate: 0,
        duration: duracao,
        ease: "elastic.out(1, 0.38)",
        onUpdate() {
          anguloRef.current =
            (gsap.getProperty(bracoRef.current, "rotate") as number) ?? 0;
        },
        onComplete: () => {
          anguloRef.current = 0;
          ultimoDente.current = 0;
        },
      });
    },
    [],
  );

  /** Fecha o curso, dispara o sorteio e devolve o braco na mola. */
  const disparar = useCallback(
    (deAngulo: number) => {
      setArmado(false);
      som.alavanca();
      gsap
        .timeline()
        .to(bracoRef.current, {
          rotate: CURSO,
          duration: 0.1 + ((CURSO - deAngulo) / CURSO) * 0.16,
          ease: "power2.in",
          onComplete: aoPuxar,
        })
        .add(() => voltar(1.15), "+=0.14");
    },
    [aoPuxar, voltar],
  );

  const aoDescer = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (desabilitada) return;
      arrastando.current = true;
      arrastou.current = false;
      inicioY.current = e.clientY;
      ultimoDente.current = 0;
      gsap.killTweensOf(bracoRef.current);
      aplicar(0);
      setPuxando(true);
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [desabilitada, aplicar],
  );

  const aoMover = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!arrastando.current) return;

      const delta = e.clientY - inicioY.current;
      if (Math.abs(delta) > TOLERANCIA) arrastou.current = true;

      const t = Math.min(1, Math.max(0, delta / PIXELS));
      const graus = resistencia(t) * CURSO;
      aplicar(graus);

      // Estala um dente por vez, so na descida.
      while (graus - ultimoDente.current >= DENTE) {
        ultimoDente.current += DENTE;
        som.catraca(ultimoDente.current / CURSO);
      }
      if (graus < ultimoDente.current) {
        ultimoDente.current = Math.floor(graus / DENTE) * DENTE;
      }

      setArmado(graus >= GATILHO);
    },
    [aplicar],
  );

  const aoSoltar = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!arrastando.current) return;
      arrastando.current = false;
      setPuxando(false);
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }

      if (!arrastou.current) return; // foi toque: deixa o onClick cuidar

      // Todo arrasto gera um clique logo depois; esse aqui a gente ignora.
      ignorarClique.current = true;
      setTimeout(() => {
        ignorarClique.current = false;
      }, 0);

      if (anguloRef.current >= GATILHO && !desabilitada) {
        disparar(anguloRef.current);
      } else {
        setArmado(false);
        voltar();
      }
    },
    [desabilitada, disparar, voltar],
  );

  /** Toque curto, clique e teclado (Enter/Espaco) caem todos aqui. */
  const aoClicar = useCallback(() => {
    if (ignorarClique.current || desabilitada) return;
    gsap.killTweensOf(bracoRef.current);
    disparar(anguloRef.current);
  }, [desabilitada, disparar]);

  useEffect(() => {
    const braco = bracoRef.current;
    return () => {
      gsap.killTweensOf(braco);
    };
  }, []);

  // Derivado em vez de sincronizado por efeito: desabilitou, desarmou.
  const armadoAgora = armado && !desabilitada;
  const dica = desabilitada
    ? "girando"
    : armadoAgora
      ? "solte pra sortear"
      : "puxe pra baixo";

  return (
    <div
      className={[
        "alavanca-conjunto",
        desabilitada ? "alavanca-off" : "alavanca-pronta",
        puxando ? "alavanca-puxando" : "",
        armadoAgora ? "alavanca-armada" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="alavanca-area">
        <div className="alavanca-trilho" aria-hidden="true">
          {TRILHO.map((g) => (
            <span
              key={g}
              className={g >= GATILHO ? "alavanca-ponto no-gatilho" : "alavanca-ponto"}
              style={{ transform: `rotate(${g}deg)` }}
            />
          ))}
        </div>

        <button
          ref={bracoRef}
          type="button"
          onPointerDown={aoDescer}
          onPointerMove={aoMover}
          onPointerUp={aoSoltar}
          onPointerCancel={aoSoltar}
          onClick={aoClicar}
          disabled={desabilitada}
          aria-label="Puxar a alavanca e sortear"
          className="alavanca-braco"
        >
          <span className="alavanca-bola" />
          <span className="alavanca-colar" />
          <span className="alavanca-haste" />
        </button>

        <span className="alavanca-pivo" />
      </div>

      <div className="alavanca-base">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="alavanca-parafuso" />
        ))}
      </div>

      <p className="rotulo mt-2.5 text-center whitespace-nowrap">{dica}</p>
    </div>
  );
}
