// Procedural Web Audio Synthesizer for Tropical Marimba BGM & 3D Pond Sound Effects

const melodyNotes = [
  523.25, 659.25, 783.99, 1046.5, 880.0, 783.99, 659.25, 523.25,
  587.33, 698.46, 880.0, 783.99, 659.25, 587.33, 523.25, 587.33,
  523.25, 659.25, 783.99, 1046.5, 880.0, 1046.5, 783.99, 659.25,
  698.46, 783.99, 880.0, 783.99, 587.33, 659.25, 523.25, 0,
];

const bassNotes = [
  261.63, 0, 329.63, 0, 349.23, 0, 392.0, 0,
  293.66, 0, 392.0, 0, 261.63, 0, 392.0, 0,
  261.63, 0, 329.63, 0, 349.23, 0, 392.0, 0,
  349.23, 0, 392.0, 0, 261.63, 0, 261.63, 0,
];

class AudioEngine {
  private audioCtx: AudioContext | null = null;
  private bgmTimer: number | null = null;
  private bgmStep = 0;
  private bgmIsPlaying = false;
  public isMuted = false;

  public init(): void {
    if (!this.audioCtx) {
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        this.audioCtx = new AudioCtx();
      } catch {
        // Web Audio API not supported
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
  }

  private playBgmStep = (): void => {
    if (!this.audioCtx || this.isMuted || !this.bgmIsPlaying) return;
    const t = this.audioCtx.currentTime;

    const freq = melodyNotes[this.bgmStep % melodyNotes.length];
    if (freq > 0) {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.04, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.19);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.2);
    }

    const bFreq = bassNotes[this.bgmStep % bassNotes.length];
    if (bFreq > 0) {
      const bOsc = this.audioCtx.createOscillator();
      const bGain = this.audioCtx.createGain();
      bOsc.type = 'triangle';
      bOsc.frequency.setValueAtTime(bFreq, t);
      bGain.gain.setValueAtTime(0.032, t);
      bGain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      bOsc.connect(bGain);
      bGain.connect(this.audioCtx.destination);
      bOsc.start(t);
      bOsc.stop(t + 0.24);
    }
    this.bgmStep++;
  };

  public startBGM(): void {
    this.init();
    if (!this.audioCtx || this.isMuted || this.bgmIsPlaying) return;
    this.bgmIsPlaying = true;
    if (this.bgmTimer) window.clearInterval(this.bgmTimer);
    this.bgmTimer = window.setInterval(this.playBgmStep, 210);
  }

  public stopBGM(): void {
    this.bgmIsPlaying = false;
    if (this.bgmTimer) {
      window.clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
  }

  public toggleMute(shouldPlayBgm: boolean): boolean {
    this.init();
    this.isMuted = !this.isMuted;
    if (this.isMuted) {
      this.stopBGM();
    } else if (shouldPlayBgm) {
      this.startBGM();
    }
    return this.isMuted;
  }

  public playWaterRippleSound(): void {
    if (!this.audioCtx || this.isMuted) return;
    const t = this.audioCtx.currentTime;
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, t);
    osc.frequency.exponentialRampToValueAtTime(680, t + 0.09);
    gain.gain.setValueAtTime(0.11, t);
    gain.gain.exponentialRampToValueAtTime(0.005, t + 0.11);
    osc.connect(gain);
    gain.connect(this.audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.12);
  }

  public playFishJumpSound(): void {
    if (!this.audioCtx || this.isMuted) return;
    const t = this.audioCtx.currentTime;
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(260, t);
    osc.frequency.exponentialRampToValueAtTime(510, t + 0.08);
    osc.frequency.exponentialRampToValueAtTime(220, t + 0.16);
    gain.gain.setValueAtTime(0.065, t);
    gain.gain.exponentialRampToValueAtTime(0.004, t + 0.17);
    osc.connect(gain);
    gain.connect(this.audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.18);
  }

  public playCatchSound(comboCount = 1): void {
    if (!this.audioCtx || this.isMuted) return;
    const t = this.audioCtx.currentTime;

    // 1. Water splash noise burst
    const bufferSize = Math.floor(this.audioCtx.sampleRate * 0.15);
    const buffer = this.audioCtx.createBuffer(
      1,
      bufferSize,
      this.audioCtx.sampleRate
    );
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.audioCtx.createBufferSource();
    noise.buffer = buffer;
    const noiseFilter = this.audioCtx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 980;
    const noiseGain = this.audioCtx.createGain();
    noiseGain.gain.setValueAtTime(0.24, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.audioCtx.destination);
    noise.start(t);

    // 2. Water Plop
    const plop = this.audioCtx.createOscillator();
    const plopGain = this.audioCtx.createGain();
    plop.type = 'sine';
    plop.frequency.setValueAtTime(420, t);
    plop.frequency.exponentialRampToValueAtTime(890, t + 0.09);
    plopGain.gain.setValueAtTime(0.32, t);
    plopGain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
    plop.connect(plopGain);
    plopGain.connect(this.audioCtx.destination);
    plop.start(t);
    plop.stop(t + 0.11);

    // 3. Combo Victory Chime
    const pitchBoost = Math.min(comboCount - 1, 6) * 45;
    const chime = this.audioCtx.createOscillator();
    const chimeGain = this.audioCtx.createGain();
    chime.type = 'triangle';
    chime.frequency.setValueAtTime(587.33 + pitchBoost, t + 0.06);
    chime.frequency.setValueAtTime(880.0 + pitchBoost, t + 0.14);
    chimeGain.gain.setValueAtTime(0.001, t + 0.06);
    chimeGain.gain.linearRampToValueAtTime(0.18, t + 0.1);
    chimeGain.gain.exponentialRampToValueAtTime(0.005, t + 0.38);
    chime.connect(chimeGain);
    chimeGain.connect(this.audioCtx.destination);
    chime.start(t + 0.06);
    chime.stop(t + 0.4);
  }

  public playLevelUpSound(): void {
    if (!this.audioCtx || this.isMuted) return;
    const t = this.audioCtx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      if (!this.audioCtx) return;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t + idx * 0.08);
      gain.gain.setValueAtTime(0.16, t + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.005, t + idx * 0.08 + 0.28);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(t + idx * 0.08);
      osc.stop(t + idx * 0.08 + 0.3);
    });
  }

  public playWrongSound(): void {
    if (!this.audioCtx || this.isMuted) return;
    const t = this.audioCtx.currentTime;
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(280, t);
    osc.frequency.exponentialRampToValueAtTime(125, t + 0.35);
    gain.gain.setValueAtTime(0.01, t);
    gain.gain.linearRampToValueAtTime(0.15, t + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.005, t + 0.38);
    osc.connect(gain);
    gain.connect(this.audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.4);
  }
}

export const audioEngine = new AudioEngine();
