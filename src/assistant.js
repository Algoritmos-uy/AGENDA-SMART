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
};

const ELEVENLABS_API_URL = process.env.ELEVENLABS_API_URL || 'https://api.elevenlabs.io/v1';
const ELEVENLABS_TTS_URL = process.env.ELEVENLABS_TTS_API_URL || joinUrl(ELEVENLABS_API_URL, '/text-to-speech');
const ELEVENLABS_TTS_MODEL = process.env.ELEVENLABS_TTS_MODEL || 'eleven_v3';
const ELEVENLABS_DEFAULT_VOICE = process.env.ELEVENLABS_TTS_VOICE || 'JBFqnCBsd6RMkjVDRZzb';
const ELEVENLABS_DEFAULT_OUTPUT = process.env.ELEVENLABS_TTS_OUTPUT_FORMAT || 'mp3_44100_128';
const ELEVENLABS_STT_URL = process.env.ELEVENLABS_STT_API_URL || joinUrl(ELEVENLABS_API_URL, '/speech-to-text');
const ELEVENLABS_STT_MODEL = process.env.ELEVENLABS_STT_MODEL || 'scribe_v1';
const OPENAI_API_URL = process.env.OPENAI_API_URL || 'https://api.openai.com/v1';
const OPENAI_STT_URL = process.env.OPENAI_STT_API_URL || joinUrl(OPENAI_API_URL, '/audio/transcriptions');
const OPENAI_STT_MODEL = process.env.OPENAI_STT_MODEL || 'gpt-4o-mini-transcribe';
const OPENAI_TTS_URL = process.env.OPENAI_TTS_API_URL || joinUrl(OPENAI_API_URL, '/audio/speech');
const OPENAI_TTS_MODEL = process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts';
const OPENAI_TTS_VOICE = process.env.OPENAI_TTS_VOICE || 'shimmer';
const FISH_API_URL = process.env.FISH_API_URL || '';
const FISH_TTS_URL = process.env.FISH_TTS_API_URL || '';
const FISH_TTS_MODEL = process.env.FISH_TTS_MODEL || 'fish-speech-1.5';
const FISH_TTS_VOICE = process.env.FISH_TTS_VOICE || 'default';
const GOOGLE_STT_URL = process.env.GOOGLE_STT_API_URL || 'https://speech.googleapis.com/v1/speech:recognize';
const GOOGLE_TTS_URL = process.env.GOOGLE_TTS_API_URL || 'https://texttospeech.googleapis.com/v1/text:synthesize';
const GEMINI_API_URL = process.env.GEMINI_API_URL || 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_TTS_MODEL = process.env.GEMINI_TTS_MODEL || 'gemini-3.1-flash-tts-preview';
const GEMINI_TTS_VOICE = process.env.GEMINI_TTS_VOICE || 'Kore';

function joinUrl(base = '', suffix = '') {
  const b = String(base || '').trim().replace(/\/+$/, '');
  if (!b) return '';
  const s = String(suffix || '').trim().replace(/^\/+/, '');
  if (!s) return b;
  return `${b}/${s}`;
}

