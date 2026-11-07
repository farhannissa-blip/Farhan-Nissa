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

export type SoftSplashVariant = 'surface' | 'reentry' | 'breach' | 'skim';

class AudioEngine {
  private audioCtx: AudioContext | null = null;
  private splashNoiseBuffer: AudioBuffer | null = null;
  private lastSoftSplashTime = 0;
  private splashVariantCounter = 0;
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
    if (this.audioCtx && !this.splashNoiseBuffer) {
      this.createSharedNoiseBuffer();
    }
  }

  private createSharedNoiseBuffer(): void {
    if (!this.audioCtx) return;
    const sampleRate = this.audioCtx.sampleRate;
    const length = Math.floor(sampleRate * 0.5);
    const buffer = this.audioCtx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    // Pink-ish smoothed noise for softer, more natural water texture
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + white * 0.029;
      b1 = 0.985 * b1 + white * 0.032;
      b2 = 0.95 * b2 + white * 0.048;
      data[i] = (b0 + b1 + b2 + white * 0.18) * 0.55;
    }
    this.splashNoiseBuffer = buffer;
  }

  private createStereoOutput(pan = 0): AudioNode {
    if (!this.audioCtx) throw new Error('No AudioContext');
    if (typeof this.audioCtx.createStereoPanner === 'function') {
      const panner = this.audioCtx.createStereoPanner();
      panner.pan.value = Math.max(-0.85, Math.min(0.85, pan));
      panner.connect(this.audioCtx.destination);
      return panner;
    }
    return this.audioCtx.destination;
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

  /**
   * Memainkan suara percikan air lembut yang bervariasi (soft splash) dengan efek stereo 3D
   * saat ikan Koi masuk ke dalam air ('reentry') atau berenang/muncul ke permukaan ('surface', 'breach', 'skim').
   */
  public playSoftSplashSound(
    variant: SoftSplashVariant = 'surface',
    pan = 0
  ): void {
    if (!this.audioCtx || this.isMuted) return;
    if (this.audioCtx.state === 'suspended') return;

    const nowMs = performance.now();
    // Rate-limit gentle splashes so simultaneous fish don't cause audio clipping
    const minGapMs = variant === 'skim' ? 110 : 55;
    if (nowMs - this.lastSoftSplashTime < minGapMs) return;
    this.lastSoftSplashTime = nowMs;

    if (!this.splashNoiseBuffer) {
      this.createSharedNoiseBuffer();
    }

    const t = this.audioCtx.currentTime;
    const outputNode = this.createStereoOutput(pan);

    // 5 varied acoustic presets + random micro-detuning so every splash sounds natural & unique
    const profileIdx = this.splashVariantCounter % 5;
    this.splashVariantCounter++;
    const pitchJitter = 0.9 + Math.random() * 0.22;

    // Profile parameters based on whether fish is entering water ('reentry') or swimming to surface ('surface'/'breach'/'skim')
    const isReentry = variant === 'reentry';
    const isSkim = variant === 'skim';
    const isBreach = variant === 'breach';

    const duration = isReentry
      ? 0.19 + (profileIdx % 3) * 0.025
      : isSkim
      ? 0.12 + (profileIdx % 2) * 0.02
      : 0.16 + (profileIdx % 3) * 0.02;

    const noisePeakGain = isSkim
      ? 0.045
      : isReentry
      ? 0.115
      : isBreach
      ? 0.09
      : 0.078;

    // 1. Soft Bandpass-Filtered Water Wash Layer
    if (this.splashNoiseBuffer) {
      const noiseSrc = this.audioCtx.createBufferSource();
      noiseSrc.buffer = this.splashNoiseBuffer;

      const filter = this.audioCtx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = isReentry ? 1.8 + (profileIdx % 3) * 0.4 : 2.2 + (profileIdx % 3) * 0.5;

      const startCutoff =
        (isReentry ? 460 + profileIdx * 55 : 680 + profileIdx * 75) * pitchJitter;
      const endCutoff =
        (isReentry ? 1050 + profileIdx * 80 : 1380 + profileIdx * 95) *
        pitchJitter;

      filter.frequency.setValueAtTime(startCutoff, t);
      filter.frequency.exponentialRampToValueAtTime(
        endCutoff,
        t + duration * 0.65
      );
      filter.frequency.exponentialRampToValueAtTime(
        startCutoff * 0.75,
        t + duration
      );

      const nGain = this.audioCtx.createGain();
      nGain.gain.setValueAtTime(0.002, t);
      nGain.gain.linearRampToValueAtTime(noisePeakGain, t + 0.018);
      nGain.gain.exponentialRampToValueAtTime(0.001, t + duration);

      noiseSrc.connect(filter);
      filter.connect(nGain);
      nGain.connect(outputNode);

      const randomOffset = Math.random() * 0.2;
      noiseSrc.start(t, randomOffset, duration + 0.02);
    }

    // 2. Resonant Water Bubble / Plop Layer (Curved Sine Pitch Envelope)
    const basePlopFreqs = isReentry
      ? [235, 265, 295, 250, 315]
      : isSkim
      ? [390, 440, 480, 415, 460]
      : [310, 345, 380, 330, 405];
    const endPlopFreqs = isReentry
      ? [540, 620, 690, 585, 740]
      : isSkim
      ? [720, 810, 880, 760, 845]
      : [640, 710, 790, 675, 830];

    const f0 = basePlopFreqs[profileIdx] * pitchJitter;
    const f1 = endPlopFreqs[profileIdx] * pitchJitter;

    const plopOsc = this.audioCtx.createOscillator();
    const plopGain = this.audioCtx.createGain();
    plopOsc.type = 'sine';
    plopOsc.frequency.setValueAtTime(f0, t);
    plopOsc.frequency.exponentialRampToValueAtTime(f1, t + duration * 0.58);
    if (isBreach) {
      plopOsc.frequency.exponentialRampToValueAtTime(f0 * 0.88, t + duration * 0.92);
    }

    const plopPeak = isSkim ? 0.038 : isReentry ? 0.088 : 0.068;
    plopGain.gain.setValueAtTime(0.002, t);
    plopGain.gain.linearRampToValueAtTime(plopPeak, t + 0.014);
    plopGain.gain.exponentialRampToValueAtTime(0.001, t + duration * 0.9);

    plopOsc.connect(plopGain);
    plopGain.connect(outputNode);
    plopOsc.start(t);
    plopOsc.stop(t + duration);

    // 3. Secondary Micro-Droplet Trickle (adds organic 3D water droplet sparkle when entering or breaching water)
    if (!isSkim) {
      const dropletCount = isReentry ? 2 : 1;
      for (let d = 0; d < dropletCount; d++) {
        const delay = 0.045 + d * 0.048 + Math.random() * 0.025;
        const dropDur = 0.055 + Math.random() * 0.02;
        const dropStartFreq = (680 + profileIdx * 90 + d * 180) * pitchJitter;
        const dropEndFreq = dropStartFreq * (1.55 + Math.random() * 0.25);

        const dropOsc = this.audioCtx.createOscillator();
        const dropGain = this.audioCtx.createGain();
        dropOsc.type = 'sine';
        dropOsc.frequency.setValueAtTime(dropStartFreq, t + delay);
        dropOsc.frequency.exponentialRampToValueAtTime(
          dropEndFreq,
          t + delay + dropDur
        );

        const dropPeak = (isReentry ? 0.042 : 0.032) * (d === 0 ? 1 : 0.75);
        dropGain.gain.setValueAtTime(0.001, t + delay);
        dropGain.gain.linearRampToValueAtTime(dropPeak, t + delay + 0.008);
        dropGain.gain.exponentialRampToValueAtTime(
          0.001,
          t + delay + dropDur
        );

        dropOsc.connect(dropGain);
        dropGain.connect(outputNode);
        dropOsc.start(t + delay);
        dropOsc.stop(t + delay + dropDur + 0.005);
      }
    }
  }

  public playWaterRippleSound(pan = 0): void {
    this.playSoftSplashSound('surface', pan);
  }

  public playFishJumpSound(pan = 0): void {
    this.playSoftSplashSound('breach', pan);
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
