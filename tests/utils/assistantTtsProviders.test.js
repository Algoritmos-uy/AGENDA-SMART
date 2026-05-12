import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const assistant = require('../../src/assistant.js');

describe('assistant TTS providers', () => {
  const envBackup = {};

  beforeEach(() => {
    envBackup.FISH_API_KEY = process.env.FISH_API_KEY;
    envBackup.FISH_API_URL = process.env.FISH_API_URL;
    envBackup.FISH_TTS_API_URL = process.env.FISH_TTS_API_URL;
    envBackup.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    envBackup.ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
    envBackup.GOOGLE_SPEECH_API_KEY = process.env.GOOGLE_SPEECH_API_KEY;
    envBackup.GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
    envBackup.GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env.FISH_API_KEY = envBackup.FISH_API_KEY;
    process.env.FISH_API_URL = envBackup.FISH_API_URL;
    process.env.FISH_TTS_API_URL = envBackup.FISH_TTS_API_URL;
    process.env.OPENAI_API_KEY = envBackup.OPENAI_API_KEY;
    process.env.ELEVENLABS_API_KEY = envBackup.ELEVENLABS_API_KEY;
    process.env.GOOGLE_SPEECH_API_KEY = envBackup.GOOGLE_SPEECH_API_KEY;
    process.env.GOOGLE_API_KEY = envBackup.GOOGLE_API_KEY;
    process.env.GEMINI_API_KEY = envBackup.GEMINI_API_KEY;
  });

  it('usa fish con endpoint /audio/speech cuando se define provider fish', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'audio/mpeg' },
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      text: async () => '',
    });
    global.fetch = fetchMock;

    const out = await assistant.synthesizeSpeech({
      provider: 'fish',
      text: 'hola mundo',
      apiKey: 'fish-key',
      apiUrl: 'https://fish.example/v1',
      model: 's2-pro',
      voice: 'fish-male-voice-id',
      format: 'mp3',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [endpoint, req] = fetchMock.mock.calls[0];
    expect(String(endpoint)).toBe('https://fish.example/v1/audio/speech');
    expect(req?.headers?.Authorization).toBe('Bearer fish-key');
    const payload = JSON.parse(String(req?.body || '{}'));
    expect(payload.model).toBe('s2-pro');
    expect(payload.voice || payload.voice_id).toBe('fish-male-voice-id');
    expect(out?.audioBase64).toBeTruthy();
    expect(out?.provider).toBe('fish');
  });

  it('lanza NO_TTS_API_KEY cuando fish es seleccionado sin key disponible', async () => {
    process.env.FISH_API_KEY = '';
    process.env.FISH_API_URL = '';
    process.env.FISH_TTS_API_URL = '';
    process.env.OPENAI_API_KEY = '';
    process.env.ELEVENLABS_API_KEY = '';
    process.env.GOOGLE_SPEECH_API_KEY = '';
    process.env.GOOGLE_API_KEY = '';
    process.env.GEMINI_API_KEY = '';

    await expect(assistant.synthesizeSpeech(
      { text: 'Hola mundo' },
      { provider: 'fish', apiUrl: 'https://fish.example/v1' }
    )).rejects.toMatchObject({ code: 'NO_TTS_API_KEY' });
  });
});
