export function resolveRecorderMimeType(windowRef = globalThis.window) {
    const MR = windowRef?.MediaRecorder;
    if (!MR?.isTypeSupported) return '';
    const candidates = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/aac'
    ];
    return candidates.find(t => MR.isTypeSupported(t)) || '';
}

export async function startRecorderCapture({
    windowRef = globalThis.window,
    onData,
    onStop,
    onError,
    mimeType = ''
} = {}) {
    const nav = windowRef?.navigator;
    if (!nav?.mediaDevices?.getUserMedia || !windowRef?.MediaRecorder) {
        throw new Error('RECORDER_NOT_SUPPORTED');
    }

    const stream = await nav.mediaDevices.getUserMedia({ audio: true });
    const picked = mimeType || resolveRecorderMimeType(windowRef);
    const recorder = picked
        ? new windowRef.MediaRecorder(stream, { mimeType: picked })
        : new windowRef.MediaRecorder(stream);

    recorder.ondataavailable = (e) => {
        if (e?.data?.size > 0 && typeof onData === 'function') onData(e.data);
    };
    recorder.onerror = (e) => {
        if (typeof onError === 'function') onError(e);
    };
    recorder.onstop = () => {
        if (typeof onStop === 'function') onStop();
    };

    recorder.start();
    return { recorder, stream, mimeType: picked || recorder?.mimeType || 'audio/webm' };
}

export function stopRecorderCapture({ recorder, stream } = {}) {
    try {
        if (recorder && recorder.state !== 'inactive') recorder.stop();
    } catch (_e) {
        // no-op
    }
    try {
        (stream?.getTracks?.() || []).forEach((t) => t.stop());
    } catch (_e) {
        // no-op
    }
}

export function chunksToAudioBlob(chunks = [], mimeType = 'audio/webm') {
    return new Blob(Array.isArray(chunks) ? chunks : [], { type: mimeType || 'audio/webm' });
}

export function isRetryableSttError(raw = '') {
    const text = String(raw || '').toLowerCase();
    return /network|timeout|timed out|fetch failed|econnreset|503|502|504/.test(text);
}

export function getSttRetryDelayMs(attempt = 1) {
    const n = Math.max(1, Number(attempt) || 1);
    return Math.min(3500, 700 * n);
}