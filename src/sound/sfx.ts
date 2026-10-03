// 可选短促反馈音：收卡、卡片落位、矛盾对照各一种，默认关闭。
// 无音频文件依赖；不可用或静音时静默成功。

let context: AudioContext | null = null;

const acquire = (): AudioContext | null => {
  if (typeof window === 'undefined') return null;
  const AudioCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtor) return null;
  if (!context) {
    try {
      context = new AudioCtor();
    } catch {
      return null;
    }
  }
  return context;
};

const blip = (frequency: number, duration: number, when: number, gain: number): void => {
  const audio = acquire();
  if (!audio) return;
  if (audio.state === 'suspended') {
    void audio.resume().catch(() => undefined);
  }
  const oscillator = audio.createOscillator();
  const volume = audio.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, audio.currentTime + when);
  volume.gain.setValueAtTime(0.0001, audio.currentTime + when);
  volume.gain.exponentialRampToValueAtTime(gain, audio.currentTime + when + 0.012);
  volume.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + when + duration);
  oscillator.connect(volume);
  volume.connect(audio.destination);
  oscillator.start(audio.currentTime + when);
  oscillator.stop(audio.currentTime + when + duration + 0.02);
};

export const sfxCardReceived = (enabled: boolean): void => {
  if (!enabled) return;
  blip(660, 0.09, 0, 0.06);
  blip(990, 0.08, 0.08, 0.05);
};

export const sfxCardPlaced = (enabled: boolean): void => {
  if (!enabled) return;
  blip(420, 0.1, 0, 0.06);
};

export const sfxContradiction = (enabled: boolean): void => {
  if (!enabled) return;
  blip(220, 0.16, 0, 0.07);
  blip(180, 0.18, 0.12, 0.06);
};

export const sfxSolved = (enabled: boolean): void => {
  if (!enabled) return;
  blip(520, 0.12, 0, 0.06);
  blip(660, 0.12, 0.1, 0.06);
  blip(880, 0.18, 0.22, 0.06);
};
