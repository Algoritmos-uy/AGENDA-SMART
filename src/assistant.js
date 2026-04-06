const fs = require('fs');
const path = require('path');
const { normalizeMessages } = require('./assistantGuards');
const telemetry = require('./assistantTelemetry');

loadLocalEnv();

const PROVIDERS = {
  deepseek: {
    id: 'deepseek',
    envKey: 'DEEPSEEK_API_KEY',
    defaultModel: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    defaultUrl: process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions',
  },
  openai: {
    id: 'openai',
    envKey: 'OPENAI_API_KEY',
    defaultModel: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
    defaultUrl: process.env.OPENAI_API_URL || 'https://api.openai.com/v1/chat/completions',
  },
};

const OPENAI_TRANSCRIBE_URL = process.env.OPENAI_TRANSCRIBE_API_URL || 'https://api.openai.com/v1/audio/transcriptions';
const OPENAI_TRANSCRIBE_MODEL = process.env.OPENAI_STT_MODEL || 'gpt-4o-mini-transcribe';
const OPENAI_TTS_URL = process.env.OPENAI_TTS_API_URL || 'https://api.openai.com/v1/audio/speech';
const OPENAI_TTS_MODEL = process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts';

const FISH_API_URL = process.env.FISH_API_URL || '';
const FISH_STT_URL = process.env.FISH_STT_API_URL || joinUrl(FISH_API_URL, '/v1/audio/transcriptions');
const FISH_TTS_URL = process.env.FISH_TTS_API_URL || joinUrl(FISH_API_URL, '/v1/audio/speech');
const FISH_STT_MODEL = process.env.FISH_STT_MODEL || 'sensevoice';
const FISH_TTS_MODEL = process.env.FISH_TTS_MODEL || 'speech-1';
const FISH_DEFAULT_VOICE = process.env.FISH_TTS_VOICE || 'alloy';

function joinUrl(base = '', suffix = '') {
  const b = String(base || '').trim().replace(/\/+$/, '');
  if (!b) return '';
  const s = String(suffix || '').trim().replace(/^\/+/, '');
  if (!s) return b;
  return `${b}/${s}`;
}

function loadLocalEnv() {
  const candidates = [
    path.join(__dirname, '..', '.env'), // ruta en dev
    path.resolve(process.cwd(), '.env'), // por si el cwd cambia
    path.join(process.resourcesPath || '', '.env'), // ruta en app empaquetada
  ].filter(Boolean);

  for (const envPath of candidates) {
    try {
      if (!fs.existsSync(envPath)) continue;
      const raw = fs.readFileSync(envPath, 'utf8');
      raw.split(/\r?\n/).forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const eq = trimmed.indexOf('=');
        if (eq === -1) return;
        const key = trimmed.slice(0, eq).trim();
        const value = trimmed.slice(eq + 1).trim();
        if (key && !(key in process.env)) {
          process.env[key] = value;
        }
      });
      return; // ya cargado
    } catch (e) {
      console.warn('No se pudo cargar .env en', envPath, e);
    }
  }
}

function resolveProviderConfig({ provider = 'deepseek', model, apiUrl } = {}) {
  const providerKey = PROVIDERS[provider] ? provider : 'deepseek';
  const cfg = PROVIDERS[providerKey];
  const resolvedKey = process.env[cfg.envKey];
  if (!resolvedKey) {
    const err = new Error(`Falta API key para ${providerKey}`);
    err.code = 'NO_API_KEY';
    throw err;
  }
  return {
    provider: providerKey,
    apiKey: resolvedKey,
    model: model || cfg.defaultModel,
    apiUrl: apiUrl || cfg.defaultUrl,
  };
}

