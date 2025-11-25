// 効果音管理システム

type SoundType = 'place' | 'flip' | 'invalid' | 'win' | 'lose' | 'draw' | 'hover' | 'click' | 'turn';

interface SoundConfig {
  frequency: number;
  duration: number;
  type: OscillatorType;
  volume: number;
  attack?: number;
  decay?: number;
  sustain?: number;
  release?: number;
}

const SOUND_CONFIGS: Record<SoundType, SoundConfig[]> = {
  // 駒を置く音 - 重厚な「コトン」
  place: [
    { frequency: 150, duration: 0.08, type: 'sine', volume: 0.4 },
    { frequency: 100, duration: 0.12, type: 'sine', volume: 0.3 },
  ],

  // 駒をひっくり返す音 - 軽快な「パタパタ」
  flip: [
    { frequency: 800, duration: 0.03, type: 'sine', volume: 0.15 },
    { frequency: 600, duration: 0.03, type: 'sine', volume: 0.1 },
  ],

  // 無効な手 - 低い「ブブッ」
  invalid: [
    { frequency: 200, duration: 0.08, type: 'square', volume: 0.2 },
    { frequency: 150, duration: 0.08, type: 'square', volume: 0.15 },
  ],

  // 勝利音 - ファンファーレ風
  win: [
    { frequency: 523, duration: 0.15, type: 'sine', volume: 0.3 },
    { frequency: 659, duration: 0.15, type: 'sine', volume: 0.3 },
    { frequency: 784, duration: 0.15, type: 'sine', volume: 0.3 },
    { frequency: 1047, duration: 0.4, type: 'sine', volume: 0.35 },
  ],

  // 敗北音 - 下降音
  lose: [
    { frequency: 400, duration: 0.2, type: 'sine', volume: 0.25 },
    { frequency: 350, duration: 0.2, type: 'sine', volume: 0.2 },
    { frequency: 300, duration: 0.3, type: 'sine', volume: 0.15 },
  ],

  // 引き分け - 中立的な音
  draw: [
    { frequency: 440, duration: 0.2, type: 'sine', volume: 0.25 },
    { frequency: 440, duration: 0.2, type: 'sine', volume: 0.2 },
  ],

  // ホバー音 - 軽い「ピッ」
  hover: [
    { frequency: 1200, duration: 0.02, type: 'sine', volume: 0.05 },
  ],

  // クリック音 - 「カチッ」
  click: [
    { frequency: 1000, duration: 0.03, type: 'sine', volume: 0.1 },
    { frequency: 800, duration: 0.02, type: 'sine', volume: 0.08 },
  ],

  // ターン変更音
  turn: [
    { frequency: 660, duration: 0.08, type: 'sine', volume: 0.15 },
    { frequency: 880, duration: 0.1, type: 'sine', volume: 0.12 },
  ],
};

export class SoundManager {
  private audioContext: AudioContext | null = null;
  private enabled: boolean = true;
  private masterVolume: number = 0.7;

  constructor() {
    this.initAudioContext();
  }

  private initAudioContext(): void {
    try {
      this.audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    } catch {
      console.warn('Web Audio API is not supported');
      this.enabled = false;
    }
  }

  public async ensureContext(): Promise<void> {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
  }

  public async play(soundType: SoundType): Promise<void> {
    if (!this.enabled || !this.audioContext) return;

    await this.ensureContext();

    const configs = SOUND_CONFIGS[soundType];
    if (!configs) return;

    let delay = 0;
    for (const config of configs) {
      this.playTone(config, delay);
      delay += config.duration;
    }
  }

  private playTone(config: SoundConfig, delay: number = 0): void {
    if (!this.audioContext) return;

    const currentTime = this.audioContext.currentTime + delay;

    // オシレーター
    const oscillator = this.audioContext.createOscillator();
    oscillator.type = config.type;
    oscillator.frequency.setValueAtTime(config.frequency, currentTime);

    // ゲイン（音量エンベロープ）
    const gainNode = this.audioContext.createGain();
    const volume = config.volume * this.masterVolume;

    // ADSR エンベロープ
    const attack = config.attack || 0.01;
    const decay = config.decay || 0.05;
    const sustain = config.sustain || 0.7;
    const release = config.release || 0.1;

    gainNode.gain.setValueAtTime(0, currentTime);
    gainNode.gain.linearRampToValueAtTime(volume, currentTime + attack);
    gainNode.gain.linearRampToValueAtTime(volume * sustain, currentTime + attack + decay);
    gainNode.gain.linearRampToValueAtTime(0, currentTime + config.duration + release);

    // 接続
    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    // 再生
    oscillator.start(currentTime);
    oscillator.stop(currentTime + config.duration + release + 0.1);
  }

  // 複数の駒を順番にひっくり返す音
  public async playFlipSequence(count: number): Promise<void> {
    if (!this.enabled || !this.audioContext) return;

    await this.ensureContext();

    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        this.play('flip');
      }, i * 80); // 80msごとに再生
    }
  }

  // BGM風のアンビエントサウンド（オプション）
  public playAmbient(): () => void {
    if (!this.enabled || !this.audioContext) return () => {};

    const ctx = this.audioContext;

    // 低いドローン音
    const oscillator = ctx.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(55, ctx.currentTime); // 低いA

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.03 * this.masterVolume, ctx.currentTime + 2);

    // フィルター
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(200, ctx.currentTime);

    oscillator.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.start();

    // 停止関数を返す
    return () => {
      gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 1);
      setTimeout(() => oscillator.stop(), 1100);
    };
  }
}

// シングルトンインスタンス
export const soundManager = new SoundManager();
