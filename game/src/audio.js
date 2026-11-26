// Skyline Courier — sound. Everything is synthesised with WebAudio, so the
// game ships no audio files: an engine hum that follows the throttle, wind
// that rises with speed, a chime for a ring, a thud for a touchdown and a
// warning beep for stall and low fuel. Silent until the first user gesture,
// as browsers require, and muteable with M.

export function createAudio() {
  const audio = {
    ctx: null,
    master: null,
    engineOsc: null,
    engineGain: null,
    windGain: null,
    muted: false,
    started: false,
  };

  function ensure() {
    if (audio.started) return true;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return false;
      audio.ctx = new Ctx();
      audio.master = audio.ctx.createGain();
      audio.master.gain.value = 0.5;
      audio.master.connect(audio.ctx.destination);

      // Engine: two detuned sawtooths through a lowpass, gain by throttle.
      audio.engineOsc = audio.ctx.createOscillator();
      audio.engineOsc.type = 'sawtooth';
      audio.engineOsc.frequency.value = 70;
      const engineOsc2 = audio.ctx.createOscillator();
      engineOsc2.type = 'sawtooth';
      engineOsc2.frequency.value = 71.5;
      const filter = audio.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      audio.engineGain = audio.ctx.createGain();
      audio.engineGain.gain.value = 0;
      audio.engineOsc.connect(filter);
      engineOsc2.connect(filter);
      filter.connect(audio.engineGain);
      audio.engineGain.connect(audio.master);
      audio.engineOsc.start();
      engineOsc2.start();

      // Wind: looped filtered noise, gain by airspeed.
      const len = audio.ctx.sampleRate * 2;
      const buffer = audio.ctx.createBuffer(1, len, audio.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const noise = audio.ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      const windFilter = audio.ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 600;
      audio.windGain = audio.ctx.createGain();
      audio.windGain.gain.value = 0;
      noise.connect(windFilter);
      windFilter.connect(audio.windGain);
      audio.windGain.connect(audio.master);
      noise.start();

      audio.started = true;
      return true;
    } catch {
      return false;
    }
  }

  function tone(freq, dur, type = 'sine', vol = 0.25, when = 0) {
    if (!audio.started || audio.muted) return;
    try {
      const t0 = audio.ctx.currentTime + when;
      const osc = audio.ctx.createOscillator();
      const gain = audio.ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(vol, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.connect(gain);
      gain.connect(audio.master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    } catch {
      // Sound is garnish; never let it break the game.
    }
  }

  return {
    ensure,
    toggleMute() {
      audio.muted = !audio.muted;
      if (audio.master) audio.master.gain.value = audio.muted ? 0 : 0.5;
      return audio.muted;
    },
    get muted() {
      return audio.muted;
    },
    update(p) {
      if (!audio.started || audio.muted) return;
      try {
        const t = audio.ctx.currentTime;
        const rpm = 55 + p.throttle * 85 + p.speed * 0.12;
        audio.engineOsc.frequency.setTargetAtTime(rpm, t, 0.1);
        audio.engineGain.gain.setTargetAtTime(p.grounded ? 0.02 : 0.05 + p.throttle * 0.06, t, 0.1);
        audio.windGain.gain.setTargetAtTime(Math.min(0.12, p.speed * 0.0006), t, 0.2);
      } catch {
        // Ignore audio errors mid-flight.
      }
    },
    ring() {
      tone(880, 0.35, 'sine', 0.3);
      tone(1318, 0.5, 'sine', 0.22, 0.09);
    },
    thud() {
      tone(90, 0.3, 'triangle', 0.4);
      tone(55, 0.4, 'sine', 0.3, 0.02);
    },
    crash() {
      tone(160, 0.5, 'sawtooth', 0.3);
      tone(60, 0.9, 'sawtooth', 0.3, 0.1);
    },
    alarm() {
      tone(1046, 0.12, 'square', 0.12);
      tone(1046, 0.12, 'square', 0.12, 0.18);
    },
    click() {
      tone(660, 0.07, 'sine', 0.15);
    },
  };
}
