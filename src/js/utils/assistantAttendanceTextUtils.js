import { normalizeAttendanceStatus } from './assistantEventUtils.js';

const ATTENDANCE_LABEL_DICT = {
    es: {
        pending: 'Pendiente',
        confirmed: 'Confirmado',
        declined: 'No asiste',
        tentative: 'Tentativo',
    },
    en: {
        pending: 'Pending',
        confirmed: 'Confirmed',
        declined: 'Declined',
        tentative: 'Tentative',
    },
    pt: {
        pending: 'Pendente',
        confirmed: 'Confirmado',
        declined: 'Recusado',
        tentative: 'Tentativo',
    }
};

const ATTENDANCE_ACTION_LABEL_DICT = {
    es: {
        pending: 'Marcar pendiente',
        confirmed: 'Confirmar asistencia',
        declined: 'Marcar no asiste',
        tentative: 'Marcar tentativo',
    },
    en: {
        pending: 'Mark pending',
        confirmed: 'Confirm attendance',
        declined: 'Mark declined',
        tentative: 'Mark tentative',
    },
    pt: {
        pending: 'Marcar pendente',
        confirmed: 'Confirmar presença',
        declined: 'Marcar recusado',
        tentative: 'Marcar tentativo',
    }
};

const ATTENDANCE_STATUS_TEXT_DICT = {
    es: {
        updated: 'Asistencia actualizada para "{{title}}": {{status}}.',
        invalid: 'Estado de asistencia inválido.',
    },
    en: {
        updated: 'Attendance updated for "{{title}}": {{status}}.',
        invalid: 'Invalid attendance status.',
    },
    pt: {
        updated: 'Presença atualizada para "{{title}}": {{status}}.',
        invalid: 'Status de presença inválido.',
    }
};

function getLang(locale = 'es') {
    return String(locale || 'es').slice(0, 2);
}

export function getAttendanceLabelForLocale(locale = 'es', status = 'pending') {
    const key = normalizeAttendanceStatus(status);
    const lang = getLang(locale);
    return (ATTENDANCE_LABEL_DICT[lang] && ATTENDANCE_LABEL_DICT[lang][key])
        || ATTENDANCE_LABEL_DICT.es[key]
        || ATTENDANCE_LABEL_DICT.es.pending;
}

export function getAttendanceActionLabelForLocale(locale = 'es', status = 'pending') {
    const key = normalizeAttendanceStatus(status);
    const lang = getLang(locale);
    return (ATTENDANCE_ACTION_LABEL_DICT[lang] && ATTENDANCE_ACTION_LABEL_DICT[lang][key])
        || ATTENDANCE_ACTION_LABEL_DICT.es[key]
        || ATTENDANCE_ACTION_LABEL_DICT.es.pending;
}

export function getAttendanceStatusTextForLocale(locale = 'es', type = 'updated', vars = {}) {
    const lang = getLang(locale);
    const template = (ATTENDANCE_STATUS_TEXT_DICT[lang] && ATTENDANCE_STATUS_TEXT_DICT[lang][type])
        || ATTENDANCE_STATUS_TEXT_DICT.es[type]
        || '';

    return Object.entries(vars).reduce(
        (acc, [k, v]) => acc.replaceAll(`{{${k}}}`, String(v ?? '')),
        template,
    );
}