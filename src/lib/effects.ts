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

// ============================================================
// 提示音风格系统:4 套成对风格(每套 = 完成音 + 提醒音)
// 全部 WebAudio 合成,零依赖。完成音=反馈音(主动触发,0.2–0.5s,有成就感);
// 提醒音=通知音(被动触发,1.0–2.5s,温和带渐弱尾音,"朋友轻拍肩膀")。
// 三条避坑:① 同风格的提醒/完成用同族音色;② 提醒音柔和起音 + 偏暖压高频防刺耳;③ 控制时长。
// ============================================================

export type SoundStyle = "minimal" | "game" | "zen" | "cute";

/** 风格键集合(供设置面板遍历) */
export const SOUND_STYLES: SoundStyle[] = ["minimal", "game", "zen", "cute"];

/** 把传入的设置值规整成合法风格(默认 minimal,贴近老用户的完成音观感) */
export function normalizeSoundStyle(v: string | undefined): SoundStyle {
  return v === "game" || v === "zen" || v === "cute" ? v : "minimal";
}

/**
 * 通用单音:可选波形 + 柔和起音(soft attack 淡入)+ 指数衰减,可叠低通让音色偏暖防刺耳。
 * - type:振荡器波形(sine 最暖,triangle 略亮,square/sawtooth 更电子)
 * - attack:淡入时长(秒),几 ms 即可去爆音、让起音柔和
 * - cutoff:低通截止频率(Hz),压住高频毛刺;不传则不滤波
 */
function tone(
  freq: number,
  at: number,
  dur: number,
  gain: number,
  type: OscillatorType = "sine",
  attack = 0.006,
  cutoff = 0,
) {
  const ctx = audioCtx!;
  const t0 = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + attack); // 柔和起音
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  let tail: AudioNode = g;
  if (cutoff > 0) {
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = cutoff;
    g.connect(lp);
    tail = lp;
  }
  osc.connect(g);
  tail.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/**
 * 颂钵/长尾钟:基频 + 微失谐泛音,缓慢线性渐弱长尾(zen 用),低通压暗。
 */
function bowl(freq: number, at: number, dur: number, amp: number) {
  const ctx = audioCtx!;
  const t0 = ctx.currentTime + at;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.linearRampToValueAtTime(amp, t0 + 0.04); // 40ms 柔起
  env.gain.linearRampToValueAtTime(amp * 0.5, t0 + dur * 0.4); // 缓慢渐弱
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); // 长尾收束
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 1800;
  env.connect(lp).connect(ctx.destination);
  // 基频 + 略失谐泛音(2.76、5.40 近似钵的非谐泛音),营造金属共鸣
  for (const [mult, a] of [[1, 1], [2.76, 0.28], [5.4, 0.12]] as [number, number][]) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq * mult;
    g.gain.value = a;
    osc.connect(g).connect(env);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }
}

/**
 * 水滴/气泡:短促正弦 + 快速上滑音高(pitch bend),配低通,带"啵"的弹性。
 */
function drop(from: number, to: number, at: number, dur: number, amp: number) {
  const ctx = audioCtx!;
  const t0 = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(from, t0);
  osc.frequency.exponentialRampToValueAtTime(to, t0 + dur * 0.7); // 上滑
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(amp, t0 + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 2400;
  osc.connect(g).connect(lp).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

// —— 4 套完成音(反馈音:0.2–0.5s)——

const COMPLETE: Record<SoundStyle, () => void> = {
  // 极简现代:玻璃叮一声(短促清脆,triangle 略亮但低通压高频),贴近老用户原完成音
  minimal() {
    tone(1318.51, 0, 0.28, 0.16, "triangle", 0.004, 5200); // E6 玻璃 ping
    tone(1976, 0.02, 0.18, 0.06, "sine", 0.004, 6000); // 高位泛音点缀
  },
  // 奖励游戏化:明亮铃铛上扬叮(复用 bell,两声上行,满足感)
  game() {
    bell(987.77, 0, 7.5, 0.5); // B5
    bell(1567.98, 0.09, 6, 0.6); // G6 上扬
  },
  // 自然禅意:水滴气泡声(平静共鸣,偏暖)
  zen() {
    drop(520, 900, 0, 0.32, 0.18);
    bowl(880, 0.04, 0.42, 0.08); // 一点钵的尾韵共鸣
  },
  // 俏皮可爱:气泡破裂上扬(Q 弹,两连泡上行)
  cute() {
    drop(440, 760, 0, 0.16, 0.16);
    drop(620, 1040, 0.1, 0.2, 0.16); // 第二泡更高,上扬收尾
  },
};

// —— 4 套提醒音(通知音:1.0–2.5s,柔和起音 + 渐弱尾音)——

const REMINDER: Record<SoundStyle, () => void> = {
  // 极简现代:两次轻柔合成器滴答(soft double synth beep,干净不突兀,低通防刺耳)
  minimal() {
    tone(880, 0, 0.5, 0.08, "sine", 0.012, 3200); // A5
    tone(1108.73, 0.32, 0.9, 0.08, "sine", 0.012, 3200); // C#6,尾音稍长渐弱
  },
  // 奖励游戏化:3 音上扬电子旋律(3-note ascending chirp,欢快,triangle 偏电子但压高频)
  game() {
    tone(659.25, 0, 0.34, 0.09, "triangle", 0.008, 4000); // E5
    tone(830.61, 0.22, 0.34, 0.09, "triangle", 0.008, 4000); // G#5
    tone(1046.5, 0.44, 0.95, 0.09, "triangle", 0.008, 4200); // C6,尾音渐弱
  },
  // 自然禅意:颂钵长尾,缓慢渐弱(calming,slow fade,~2.3s)
  zen() {
    bowl(523.25, 0, 2.3, 0.16); // C5 颂钵单击,长尾
  },
  // 俏皮可爱:马林巴跳跃两音(bouncy marimba,温暖,bell 木质音色 + 尾韵)
  cute() {
    bell(659.25, 0, 9, 0.32); // E5 短促木质
    bell(987.77, 0.18, 7, 0.34); // B5 跳跃上行
    bell(659.25, 0.42, 6, 0.2); // 回落 E5,带俏皮尾韵
  },
};

/** 按风格播放完成音(反馈音)。开关由调用方判断。 */
export function playComplete(style: SoundStyle = "minimal") {
  audioCtx ??= new AudioContext();
  COMPLETE[normalizeSoundStyle(style)]();
}

/** 按风格播放周期提醒音(通知音)。开关由调用方判断。 */
export function playReminder(style: SoundStyle = "minimal") {
  audioCtx ??= new AudioContext();
  REMINDER[normalizeSoundStyle(style)]();
}
