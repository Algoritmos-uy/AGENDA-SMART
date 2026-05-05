import { describe, it, expect, vi } from 'vitest';
import { Notifier, getAudioCandidates, getAlertSpeechText } from '../../src/js/notifications.js';

describe('notifications helpers', () => {
  it('arma candidatos de audio por idioma con fallback', () => {
    expect(getAudioCandidates('30', 'es')).toEqual([
      'assets/audio/evento-30.mp3',
    ]);

    expect(getAudioCandidates('30', 'en-US', 'feminine')).toEqual([
      'assets/audio/evento-30-en.mp3',
      'assets/audio/evento-30.mp3',
    ]);

    expect(getAudioCandidates('30', 'pt-BR', 'feminine')).toEqual([
      'assets/audio/evento-30-pt.mp3',
      'assets/audio/evento-30.mp3',
    ]);

    expect(getAudioCandidates('30', 'es', 'masculine')).toEqual([
      'assets/audio/m-evento-30-es.mp3',
      'assets/audio/evento-30.mp3',
    ]);

    expect(getAudioCandidates('30', 'en-US', 'masculine')).toEqual([
      'assets/audio/m-evento-30-en.mp3',
      'assets/audio/evento-30-en.mp3',
      'assets/audio/m-evento-30-es.mp3',
      'assets/audio/evento-30.mp3',
    ]);

    expect(getAudioCandidates('30', 'pt-BR', 'masculine')).toEqual([
      'assets/audio/m-evento-30-pt.mp3',
      'assets/audio/evento-30-pt.mp3',
      'assets/audio/m-evento-30-es.mp3',
      'assets/audio/evento-30.mp3',
    ]);

    expect(getAudioCandidates('15', 'en-US')).toEqual([
      'assets/audio/evento-15-en.mp3',
      'assets/audio/evento-15.mp3',
    ]);

    expect(getAudioCandidates('15', 'pt-BR')).toEqual([
      'assets/audio/evento-15-pt.mp3',
      'assets/audio/evento-15.mp3',
    ]);

    expect(getAudioCandidates('15', 'es', 'masculine')).toEqual([
      'assets/audio/m-evento-15-es.mp3',
      'assets/audio/evento-15.mp3',
    ]);

    expect(getAudioCandidates('15', 'en-US', 'masculine')).toEqual([
      'assets/audio/m-evento-15-en.mp3',
      'assets/audio/evento-15-en.mp3',
      'assets/audio/m-evento-15-es.mp3',
      'assets/audio/evento-15.mp3',
    ]);

    expect(getAudioCandidates('15', 'pt-BR', 'masculine')).toEqual([
      'assets/audio/m-evento-15-pt.mp3',
      'assets/audio/evento-15-pt.mp3',
      'assets/audio/m-evento-15-es.mp3',
      'assets/audio/evento-15.mp3',
    ]);

    expect(getAudioCandidates('generic', 'es', 'feminine')).toEqual([
      'assets/audio/f-evento-es.mp3',
    ]);

    expect(getAudioCandidates('generic', 'pt-BR', 'feminine')).toEqual([
      'assets/audio/f-evento-pt.mp3',
      'assets/audio/f-evento-es.mp3',
    ]);

    expect(getAudioCandidates('generic', 'en-US', 'feminine')).toEqual([
      'assets/audio/f-evento-en.mp3',
      'assets/audio/f-evento-es.mp3',
    ]);

    expect(getAudioCandidates('generic', 'es', 'masculine')).toEqual([
      'assets/audio/m-evento-es.mp3',
    ]);

    expect(getAudioCandidates('generic', 'pt-BR', 'masculine')).toEqual([
      'assets/audio/m-evento-pt.mp3',
      'assets/audio/m-evento-es.mp3',
    ]);

    expect(getAudioCandidates('generic', 'en-US', 'masculine')).toEqual([
      'assets/audio/m-evento-en.mp3',
      'assets/audio/m-evento-es.mp3',
    ]);
  });

  it('construye mensaje de voz localizado para alerta', () => {
    const es = getAlertSpeechText('es', { title: 'Reunión diaria' }, 5);
    expect(es).toContain('Recordatorio');
    expect(es).toContain('Reunión diaria');
    expect(es).toContain('5');

    const en = getAlertSpeechText('en-US', { title: 'Daily' }, 10);
    expect(en).toContain('Reminder');
    expect(en).toContain('Daily');

    const pt = getAlertSpeechText('pt-BR', {}, 3);
    expect(pt).toContain('Lembrete');
    expect(pt).toContain('3');
  });

  it('extrae evento desde extra.event cuando llega objeto completo', () => {
    const notifier = new Notifier();
    const event = notifier._extractEventFromExtra({
      event: {
        id: 'ev-1',
        title: 'Demo',
        date: '2026-05-01',
        start: '10:00',
        end: '11:00',
      },
    });

    expect(event).toEqual({
      id: 'ev-1',
      title: 'Demo',
      date: '2026-05-01',
      start: '10:00',
      end: '11:00',
    });
  });

  it('extrae evento desde campos planos cuando Android no mantiene objeto anidado', () => {
    const notifier = new Notifier();
    const event = notifier._extractEventFromExtra({
      eventId: 'ev-2',
      title: 'Recordatorio',
      date: '2026-05-02',
      start: '14:30',
      end: '15:00',
    });

    expect(event).toEqual({
      id: 'ev-2',
      title: 'Recordatorio',
      date: '2026-05-02',
      start: '14:30',
      end: '15:00',
    });
  });

  it('prioriza metadata de minutos antes sobre extra para evitar fallback erróneo a 10', () => {
    const notifier = new Notifier();
    const minutes = notifier._resolveMinutesBefore({ minutesBefore: 10 }, { minutesBefore: 30 });
    expect(minutes).toBe(30);
  });

  it('extrae id nativo de notificación desde distintos formatos', () => {
    const notifier = new Notifier();
    expect(notifier._extractNotificationId({ id: 1234 })).toBe(1234);
    expect(notifier._extractNotificationId({ notification: { id: '4567' } })).toBe(4567);
    expect(notifier._extractNotificationId({ notificationId: 'bad' })).toBeNull();
  });

  it('deriva minutos desde channelId cuando Android no manda extra', () => {
    const notifier = new Notifier();
    expect(notifier._extractMinutesFromChannelId('agenda_reminder_30m')).toBe(30);
    expect(notifier._extractMinutesFromChannelId('agenda_reminder_15m')).toBe(15);
    expect(notifier._extractMinutesFromChannelId('agenda_reminder_default')).toBeNull();
  });

  it('usa canal custom por idioma y género para recordatorios distintos de 15/30', () => {
    const notifier = new Notifier();

    const esFemale = notifier._notificationChannelFor(45, 'es', 'feminine');
    expect(esFemale?.sound).toBe('f_evento_es');

    const ptFemale = notifier._notificationChannelFor(45, 'pt-BR', 'feminine');
    expect(ptFemale?.sound).toBe('f_evento_pt');

    const enFemale = notifier._notificationChannelFor(45, 'en-US', 'feminine');
    expect(enFemale?.sound).toBe('f_evento_en');

    const esMale = notifier._notificationChannelFor(45, 'es', 'masculine');
    expect(esMale?.sound).toBe('m_evento_es');

    const ptMale = notifier._notificationChannelFor(45, 'pt-BR', 'masculine');
    expect(ptMale?.sound).toBe('m_evento_pt');

    const enMale = notifier._notificationChannelFor(45, 'en-US', 'masculine');
    expect(enMale?.sound).toBe('m_evento_en');
  });

  it('repite alerta solo 3 veces y luego se detiene', () => {
    vi.useFakeTimers();

    const notifier = new Notifier();
    const event = { id: 'ev-repeat', title: 'Demo', date: '2026-05-04', start: '09:00', end: '10:00' };

    const playSpy = vi.spyOn(notifier, '_playAlertSound').mockImplementation(() => {
      notifier.activeAudio = null;
    });
    vi.spyOn(notifier, '_tryVibrate').mockImplementation(() => {});
    vi.spyOn(notifier, '_showAlertModal').mockImplementation(() => {});

    notifier._startAlertLoop(event, 30);
    expect(playSpy).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(3000);
    expect(playSpy).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(3000);
    expect(playSpy).toHaveBeenCalledTimes(3);

    vi.advanceTimersByTime(3000);
    expect(playSpy).toHaveBeenCalledTimes(3);
    expect(notifier.activeAlert).toBeNull();

    vi.useRealTimers();
  });

  it('programa reminder custom nativo y resuelve canal/sonido según idioma+género', async () => {
    const notifier = new Notifier();
    notifier.setLocale('pt-BR');

    const originalStorage = globalThis.localStorage;
    globalThis.localStorage = {
      getItem: vi.fn((key) => {
        if (key === 'coordinalia-config') return JSON.stringify({ ttsGender: 'masculine' });
        return '';
      }),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(),
      length: 0,
    };

    const plugin = { schedule: vi.fn().mockResolvedValue(undefined) };
    const fireAt = Date.now() + 60_000;

    notifier._scheduleNativeNotification({
      id: 'ev-custom-1',
      title: 'Evento custom',
      date: '2026-05-06',
      start: '10:00',
      end: '11:00',
    }, 45, fireAt, plugin);

    expect(plugin.schedule).toHaveBeenCalledTimes(1);
    const payload = plugin.schedule.mock.calls[0][0]?.notifications?.[0];
    expect(payload.channelId).toContain('agenda_reminder_custom_pt_m');
    expect(payload.sound).toBe('m_evento_pt.mp3');

    globalThis.localStorage = originalStorage;
  });

  it('migra canales Android legacy cuando cambia schema y evita borrado repetido luego', async () => {
    const notifier = new Notifier();
    const deleteChannel = vi.fn().mockResolvedValue(undefined);
    const createChannel = vi.fn().mockResolvedValue(undefined);
    const plugin = { deleteChannel, createChannel };

    const originalStorage = globalThis.localStorage;
    const storageData = new Map();
    globalThis.localStorage = {
      getItem: vi.fn((key) => storageData.get(String(key)) || ''),
      setItem: vi.fn((key, value) => { storageData.set(String(key), String(value)); }),
      removeItem: vi.fn((key) => { storageData.delete(String(key)); }),
      clear: vi.fn(() => { storageData.clear(); }),
      key: vi.fn(),
      length: 0,
    };

    vi.spyOn(notifier, '_resolveNativePlugin').mockResolvedValue(plugin);
    await notifier._ensureNativeChannels();

    expect(deleteChannel).toHaveBeenCalled();
    expect(createChannel).toHaveBeenCalled();
    expect(globalThis.localStorage.setItem).toHaveBeenCalledWith('agenda-native-channel-schema', '2026-05-custom-audio-v2');

    deleteChannel.mockClear();
    createChannel.mockClear();
    notifier.nativeChannelsReady = false;
    await notifier._ensureNativeChannels();

    expect(deleteChannel).not.toHaveBeenCalled();
    expect(createChannel).toHaveBeenCalled();

    globalThis.localStorage = originalStorage;
  });

  it('programa por defecto dos recordatorios (15 y 30) cuando el evento no define offsets', () => {
    const notifier = new Notifier();
    const notifySpy = vi.spyOn(notifier, '_notify').mockImplementation(() => {});

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-04T12:00:00.000Z'));

    const now = new Date();
    const eventAt = new Date(now.getTime() + (31 * 60 * 1000));
    const eventDate = `${eventAt.getFullYear()}-${String(eventAt.getMonth() + 1).padStart(2, '0')}-${String(eventAt.getDate()).padStart(2, '0')}`;
    const eventStart = `${String(eventAt.getHours()).padStart(2, '0')}:${String(eventAt.getMinutes()).padStart(2, '0')}`;

    notifier.scheduleFor({
      id: 'ev-default-offsets',
      title: 'Evento default',
      date: eventDate,
      start: eventStart,
      end: eventStart,
    });

    vi.advanceTimersByTime(31 * 60 * 1000);
    expect(notifySpy).toHaveBeenCalledTimes(2);
    expect(notifySpy.mock.calls.map((call) => call[1]).sort((a, b) => a - b)).toEqual([15, 30]);

    vi.useRealTimers();
  });

  it('prefiere programar notificación nativa en Android cuando el plugin está disponible', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-04T10:00:00.000Z'));

    const notifier = new Notifier();
    const plugin = { schedule: vi.fn().mockResolvedValue(undefined) };
    const nativeSpy = vi.spyOn(notifier, '_scheduleNativeNotification').mockImplementation(() => {});

    vi.spyOn(notifier, '_getNativePluginSync').mockReturnValue(plugin);
    vi.spyOn(notifier, '_isAndroidRuntime').mockReturnValue(true);

    const timeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    const now = new Date();
    const eventAt = new Date(now.getTime() + (45 * 60 * 1000));
    const eventDate = `${eventAt.getFullYear()}-${String(eventAt.getMonth() + 1).padStart(2, '0')}-${String(eventAt.getDate()).padStart(2, '0')}`;
    const eventStart = `${String(eventAt.getHours()).padStart(2, '0')}:${String(eventAt.getMinutes()).padStart(2, '0')}`;

    notifier.scheduleFor({
      id: 'ev-native',
      title: 'Evento nativo',
      date: eventDate,
      start: eventStart,
      end: eventStart,
      reminder_offsets: [900],
    });

    expect(nativeSpy).toHaveBeenCalled();
    expect(timeoutSpy).not.toHaveBeenCalled();
    timeoutSpy.mockRestore();
    vi.useRealTimers();
  });
});
