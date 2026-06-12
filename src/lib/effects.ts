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

/** 完成音效:上行三连音 */
export function playCelebration() {
  audioCtx ??= new AudioContext();
  note(523.25, 0, 0.18); // C5
  note(659.25, 0.1, 0.18); // E5
  note(783.99, 0.2, 0.3); // G5
}

/** 周期提醒提示音:轻两声 */
export function playReminderDing() {
  audioCtx ??= new AudioContext();
  note(880, 0, 0.12, 0.08);
  note(1174.66, 0.15, 0.2, 0.08);
}
