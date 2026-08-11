import fs from 'fs';
import path from 'path';

// Generate 10-second 44.1kHz 16-bit Mono WAV PCM file
const sampleRate = 44100;
const durationSec = 10;
const totalSamples = sampleRate * durationSec;
const buffer = Buffer.alloc(44 + totalSamples * 2);

// WAV Header
buffer.write('RIFF', 0);
buffer.writeUInt32LE(36 + totalSamples * 2, 4);
buffer.write('WAVE', 8);
buffer.write('fmt ', 12);
buffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
buffer.writeUInt16LE(1, 20);  // AudioFormat (1 for PCM)
buffer.writeUInt16LE(1, 22);  // NumChannels (1 mono)
buffer.writeUInt32LE(sampleRate, 24); // SampleRate
buffer.writeUInt32LE(sampleRate * 2, 28); // ByteRate
buffer.writeUInt16LE(2, 32);  // BlockAlign
buffer.writeUInt16LE(16, 34); // BitsPerSample

// Generate PCM audio samples for 10 seconds
for (let i = 0; i < totalSamples; i++) {
  const t = i / sampleRate; // Time in seconds
  let sample = 0;

  // 1. Ticking clock beat (every 1.0 second)
  const secPhase = t % 1.0;
  if (secPhase < 0.05) {
    const tickFreq = 1200 + (t * 100);
    sample += Math.sin(2 * Math.PI * tickFreq * t) * Math.exp(-secPhase * 60) * 0.4;
  }

  // 2. Sub-Bass Synth Pulse (every 0.5 seconds)
  const beatPhase = t % 0.5;
  if (beatPhase < 0.25) {
    const bassFreq = t > 7 ? 220 : (t > 4 ? 164.81 : 130.81);
    const bassSquare = Math.sin(2 * Math.PI * bassFreq * t) > 0 ? 0.3 : -0.3;
    sample += bassSquare * Math.exp(-beatPhase * 8);
  }

  // 3. Arpeggiated Melody (4 notes per second)
  const arpIndex = Math.floor((t % 1.0) * 4);
  const arpPhase = (t % 0.25);
  let freq;
  if (t > 7) {
    // Climax (A5, C#6, E6, A6)
    const notes = [880, 1108.73, 1318.51, 1760];
    freq = notes[arpIndex];
  } else if (t > 4) {
    // Escalation (E5, G#5, B5, E6)
    const notes = [523.25, 659.25, 783.99, 1046.50];
    freq = notes[arpIndex];
  } else {
    // Start (A4, C#5, E5, A5)
    const notes = [440, 554.37, 659.25, 880];
    freq = notes[arpIndex];
  }

  const synthWave = Math.sin(2 * Math.PI * freq * t) * 0.35 + (Math.sin(2 * Math.PI * (freq * 1.5) * t) * 0.15);
  sample += synthWave * Math.exp(-arpPhase * 12);

  // 4. Final Stinger Chime at 9.5s–10s
  if (t > 9.5) {
    const gongPhase = t - 9.5;
    sample += (Math.sin(2 * Math.PI * 1760 * t) + Math.sin(2 * Math.PI * 2200 * t)) * Math.exp(-gongPhase * 4) * 0.4;
  }

  // Clamp sample to [-1, 1] range
  sample = Math.max(-1, Math.min(1, sample));

  // Convert to 16-bit PCM integer
  const pcmVal = Math.round(sample * 32767);
  buffer.writeInt16LE(pcmVal, 44 + i * 2);
}

// Write to public/music/countdown_jingle.wav and public/music/countdown_jingle.mp3
const musicDir = path.join(process.cwd(), 'public', 'music');
if (!fs.existsSync(musicDir)) {
  fs.mkdirSync(musicDir, { recursive: true });
}

const wavPath = path.join(musicDir, 'countdown_jingle.wav');
fs.writeFileSync(wavPath, buffer);
console.log(`✅ Generated 10-second countdown audio jingle at: ${wavPath}`);

const mp3Path = path.join(musicDir, 'countdown_jingle.mp3');
fs.writeFileSync(mp3Path, buffer);
console.log(`✅ Saved countdown jingle at: ${mp3Path}`);
