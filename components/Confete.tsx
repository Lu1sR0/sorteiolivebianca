"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

export type ConfeteHandle = { disparar: () => void };

type Particula = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  giro: number;
  velGiro: number;
  largura: number;
  altura: number;
  cor: string;
  vida: number;
};

const CORES = ["#ff3b4a", "#ffc53d", "#eef1f3", "#ff8a94", "#c9202e"];
const POR_JATO = 58;

export const Confete = forwardRef<ConfeteHandle, unknown>(function Confete(_, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particulas = useRef<Particula[]>([]);
  const quadro = useRef(0);

  useImperativeHandle(ref, () => ({
    disparar() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      const l = window.innerWidth;
      const a = window.innerHeight;

      // Tres jatos: um de cada canto de baixo e um do centro, como num palco.
      const jatos = [
        { x: l * 0.06, y: a, angulo: -Math.PI / 2.6, forca: 1.05 },
        { x: l * 0.5, y: a * 0.92, angulo: -Math.PI / 2, forca: 1.2 },
        { x: l * 0.94, y: a, angulo: -Math.PI / 1.62, forca: 1.05 },
      ];

      for (const jato of jatos) {
        for (let i = 0; i < POR_JATO; i++) {
          const abertura = (Math.random() - 0.5) * 0.85;
          const velocidade = (14 + Math.random() * 15) * jato.forca;
          particulas.current.push({
            x: jato.x,
            y: jato.y,
            vx: Math.cos(jato.angulo + abertura) * velocidade,
            vy: Math.sin(jato.angulo + abertura) * velocidade,
            giro: Math.random() * Math.PI * 2,
            velGiro: (Math.random() - 0.5) * 0.4,
            largura: 6 + Math.random() * 7,
            altura: 9 + Math.random() * 10,
            cor: CORES[Math.floor(Math.random() * CORES.length)],
            vida: 1,
          });
        }
      }
    },
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dimensionar = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    dimensionar();
    window.addEventListener("resize", dimensionar);

    const desenhar = () => {
      quadro.current = requestAnimationFrame(desenhar);
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      if (particulas.current.length === 0) return;

      const vivas: Particula[] = [];
      for (const p of particulas.current) {
        p.vx *= 0.985;
        p.vy = p.vy * 0.985 + 0.52; // arrasto do ar + gravidade
        p.x += p.vx;
        p.y += p.vy;
        p.giro += p.velGiro;
        p.vida -= 0.0075;

        if (p.vida <= 0 || p.y > window.innerHeight + 60) continue;
        vivas.push(p);

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.giro);
        // Achata no eixo Y conforme gira: parece papel virando de lado.
        ctx.scale(1, Math.abs(Math.cos(p.giro * 1.6)) * 0.75 + 0.25);
        ctx.globalAlpha = Math.min(1, p.vida * 2.2);
        ctx.fillStyle = p.cor;
        ctx.fillRect(-p.largura / 2, -p.altura / 2, p.largura, p.altura);
        ctx.restore();
      }
      particulas.current = vivas;
    };
    desenhar();

    return () => {
      cancelAnimationFrame(quadro.current);
      window.removeEventListener("resize", dimensionar);
    };
  }, []);

  return <canvas ref={canvasRef} className="confete" aria-hidden="true" />;
});
