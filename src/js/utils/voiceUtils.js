import { normalizeLocale } from './agendaDateUtils.js';

export function getVoiceLang(locale = 'es') {
  const lc = String(locale || '').toLowerCase();
  if (lc.startsWith('en')) return 'en-US';
  if (lc.startsWith('pt')) return 'pt-BR';
  return 'es-UY';
}

export function cleanVoiceTranscript(text = '') {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function hasVoiceRecognitionSupport(win = window) {
  return !!(win?.SpeechRecognition || win?.webkitSpeechRecognition);
}

const VOICE_ERRORS = {
  es: {
    notAllowed: 'Permiso de micrófono denegado por el sistema o el navegador.',
    audioCapture: 'No se detectó micrófono disponible.',
    noSpeech: 'No se detectó voz. Intenta nuevamente.',
    network: 'Error de red del servicio de reconocimiento de voz. Verifica conexión a internet e inténtalo de nuevo.',
    aborted: 'Reconocimiento cancelado.',
    unknown: 'Error de reconocimiento de voz.',
  },
  en: {
    notAllowed: 'Microphone permission was denied by the system or browser.',
    audioCapture: 'No microphone was detected.',
    noSpeech: 'No speech detected. Please try again.',
    network: 'Voice recognition network error. Check your internet connection and try again.',
    aborted: 'Recognition was canceled.',
    unknown: 'Voice recognition error.',
  },
  pt: {
    notAllowed: 'Permissão de microfone negada pelo sistema ou navegador.',
    audioCapture: 'Nenhum microfone foi detectado.',
    noSpeech: 'Nenhuma fala detectada. Tente novamente.',
    network: 'Erro de rede no reconhecimento de voz. Verifique sua conexão e tente novamente.',
    aborted: 'Reconhecimento cancelado.',
    unknown: 'Erro de reconhecimento de voz.',
  },
};

export function mapVoiceErrorCode(code = 'unknown', locale = 'es') {
  const c = String(code || 'unknown');
  const lang = normalizeLocale(locale);
  const m = VOICE_ERRORS[lang] || VOICE_ERRORS.es;
  if (c === 'not-allowed' || c === 'service-not-allowed') return m.notAllowed;
  if (c === 'audio-capture') return m.audioCapture;
  if (c === 'no-speech') return m.noSpeech;
  if (c === 'network') return m.network;
  if (c === 'aborted') return m.aborted;
  return m.unknown;
}
