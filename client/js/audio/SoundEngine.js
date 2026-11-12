class SoundEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.musicGain = null;
    this.cityGain = null;
    this.uiGain = null;
    this.started = false;
    this.muted = false;
    this.volumes = {
      master: 0.65,
      music: 0.38,
      city: 0.42,
      ui: 0.72,
    };
    this.musicTimer = null;
    this.cityNode = null;
  }

  init() {
    if (this.started) {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    this.masterGain = this.ctx.createGain();
    this.musicGain = this.ctx.createGain();
    this.cityGain = this.ctx.createGain();
    this.uiGain = this.ctx.createGain();

    this.musicGain.connect(this.masterGain);
    this.cityGain.connect(this.masterGain);
    this.uiGain.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);

    this.applySettings(this.volumes, this.muted);
    this.started = true;
    this._startAmbientMusic();
    this._startCityBed();
  }

  applySettings(volumes, muted) {
    this.volumes = { ...this.volumes, ...volumes };
    this.muted = Boolean(muted);
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.masterGain.gain.setTargetAtTime(this.muted ? 0 : this.volumes.master, now, 0.05);
    this.musicGain.gain.setTargetAtTime(this.volumes.music * 0.25, now, 0.08);
    this.cityGain.gain.setTargetAtTime(this.volumes.city * 0.14, now, 0.08);
    this.uiGain.gain.setTargetAtTime(this.volumes.ui * 0.35, now, 0.05);
  }

  toggleMute() {
    this.init();
    this.muted = !this.muted;
    this.applySettings(this.volumes, this.muted);
    return this.muted;
  }

  _startAmbientMusic() {
    if (!this.ctx) return;
    // Gentle modern architectural synth chord progression (Cmaj9 -> Am9 -> Fmaj7 -> G6)
    const chords = [
      [130.81, 196.0, 246.94, 293.66],
      [110.0, 164.81, 220.0, 246.94],
      [87.31, 130.81, 174.61, 220.0],
      [98.0, 146.83, 196.0, 246.94],
    ];
    let step = 0;

    const playChord = () => {
      if (!this.ctx || this.ctx.state === 'closed') return;
      const now = this.ctx.currentTime;
      const freqs = chords[step % chords.length];
      step++;

      freqs.forEach((f) => {
        const osc = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const env = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, now);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(620, now);

        env.gain.setValueAtTime(0.0001, now);
        env.gain.linearRampToValueAtTime(0.12, now + 1.4);
        env.gain.exponentialRampToValueAtTime(0.0001, now + 5.8);

        osc.connect(filter);
        filter.connect(env);
        env.connect(this.musicGain);

        osc.start(now);
        osc.stop(now + 6.0);
      });
    };

    playChord();
    this.musicTimer = setInterval(playChord, 5600);
  }

  _startCityBed() {
    if (!this.ctx) return;
    // Soft filtered pink-ish noise bed for distant urban traffic / wind atmosphere
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + white * 0.029;
      b1 = 0.985 * b1 + white * 0.032;
      b2 = 0.950 * b2 + white * 0.048;
      data[i] = (b0 + b1 + b2) * 0.25;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 340;

    src.connect(filter);
    filter.connect(this.cityGain);
    src.start();
    this.cityNode = src;
  }

  playClick() {
    if (!this.started) this.init();
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(680, now);
    osc.frequency.exponentialRampToValueAtTime(420, now + 0.055);
    env.gain.setValueAtTime(0.25, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.connect(env);
    env.connect(this.uiGain);
    osc.start(now);
    osc.stop(now + 0.065);
  }

  playConstruct() {
    if (!this.started) this.init();
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    // Heavy hydraulic thud + metallic confirmation ping
    const bass = this.ctx.createOscillator();
    const bassEnv = this.ctx.createGain();
    bass.type = 'sine';
    bass.frequency.setValueAtTime(140, now);
    bass.frequency.exponentialRampToValueAtTime(48, now + 0.22);
    bassEnv.gain.setValueAtTime(0.6, now);
    bassEnv.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    bass.connect(bassEnv);
    bassEnv.connect(this.uiGain);
    bass.start(now);
    bass.stop(now + 0.25);

    const ping = this.ctx.createOscillator();
    const pingEnv = this.ctx.createGain();
    ping.type = 'triangle';
    ping.frequency.setValueAtTime(523.25, now + 0.06);
    ping.frequency.setValueAtTime(659.25, now + 0.14);
    pingEnv.gain.setValueAtTime(0.22, now + 0.06);
    pingEnv.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
    ping.connect(pingEnv);
    pingEnv.connect(this.uiGain);
    ping.start(now + 0.06);
    ping.stop(now + 0.35);
  }

  playCash() {
    if (!this.started) this.init();
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    [880, 1174.66].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const env = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.06);
      env.gain.setValueAtTime(0.2, now + i * 0.06);
      env.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.18);
      osc.connect(env);
      env.connect(this.uiGain);
      osc.start(now + i * 0.06);
      osc.stop(now + i * 0.06 + 0.2);
    });
  }
}

export const soundEngine = new SoundEngine();
