import { describe, it, expect } from 'vitest';
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
});