function resolveTranscribeConfig() {
  const fishKey = process.env.FISH_API_KEY;
  if (fishKey && FISH_STT_URL) {
    return {
      provider: 'fish',
      apiKey: fishKey,
      apiUrl: FISH_STT_URL,
      model: FISH_STT_MODEL,
    };
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    const err = new Error('Falta OPENAI_API_KEY o FISH_API_KEY para transcripción de voz');
    err.code = 'NO_STT_API_KEY';
    throw err;
  }

  return {
    provider: 'openai',
    apiKey: openaiKey,
    apiUrl: OPENAI_TRANSCRIBE_URL,
    model: OPENAI_TRANSCRIBE_MODEL,
  };
}

function resolveTtsConfig({ provider } = {}) {
  const selected = provider || process.env.VOICE_PROVIDER || '';
  const fishKey = process.env.FISH_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if ((selected === 'fish' || (!selected && fishKey)) && fishKey && FISH_TTS_URL) {
    return {
      provider: 'fish',
      apiKey: fishKey,
      apiUrl: FISH_TTS_URL,
      model: FISH_TTS_MODEL,
      voice: FISH_DEFAULT_VOICE,
    };
  }

  if (openaiKey) {
    return {
      provider: 'openai',
      apiKey: openaiKey,
      apiUrl: OPENAI_TTS_URL,
      model: OPENAI_TTS_MODEL,
      voice: 'alloy',
    };
  }

  const err = new Error('Falta OPENAI_API_KEY o FISH_API_KEY para síntesis de voz');
  err.code = 'NO_TTS_API_KEY';
  throw err;
}

async function callAssistant(messages = [], options = {}) {
  const { apiKey, model, apiUrl, provider } = resolveProviderConfig(options);
  const retry = !!options?.retry;
  const safeMessages = normalizeMessages(messages);
  const totalChars = safeMessages.reduce((acc, m) => acc + m.content.length, 0);
  const attempt = telemetry.beginAttempt({
    provider,
    mode: 'chat',
    messageCount: safeMessages.length,
    totalChars,
    retry,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
  const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: safeMessages,
        temperature: 0.3,
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const err = new Error(`${provider} error ${res.status}: ${text}`);
      err.code = 'API_ERROR';
      throw err;
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content?.trim();
    if (!content) {
      const err = new Error('Respuesta vacía del asistente');
      err.code = 'EMPTY_RESPONSE';
      throw err;
    }
    telemetry.succeedAttempt(attempt, { outputChars: content.length });
    return content;
  } catch (error) {
    telemetry.failAttempt(attempt, error);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function callAssistantStream(messages = [], { onChunk, ...options } = {}) {
  const { apiKey, model, apiUrl, provider } = resolveProviderConfig(options);
  const retry = !!options?.retry;
  const safeMessages = normalizeMessages(messages);
  const totalChars = safeMessages.reduce((acc, m) => acc + m.content.length, 0);
  const attempt = telemetry.beginAttempt({
    provider,
    mode: 'stream',
    messageCount: safeMessages.length,
    totalChars,
    retry,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
  const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: safeMessages,
        temperature: 0.3,
        stream: true,
      }),
      signal: controller.signal,
    });

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '');
      const err = new Error(`${provider} error ${res.status}: ${text}`);
      err.code = 'API_ERROR';
      throw err;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let full = '';

    let reading = true;
    while (reading) {
      const { done, value } = await reader.read();
      if (done) {
        reading = false;
        continue;
      }
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').map(l => l.trim()).filter(Boolean);
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const payload = line.replace(/^data:\s*/, '');
        if (payload === '[DONE]') {
          onChunk?.({ done: true, content: full });
          telemetry.succeedAttempt(attempt, { outputChars: full.length });
          return full;
        }
        try {
          const json = JSON.parse(payload);
          const choice = json?.choices?.[0];
          const delta = choice?.delta?.content || choice?.message?.content || choice?.text || '';
          if (delta) {
            full += delta;
            onChunk?.({ delta, content: full });
          }
        } catch (_e) {
          // Si no es JSON válido, tratar el payload como texto plano para no perder contenido
          if (payload && payload !== '[DONE]') {
            full += payload;
            onChunk?.({ delta: payload, content: full });
          }
          continue;
        }
      }
    }

    onChunk?.({ done: true, content: full });
    telemetry.succeedAttempt(attempt, { outputChars: full.length });
    return full;
  } catch (error) {
    telemetry.failAttempt(attempt, error);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function transcribeAudio(payload = {}, options = {}) {
  const { provider } = options;
  void provider;
  const { apiKey, apiUrl, model } = resolveTranscribeConfig();

  const { audioBuffer, mimeType = 'audio/webm', language = 'es' } = payload || {};
  if (!audioBuffer) {
    const err = new Error('Audio inválido para transcripción');
    err.code = 'INVALID_AUDIO';
    throw err;
  }

  const bytes = audioBuffer instanceof ArrayBuffer
    ? new Uint8Array(audioBuffer)
    : Array.isArray(audioBuffer)
      ? Uint8Array.from(audioBuffer)
      : audioBuffer?.buffer instanceof ArrayBuffer
        ? new Uint8Array(audioBuffer.buffer)
        : null;

  if (!bytes || !bytes.length) {
    const err = new Error('Audio vacío para transcripción');
    err.code = 'EMPTY_AUDIO';
    throw err;
  }

  const blob = new Blob([bytes], { type: mimeType });
  const form = new FormData();
  form.append('file', blob, `voice.${mimeType.includes('ogg') ? 'ogg' : 'webm'}`);
  form.append('model', model);
  form.append('language', language.startsWith('pt') ? 'pt' : language.startsWith('en') ? 'en' : 'es');

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'X-API-Key': apiKey,
    },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`STT error ${res.status}: ${text}`);
    err.code = 'STT_ERROR';
    throw err;
  }

  const data = await res.json();

  const text = (
    data?.text
    || data?.transcript
    || data?.result
    || ''
  ).trim();
  if (!text) {
    const err = new Error('Transcripción vacía');
    err.code = 'EMPTY_TRANSCRIPT';
    throw err;
  }

  return text;
}