function resolveFishTtsUrl(apiUrl = '') {
  const base = String(apiUrl || '').trim();
  if (!base) return '';
  if (/\/audio\/speech(?:\?|$)/i.test(base)) return base;
  return joinUrl(base, '/audio/speech');
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
        const key = trimmed.slice(0, eq).trim().replace(/^\uFEFF/, '');
        const value = trimmed.slice(eq + 1).trim();
        const unquoted = value.replace(/^(["'])(.*)\1$/, '$2');
        if (key) {
          // Priorizar .env del proyecto para evitar usar credenciales obsoletas del entorno del sistema.
          process.env[key] = unquoted;
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

function normalizeSttProvider(value = '') {
  const raw = String(value || '').toLowerCase().trim();
  if (!raw || raw === 'auto') return 'elevenlabs';
  if (['11labs', 'elevenlabs', 'eleven'].includes(raw)) return 'elevenlabs';
  if (['openai', 'gpt-4o-mini-transcribe', 'gpt4o-mini-transcribe', 'gpt4o', 'gpt-4o'].includes(raw)) return 'openai';
  if (['google', 'google-speech', 'google_speech', 'google speech'].includes(raw)) return 'google';
  return 'elevenlabs';
}

function resolveTranscribeConfig(options = {}) {
  const provider = normalizeSttProvider(options.provider || process.env.STT_PROVIDER || 'elevenlabs');

  if (provider === 'openai') {
    const apiKey = String(options.apiKey || process.env.OPENAI_API_KEY || '').trim();
    const apiUrl = String(options.apiUrl || OPENAI_STT_URL).trim();
    const model = String(options.model || OPENAI_STT_MODEL).trim();
    if (!apiKey || !apiUrl) {
      const err = new Error('Falta OPENAI_API_KEY para transcripción de voz');
      err.code = 'NO_STT_API_KEY';
      throw err;
    }
    return { provider: 'openai', apiKey, apiUrl, model };
  }

  if (provider === 'google') {
    const apiKey = String(options.apiKey || process.env.GOOGLE_SPEECH_API_KEY || process.env.GOOGLE_API_KEY || '').trim();
    const apiUrl = String(options.apiUrl || GOOGLE_STT_URL).trim();
    if (!apiKey || !apiUrl) {
      const err = new Error('Falta GOOGLE_SPEECH_API_KEY para transcripción de voz');
      err.code = 'NO_STT_API_KEY';
      throw err;
    }
    return { provider: 'google', apiKey, apiUrl, model: 'google-speech-v1' };
  }

  const apiKey = String(options.apiKey || process.env.ELEVENLABS_API_KEY || '').trim();
  if (!apiKey || !ELEVENLABS_STT_URL) {
    const err = new Error('Falta ELEVENLABS_API_KEY para transcripción de voz');
    err.code = 'NO_STT_API_KEY';
    throw err;
  }
  return {
    provider: 'elevenlabs',
    apiKey,
    apiUrl: String(options.apiUrl || ELEVENLABS_STT_URL).trim(),
    model: String(options.model || ELEVENLABS_STT_MODEL).trim(),
  };
}

function normalizeTtsProvider(value = '') {
  const raw = String(value || '').toLowerCase().trim();
  if (raw === '11labs') return 'elevenlabs';
  if (['fish', 'fishaudio', 'fish-audio', 'fishspeech', 'fish-speech'].includes(raw)) return 'fish';
  if (['openai', 'gpt-4o-mini-tts', 'gpt4o-mini-tts'].includes(raw)) return 'openai';
  if (['google', 'google-speech', 'google speech'].includes(raw)) return 'google';
  if (['gemini', 'gemini-tts', 'gemini-3.1-flash-tts-preview', 'gemini flash tts'].includes(raw)) return 'gemini';
  if (raw === 'auto' || raw === 'elevenlabs') return raw;
  return 'auto';
}

function resolveGeminiTtsUrl(apiUrl = '', model = '') {
  const selectedModel = String(model || GEMINI_TTS_MODEL).trim() || GEMINI_TTS_MODEL;
  const raw = String(apiUrl || '').trim();
  if (!raw) {
    return `${GEMINI_API_URL}/models/${encodeURIComponent(selectedModel)}:generateContent`;
  }
  if (/:generateContent(?:\?|$)/i.test(raw)) return raw;
  if (/\/models\//i.test(raw)) return `${raw.replace(/\/+$/, '')}:generateContent`;
  return `${raw.replace(/\/+$/, '')}/models/${encodeURIComponent(selectedModel)}:generateContent`;
}

function isTtsProviderAvailable(provider = 'auto', options = {}) {
  if (provider === 'elevenlabs') {
    return !!String(options.elevenlabsApiKey || process.env.ELEVENLABS_API_KEY || '').trim() && !!ELEVENLABS_TTS_URL;
  }
  if (provider === 'openai') {
    return !!String(options.openaiApiKey || process.env.OPENAI_API_KEY || '').trim() && !!OPENAI_TTS_URL;
  }
  if (provider === 'fish') {
    const fishKey = String(options.fishApiKey || options.apiKey || process.env.FISH_API_KEY || '').trim();
    const fishUrl = resolveFishTtsUrl(String(options.fishApiUrl || options.apiUrl || FISH_TTS_URL || FISH_API_URL).trim());
    return !!fishKey && !!fishUrl;
  }
  if (provider === 'google') {
    return !!String(options.googleApiKey || process.env.GOOGLE_SPEECH_API_KEY || process.env.GOOGLE_API_KEY || '').trim() && !!GOOGLE_TTS_URL;
  }
  if (provider === 'gemini') {
    return !!String(options.geminiApiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim() && !!resolveGeminiTtsUrl(process.env.GEMINI_TTS_API_URL, process.env.GEMINI_TTS_MODEL);
  }
  return false;
}

function resolveTtsProviders({ provider, apiKey } = {}) {
  const selected = normalizeTtsProvider(provider || process.env.VOICE_PROVIDER || 'auto');
  const directKey = String(apiKey || '').trim();
  const defaultOrder = ['elevenlabs', 'fish', 'openai', 'google', 'gemini'];
  const ordered = selected === 'auto'
    ? defaultOrder
    : [selected, ...defaultOrder.filter((p) => p !== selected)];

  const available = ordered.filter((p) => {
    if (selected !== 'auto' && p === selected && directKey) return true;
    return isTtsProviderAvailable(p, {
    elevenlabsApiKey: process.env.ELEVENLABS_API_KEY,
    fishApiKey: process.env.FISH_API_KEY,
    fishApiUrl: process.env.FISH_TTS_API_URL || process.env.FISH_API_URL,
    openaiApiKey: process.env.OPENAI_API_KEY,
    googleApiKey: process.env.GOOGLE_SPEECH_API_KEY || process.env.GOOGLE_API_KEY,
    geminiApiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
    });
  });
  if (!available.length) {
  const err = new Error('Falta API key para síntesis de voz (ELEVENLABS_API_KEY, FISH_API_KEY, OPENAI_API_KEY, GOOGLE_SPEECH_API_KEY o GEMINI_API_KEY)');
    err.code = 'NO_TTS_API_KEY';
    throw err;
  }
  return available;
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
  const { provider, apiKey, apiUrl, model } = options;
  const { provider: sttProvider, apiKey: resolvedKey, apiUrl: resolvedUrl, model: resolvedModel } = resolveTranscribeConfig({
    provider,
    apiKey,
    apiUrl,
    model,
  });

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

  let res;
  if (sttProvider === 'google') {
    const base64Audio = Buffer.from(bytes).toString('base64');
    const langCode = language.startsWith('pt') ? 'pt-BR' : language.startsWith('en') ? 'en-US' : 'es-ES';
    const endpoint = `${resolvedUrl}${resolvedUrl.includes('?') ? '&' : '?'}key=${encodeURIComponent(resolvedKey)}`;
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        config: {
          encoding: mimeType.includes('wav') ? 'LINEAR16' : mimeType.includes('ogg') ? 'OGG_OPUS' : 'WEBM_OPUS',
          languageCode: langCode,
          enableAutomaticPunctuation: true,
        },
        audio: {
          content: base64Audio,
        },
      }),
    });
  } else {
    const blob = new Blob([bytes], { type: mimeType });
    const form = new FormData();
    const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('wav') ? 'wav' : mimeType.includes('mp3') ? 'mp3' : 'webm';
    form.append('file', blob, `voice.${ext}`);
    form.append('model_id', resolvedModel);
    form.append('model', resolvedModel);
    form.append('language', language.startsWith('pt') ? 'pt' : language.startsWith('en') ? 'en' : 'es');

    const headers = sttProvider === 'openai'
      ? { Authorization: `Bearer ${resolvedKey}` }
      : { 'xi-api-key': resolvedKey };

    res = await fetch(resolvedUrl, {
      method: 'POST',
      headers,
      body: form,
    });
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`${sttProvider} STT error ${res.status}: ${text}`);
    err.code = 'STT_ERROR';
    throw err;
  }

  const contentType = String(res.headers.get('content-type') || '').toLowerCase();
  const data = contentType.includes('application/json')
    ? await res.json().catch(() => ({}))
    : await res.text().then((raw) => ({ text: raw })).catch(() => ({}));

  const text = (
    data?.text
    || data?.transcript
    || data?.results?.[0]?.alternatives?.[0]?.transcript
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
  const directPart = data?.candidates?.[0]?.content?.parts?.find((part) => part?.inlineData?.data || part?.inline_data?.data);
  const inlineData = directPart?.inlineData || directPart?.inline_data || {};
  const audioBase64 = data?.audio_base64
    || data?.audioBase64
    || data?.audio
    || data?.data?.audio
    || data?.result?.audio
    || inlineData?.data
    || data?.audioContent
    || '';
  const mimeType = data?.mime_type
    || data?.mimeType
    || data?.format
    || inlineData?.mimeType
    || inlineData?.mime_type
    || 'audio/mpeg';

  if (!audioBase64) return null;
  return {
    audioBase64: String(audioBase64),
    mimeType: String(mimeType || 'audio/mpeg'),
  };
}

function normalizeFishBaseUrl(raw = '') {
  return String(raw || '').trim().replace(/\/+$/, '');
}

function buildFishUrlCandidates(apiUrl = '') {
  const base = normalizeFishBaseUrl(
    apiUrl || process.env.FISH_API_URL || process.env.FISH_TTS_API_URL || ''
  );
  if (!base) return [];
  if (/\/v1\/tts$/i.test(base))
    return [base, base.replace(/\/v1\/tts$/i, '/audio/speech')];
  if (/\/audio\/speech$/i.test(base))
    return [base, base.replace(/\/audio\/speech$/i, '/v1/tts')];
  return [`${base}/audio/speech`, `${base}/v1/tts`];
}

function buildFishPayload(endpoint, { text, model, voice, format }) {
  if (/\/v1\/tts$/i.test(endpoint)) {
    return {
      text: String(text || ''),
      format: String(format || 'mp3'),
      temperature: 0.8,
      top_p: 0.8,
      streaming: false,
      ...(voice ? { reference_id: String(voice) } : { reference_id: FISH_TTS_VOICE }),
    };
  }
  return {
    model: String(model || FISH_TTS_MODEL),
    input: String(text || ''),
    text: String(text || ''),
    voice: String(voice || FISH_TTS_VOICE),
    voice_id: String(voice || FISH_TTS_VOICE),
    format: String(format || 'mp3'),
    response_format: String(format || 'mp3'),
  };
}

async function synthesizeFishTtsDual({ text, apiKey, apiUrl, model, voice, format = 'mp3' }) {
  const candidates = buildFishUrlCandidates(apiUrl);
  if (!candidates.length) {
    const err = new Error('FISH_API_URL_MISSING');
    err.code = 'FISH_API_URL_MISSING';
    throw err;
  }

  let lastError = null;
  for (const endpoint of candidates) {
    try {
      const body = buildFishPayload(endpoint, { text, model, voice, format });
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg,audio/*,*/*',
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const raw = await res.text().catch(() => '');
        const err = new Error(`Fish TTS ${res.status}: ${raw}`);
        err.status = res.status;
        if ([400, 404, 405, 415, 422].includes(res.status)) {
          lastError = err;
          continue;
        }
        throw err;
      }

      const arr = new Uint8Array(await res.arrayBuffer());
      if (!arr?.length) throw new Error('EMPTY_TTS_AUDIO');

      return {
        audioBase64: Buffer.from(arr).toString('base64'),
        mimeType: res.headers.get('content-type') || 'audio/mpeg',
        provider: 'fish',
      };
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new Error('FISH_TTS_FAILED');
}

async function synthesizeSpeech(payload = {}) {
  const { text = '', language = 'es', voice, format = 'mp3' } = payload;
  const cleanText = String(text || '').trim();
  if (!cleanText) {
    const err = new Error('Texto vacío para síntesis de voz');
    err.code = 'EMPTY_TTS_TEXT';
    throw err;
  }

  // 'options' ahora es el mismo payload, corrigiendo el no-undef
  const options = payload;

  const providers = resolveTtsProviders({
    provider: options.provider || options.ttsProvider,
    apiKey: options.apiKey,
  });

  void language;
  const errors = [];

  for (const provider of providers) {
    try {
      let res;
      if (provider === 'elevenlabs') {
        const elevenlabsKey = String(options.apiKey || process.env.ELEVENLABS_API_KEY || '').trim();
        if (!elevenlabsKey) {
          const err = new Error('Falta ELEVENLABS_API_KEY para TTS');
          err.code = 'NO_TTS_API_KEY';
          throw err;
        }
        const voiceId = voice || ELEVENLABS_DEFAULT_VOICE;
        const outputFormat = format === 'mp3' ? ELEVENLABS_DEFAULT_OUTPUT : format;
        const endpoint = `${joinUrl(ELEVENLABS_TTS_URL, `/${voiceId}`)}?output_format=${encodeURIComponent(outputFormat)}`;
        res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'audio/mpeg',
            'xi-api-key': elevenlabsKey,
          },
          body: JSON.stringify({ text: cleanText, model_id: ELEVENLABS_TTS_MODEL }),
        });
      } else if (provider === 'openai') {
        const apiKey = String(options.apiKey || process.env.OPENAI_API_KEY || '').trim();
        if (!apiKey) {
          const err = new Error('Falta OPENAI_API_KEY para TTS');
          err.code = 'NO_TTS_API_KEY';
          throw err;
        }
        const model = String(options.model || OPENAI_TTS_MODEL).trim();
        const voiceId = String(voice || options.voice || OPENAI_TTS_VOICE).trim();
        res = await fetch(String(options.apiUrl || OPENAI_TTS_URL).trim(), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({ model, input: cleanText, voice: voiceId, format }),
        });
      } else if (provider === 'fish') {
        const apiKey = String(options.apiKey || process.env.FISH_API_KEY || '').trim();
        if (!apiKey) {
          const err = new Error('NO_TTS_API_KEY');
          err.code = 'NO_TTS_API_KEY';
          throw err;
        }
        // Si fish falla con provider explícito, propaga el error sin fallback
        const fishResult = await synthesizeFishTtsDual({
          text: cleanText,
          apiKey,
          apiUrl: String(options.apiUrl || process.env.FISH_API_URL || process.env.FISH_TTS_API_URL || '').trim(),
          model: options.model,
          voice: voice || options.voice || options.voice_id,
          format,
        });
        return fishResult;
      } else if (provider === 'google') {
        const apiKey = String(options.apiKey || process.env.GOOGLE_SPEECH_API_KEY || process.env.GOOGLE_API_KEY || '').trim();
        if (!apiKey) {
          const err = new Error('Falta GOOGLE_SPEECH_API_KEY para TTS');
          err.code = 'NO_TTS_API_KEY';
          throw err;
        }
        const langCode = language.startsWith('pt') ? 'pt-BR' : language.startsWith('en') ? 'en-US' : 'es-ES';
        const endpoint = `${String(options.apiUrl || GOOGLE_TTS_URL).trim()}?key=${encodeURIComponent(apiKey)}`;
        res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: { text: cleanText },
            voice: { languageCode: langCode, ssmlGender: 'FEMALE' },
            audioConfig: { audioEncoding: 'MP3' },
          }),
        });
      } else if (provider === 'gemini') {
        const apiKey = String(options.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();
        if (!apiKey) {
          const err = new Error('Falta GEMINI_API_KEY para TTS');
          err.code = 'NO_TTS_API_KEY';
          throw err;
        }
        const model = String(options.model || GEMINI_TTS_MODEL).trim() || GEMINI_TTS_MODEL;
        const voiceName = String(voice || options.voice || GEMINI_TTS_VOICE).trim() || GEMINI_TTS_VOICE;
        const endpointBase = resolveGeminiTtsUrl(String(options.apiUrl || process.env.GEMINI_TTS_API_URL || '').trim(), model);
        const endpoint = `${endpointBase}${endpointBase.includes('?') ? '&' : '?'}key=${encodeURIComponent(apiKey)}`;
        res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: cleanText }] }],
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
            },
          }),
        });
      } else {
        const err = new Error(`Proveedor TTS no soportado: ${provider}`);
        err.code = 'TTS_ERROR';
        throw err;
      }

      if (!res.ok) {
        const textError = await res.text().catch(() => '');
        const err = new Error(`${provider} TTS error ${res.status}: ${textError}`);
        err.code = 'TTS_ERROR';
        throw err;
      }

      const contentType = String(res.headers.get('content-type') || '').toLowerCase();
      if (contentType.startsWith('audio/')) {
        const buffer = Buffer.from(await res.arrayBuffer());
        return {
          provider,
          mimeType: contentType.split(';')[0],
          audioBase64: buffer.toString('base64'),
        };
      }

      const data = await res.json().catch(() => ({}));
      const decoded = decodeAudioFromJson(data);
      if (decoded) {
        return {
          provider,
          ...decoded,
        };
      }

      if (provider === 'google' && data?.audioContent) {
        return {
          provider,
          audioBase64: String(data.audioContent),
          mimeType: 'audio/mpeg',
        };
      }

      const err = new Error(`${provider} TTS: respuesta sin audio utilizable`);
      err.code = 'EMPTY_TTS_AUDIO';
      throw err;
    } catch (e) {
      errors.push(e);
    }
  }

  const joined = errors.map((e) => e?.message || '').filter(Boolean).slice(0, 3).join(' | ');
  const err = new Error(joined || 'TTS error: no se pudo sintetizar audio');
  err.code = errors[errors.length - 1]?.code || 'TTS_ERROR';
  throw err;
}

module.exports = { callAssistant, callAssistantStream, transcribeAudio, synthesizeSpeech };
