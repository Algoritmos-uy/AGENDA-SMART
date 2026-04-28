export const DEFAULT_REMINDER_OFFSET_SECONDS = 1800;
export const FIXED_REMINDER_OFFSETS_SECONDS = [900, 1800, 2700, 3600];

export function getDefaultReminderOffsets() {
    return [DEFAULT_REMINDER_OFFSET_SECONDS];
}

export function parseReminderOffsetsFromFormState({
    isCustom = false,
    customMinutes = '',
    checkedOffsetValues = [],
} = {}) {
    if (isCustom) {
        const minutes = Number.parseInt(String(customMinutes || '').trim(), 10);
        if (!Number.isFinite(minutes) || minutes <= 0) {
            return { ok: false, error: 'invalid_custom_minutes' };
        }
        return { ok: true, offsets: [minutes * 60] };
    }

    const offsets = (Array.isArray(checkedOffsetValues) ? checkedOffsetValues : [])
        .map(v => Number(v))
        .filter(v => Number.isFinite(v) && v > 0);

    if (offsets.length === 0) {
        return { ok: false, error: 'empty_offsets' };
    }

    return { ok: true, offsets };
}

export function deriveReminderFormState(value) {
    const offsets = Array.isArray(value)
        ? value.map(Number).filter(v => Number.isFinite(v) && v > 0)
        : [Number(value)].filter(v => Number.isFinite(v) && v > 0);

    const normalized = offsets.length > 0 ? offsets : getDefaultReminderOffsets();
    const fixed = new Set(FIXED_REMINDER_OFFSETS_SECONDS);
    const hasCustom = normalized.some(v => !fixed.has(v));

    if (hasCustom) {
        return {
            customSelected: true,
            customMinutes: Math.round(normalized[0] / 60),
            checkedOffsets: [],
        };
    }

    return {
        customSelected: false,
        customMinutes: '',
        checkedOffsets: normalized,
    };
}
