import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "../lib/config.js";
import { env, path } from "../lib/util.js";

/** Founder decision: this channel's voice is Kokoro "am_michael", en-us, speed 0.95, in dry and live runs. No ElevenLabs. */

export interface Word {
  word: string;
  start: number;
  end: number;
}

export interface VoiceSegment {
  id: string;
  text: string;
  file: string; // absolute path
  duration: number; // seconds
  words?: Word[];
}

export interface VoiceResult {
  provider: "kokoro";
  label: string; // shown in the upload disclosure
  segments: VoiceSegment[];
}

export interface Line {
  id: string;
  text: string;
}

/** Kokoro (Apache-2.0 open model), runs offline. */
export function synthesize(lines: Line[], outDir: string): VoiceResult {
  const v = config().voice;
  const models = env("KOKORO_DIR") ?? path("models/kokoro");
  const python = env("KOKORO_PYTHON") ?? "python3";
  const job = join(outDir, "kokoro-job.json");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    job,
    JSON.stringify({ model: join(models, "kokoro-v1.0.int8.onnx"), voices: join(models, "voices-v1.0.bin"), voice: v.kokoroVoice, lang: v.lang, speed: v.speed, out_dir: outDir, lines }),
  );
  const out = execFileSync(python, ["-I", path("src/voice/kokoro_tts.py"), job], { encoding: "utf8", maxBuffer: 1 << 24 });
  const parsed = JSON.parse(out.trim().split("\n").at(-1)!) as { segments: { id: string; file: string; duration: number }[] };
  return {
    provider: "kokoro",
    label: "AI voice (Kokoro open model)",
    segments: parsed.segments.map((s) => ({ ...s, text: lines.find((l) => l.id === s.id)!.text })),
  };
}
