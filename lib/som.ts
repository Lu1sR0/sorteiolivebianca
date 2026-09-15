/**
 * Trilha da maquina, sintetizada na hora com Web Audio — sem baixar mp3 nenhum.
 *
 * O AudioContext so nasce no primeiro gesto do usuario (puxar a alavanca),
 * que e o que os navegadores exigem pra liberar audio.
 */

type Parada = () => void;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let ruido: AudioBuffer | null = null;
let mudo = false;

function acordar(): AudioContext | null {
  if (typeof window === "undefined") return null;

  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = mudo ? 0 : 0.9;
    master.connect(ctx.destination);
  }

  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function bufferDeRuido(c: AudioContext): AudioBuffer {
  if (ruido) return ruido;
  const amostras = c.sampleRate * 2;
  const buf = c.createBuffer(1, amostras, c.sampleRate);
  const dados = buf.getChannelData(0);
  for (let i = 0; i < amostras; i++) dados[i] = Math.random() * 2 - 1;
  ruido = buf;
  return buf;
}

export function estaMudo(): boolean {
  return mudo;
}

export function alternarMudo(valor?: boolean): boolean {
  mudo = valor ?? !mudo;
  if (master && ctx) {
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(mudo ? 0 : 0.9, ctx.currentTime, 0.02);
  }
  return mudo;
}

/** Um dente da catraca — toca a cada tanto de grau enquanto se puxa. */
export function catraca(forca = 1): void {
  const c = acordar();
  if (!c || !master) return;

  const t = c.currentTime;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(900 + forca * 700, t);
  g.gain.setValueAtTime(0.05, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.025);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + 0.03);
}

/** Catraca metalica da alavanca descendo. */
export function alavanca(): void {
  const c = acordar();
  if (!c || !master) return;

  for (let i = 0; i < 9; i++) {
    const t = c.currentTime + i * 0.028;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(1500 + i * 90, t);
    g.gain.setValueAtTime(0.055, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.02);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + 0.03);
  }
}

/** Zunido continuo dos rolos girando. Devolve a funcao que desliga. */
export function girar(): Parada {
  const c = acordar();
  if (!c || !master) return () => {};

  const agora = c.currentTime;

  const fonte = c.createBufferSource();
  fonte.buffer = bufferDeRuido(c);
  fonte.loop = true;

  const banda = c.createBiquadFilter();
  banda.type = "bandpass";
  banda.frequency.value = 1400;
  banda.Q.value = 1.1;

  const motor = c.createOscillator();
  motor.type = "sawtooth";
  motor.frequency.value = 58;

  const graves = c.createBiquadFilter();
  graves.type = "lowpass";
  graves.frequency.value = 160;

  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, agora);
  g.gain.exponentialRampToValueAtTime(0.16, agora + 0.12);

  fonte.connect(banda).connect(g);
  motor.connect(graves).connect(g);
  g.connect(master);

  fonte.start(agora);
  motor.start(agora);

  let parado = false;
  return () => {
    if (parado || !ctx) return;
    parado = true;
    const t = ctx.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(Math.max(g.gain.value, 0.0001), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    fonte.stop(t + 0.22);
    motor.stop(t + 0.22);
  };
}

/** Baque de um rolo travando. Vai ficando mais grave a cada casa. */
export function travar(indice: number): void {
  const c = acordar();
  if (!c || !master) return;

  const t = c.currentTime;
  const base = 190 - indice * 8;

  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(base, t);
  osc.frequency.exponentialRampToValueAtTime(base * 0.45, t + 0.11);
  g.gain.setValueAtTime(0.28, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + 0.18);

  const clique = c.createBufferSource();
  clique.buffer = bufferDeRuido(c);
  const agudo = c.createBiquadFilter();
  agudo.type = "highpass";
  agudo.frequency.value = 2600;
  const gc = c.createGain();
  gc.gain.setValueAtTime(0.16, t);
  gc.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  clique.connect(agudo).connect(gc).connect(master);
  clique.start(t);
  clique.stop(t + 0.06);
}

/** Fanfarra do premio. */
export function premio(): void {
  const c = acordar();
  if (!c || !master) return;

  // Fixa a referencia: dentro dos callbacks o TS perde a checagem de null.
  const saida = master;
  const t0 = c.currentTime;
  const notas = [440, 554.37, 659.25, 880, 1108.73];

  notas.forEach((hz, i) => {
    const t = t0 + i * 0.075;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = "triangle";
    osc.frequency.value = hz;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    osc.connect(g).connect(saida);
    osc.start(t);
    osc.stop(t + 0.45);
  });

  // Sino final, que e o que da a sensacao de "caiu a ficha".
  const tSino = t0 + notas.length * 0.075;
  [880, 1320, 1760].forEach((hz, i) => {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = "sine";
    osc.frequency.value = hz;
    g.gain.setValueAtTime(0.0001, tSino);
    g.gain.exponentialRampToValueAtTime(0.16 / (i + 1), tSino + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, tSino + 1.6);
    osc.connect(g).connect(saida);
    osc.start(tSino);
    osc.stop(tSino + 1.7);
  });
}