function decodeAudioFromJson(data = {}) {
  const audioBase64 = data?.audio_base64
    || data?.audioBase64
    || data?.audio
    || data?.data?.audio
    || data?.result?.audio
    || '';
  const mimeType = data?.mime_type
    || data?.mimeType
    || data?.format
    || 'audio/mpeg';

  if (!audioBase64) return null;
  return {
    audioBase64: String(audioBase64),
    mimeType: String(mimeType || 'audio/mpeg'),
  };
}

async function synthesizeSpeech(payload = {}, options = {}) {
  const { text = '', language = 'es', voice, format = 'mp3' } = payload;
  const cleanText = String(text || '').trim();
  if (!cleanText) {
    const err = new Error('Texto vacío para síntesis de voz');
    err.code = 'EMPTY_TTS_TEXT';
    throw err;
  }

  const cfg = resolveTtsConfig(options);
  const body = {
    model: cfg.model,
    input: cleanText,
    voice: voice || cfg.voice,
    format,
    language: language.startsWith('pt') ? 'pt' : language.startsWith('en') ? 'en' : 'es',
  };

  const res = await fetch(cfg.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
      'X-API-Key': cfg.apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const textError = await res.text().catch(() => '');
    const err = new Error(`TTS error ${res.status}: ${textError}`);
    err.code = 'TTS_ERROR';
    throw err;
  }

  const contentType = String(res.headers.get('content-type') || '').toLowerCase();

  if (contentType.startsWith('audio/')) {
    const buffer = Buffer.from(await res.arrayBuffer());
    return {
      provider: cfg.provider,
      mimeType: contentType.split(';')[0],
      audioBase64: buffer.toString('base64'),
    };
  }

  const data = await res.json().catch(() => ({}));
  const decoded = decodeAudioFromJson(data);
  if (decoded) {
    return {
      provider: cfg.provider,
      ...decoded,
    };
  }

  const err = new Error('Respuesta de TTS sin audio utilizable');
  err.code = 'EMPTY_TTS_AUDIO';
  throw err;
}

module.exports = { callAssistant, callAssistantStream, transcribeAudio, synthesizeSpeech };
