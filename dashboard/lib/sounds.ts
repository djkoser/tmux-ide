import { getSettingsSnapshot } from "@/lib/useSettings";

export type SoundKind = "complete" | "error" | "idle";

const soundSettingsKey: Record<SoundKind, keyof ReturnType<typeof getSettingsSnapshot>["sounds"]> = {
  complete: "onTaskComplete",
  error: "onTaskError",
  idle: "onAgentIdle",
};

const tone: Record<SoundKind, { frequency: number; endFrequency: number; duration: number }> = {
  complete: { frequency: 660, endFrequency: 880, duration: 0.18 },
  error: { frequency: 220, endFrequency: 110, duration: 0.22 },
  idle: { frequency: 440, endFrequency: 330, duration: 0.2 },
};

export function playSound(kind: SoundKind, options: { force?: boolean } = {}): void {
  if (typeof window === "undefined") return;
  if (!options.force && !getSettingsSnapshot().sounds[soundSettingsKey[kind]]) return;

  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return;

  const context = new AudioContextCtor();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const now = context.currentTime;
  const config = tone[kind];

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(config.frequency, now);
  oscillator.frequency.exponentialRampToValueAtTime(config.endFrequency, now + config.duration);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + config.duration);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + config.duration);
  oscillator.onended = () => void context.close();
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
