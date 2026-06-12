// 完成特效(烟花粒子)与音效:零依赖,Canvas + WebAudio 合成

/** 在屏幕坐标 (x, y) 播放一次小型烟花迸发 */
export function fireworksAt(x: number, y: number) {
  const canvas = document.createElement("canvas");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:9999";
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d")!;

  const colors = ["#F87171", "#FBBF24", "#34D399", "#60A5FA", "#A78BFA", "#F472B6"];
  const parts = Array.from({ length: 26 }, () => {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 4;
    return {
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1.5,
      r: 1.5 + Math.random() * 2,
      color: colors[(Math.random() * colors.length) | 0],
      life: 1,
    };
  });

  const start = performance.now();
  const tick = (now: number) => {
    const elapsed = now - start;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of parts) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.12; // 重力
      p.life = Math.max(0, 1 - elapsed / 700);
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    if (elapsed < 700) requestAnimationFrame(tick);
    else canvas.remove();
  };
  requestAnimationFrame(tick);
}

let audioCtx: AudioContext | null = null;

function note(freq: number, at: number, dur: number, gain = 0.12) {
  const ctx = audioCtx!;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  g.gain.setValueAtTime(gain, ctx.currentTime + at);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + at + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(ctx.currentTime + at);
  osc.stop(ctx.currentTime + at + dur);
}

/**
 * 钟/马林巴音色的一声(对齐旧版 CelebrationSound.AddBell):
 * 基频 + 泛音(2×0.45 / 3×0.22 / 4.01×0.10),指数衰减包络 + 4ms 淡入去爆音
 */
function bell(freq: number, at: number, decay: number, amp: number) {
  const ctx = audioCtx!;
  const t0 = ctx.currentTime + at;
  const dur = 0.95;
  const partials: [number, number][] = [
    [1.0, 1.0],
    [2.0, 0.45],
    [3.0, 0.22],
    [4.01, 0.1],
  ];
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.linearRampToValueAtTime(amp * 0.22, t0 + 0.004); // 4ms 淡入
  env.gain.setTargetAtTime(0.0001, t0 + 0.004, 1 / decay); // 指数衰减(时间常数 = 1/decay)
  env.connect(ctx.destination);
  for (const [mult, a] of partials) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq * mult;
    g.gain.value = a;
    osc.connect(g).connect(env);
    osc.start(t0);
    osc.stop(t0 + dur);
  }
}

/** 完成音效:两声上行铃音 A5→E6(对齐旧版 CelebrationSound,Face ID 解锁风格) */
export function playCelebration() {
  audioCtx ??= new AudioContext();
  bell(880.0, 0, 7.5, 0.55); // A5
  bell(1318.51, 0.11, 5.5, 0.65); // E6
}

/** 周期提醒提示音:轻两声 */
export function playReminderDing() {
  audioCtx ??= new AudioContext();
  note(880, 0, 0.12, 0.08);
  note(1174.66, 0.15, 0.2, 0.08);
}
