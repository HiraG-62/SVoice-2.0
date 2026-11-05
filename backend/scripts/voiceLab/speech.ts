import { execFile } from 'node:child_process';
import { mkdtemp, rmdir, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { BACKEND_ROOT } from '../../src/config';

const SPEECH_TIMEOUT_MS = 30_000;
const exec = promisify(execFile);
export const FALLBACK_WAV = resolve(BACKEND_ROOT, '../e2e/fixtures/microphone.wav');
export function buildSpeechScript(name: string, file: string) {
  const encoded = (value: string) => Buffer.from(value, 'utf8').toString('base64');
  return `$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$tag = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded(name)}'))
$file = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded(file)}'))
$speech = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $voice = $speech.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -eq 'ja-JP' } | Select-Object -First 1
  if ($voice) { $speech.SelectVoice($voice.VoiceInfo.Name) }
  $format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(48000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
  $speech.SetOutputToWaveFile($file, $format)
  $prompt = New-Object System.Speech.Synthesis.PromptBuilder
  $prompt.AppendText($tag)
  $prompt.AppendBreak([TimeSpan]::FromSeconds(1))
  $speech.Speak($prompt)
} finally { $speech.Dispose() }`;
}

export async function createSpeechAudio(name: string, dependencies = {
  run: async (script: string) => {
    await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
      { windowsHide: true, timeout: SPEECH_TIMEOUT_MS });
  },
}) {
  const directory = await mkdtemp(join(tmpdir(), 'svoice-lab-'));
  const file = join(directory, 'microphone.wav');
  const close = async () => {
    await unlink(file).catch(() => {});
    await rmdir(directory).catch(() => {});
  };
  try {
    await dependencies.run(buildSpeechScript(name, file));
    return { path: file, warning: '', close };
  } catch {
    await close();
    return { path: FALLBACK_WAV, warning: '読み上げ生成失敗・合成音声', close: async () => {} };
  }
}
