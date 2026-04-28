export const ASSISTANT_SHORT_TEXT_DICT = {
    es: {
        confirmDelete: '¿Confirmas eliminar este evento? Responde "sí" para confirmar o "no" para cancelar.\n- {{event}}',
        confirmUpdate: '¿Confirmas actualizar este evento? Responde "sí" para confirmar o "no" para cancelar.\nAntes: {{before}}\nDespués: {{after}}',
        pendingNeedDecision: 'Hay una acción pendiente. Responde "sí" para confirmar o "no" para cancelar.',
        pendingNeedSelection: 'Selecciona el número del evento que quieres eliminar (por ejemplo: 1, 2 o 3). También puedes responder "no" para cancelar.',
        actionCancelled: 'Acción cancelada.',
        eventNotFound: 'No encontré un evento que coincida con tu solicitud.',
        eventAmbiguous: 'Encontré varios eventos posibles. Indica más detalle (fecha/hora) o usa el formulario para seleccionar uno.\n{{options}}',
        eventAmbiguousNumbered: 'Encontré varios eventos posibles. Responde con el número del evento correcto (1-{{max}}):\n{{options}}',
        selectionInvalid: 'No entendí la selección. Responde con un número entre 1 y {{max}}, o "no" para cancelar.',
        eventUpdated: 'Evento actualizado: {{event}}',
        eventDeleted: 'Evento eliminado: {{event}}',
        rescheduleConflict: 'Ese horario entra en conflicto con: {{conflicts}}\nSugerencias: {{suggestions}}',
        rescheduleNoSuggestion: 'Ese horario entra en conflicto y no encontré huecos cercanos. Indica otra fecha/hora.',
        attendanceUpdated: 'Asistencia actualizada: {{event}} · {{status}}',
        attendanceInvalid: 'No entendí el estado de asistencia. Usa: pendiente, confirmado, tentativo o no asiste.',
    },
    en: {
        confirmDelete: 'Do you confirm deleting this event? Reply "yes" to confirm or "no" to cancel.\n- {{event}}',
        confirmUpdate: 'Do you confirm updating this event? Reply "yes" to confirm or "no" to cancel.\nBefore: {{before}}\nAfter: {{after}}',
        pendingNeedDecision: 'There is a pending action. Reply "yes" to confirm or "no" to cancel.',
        pendingNeedSelection: 'Pick the number of the event you want to delete (for example: 1, 2, or 3). You can also reply "no" to cancel.',
        actionCancelled: 'Action cancelled.',
        eventNotFound: 'I could not find a matching event for your request.',
        eventAmbiguous: 'I found multiple possible events. Please provide more detail (date/time) or use the form to pick one.\n{{options}}',
        eventAmbiguousNumbered: 'I found multiple possible events. Reply with the correct event number (1-{{max}}):\n{{options}}',
        selectionInvalid: 'I could not understand your selection. Reply with a number between 1 and {{max}}, or "no" to cancel.',
        eventUpdated: 'Event updated: {{event}}',
        eventDeleted: 'Event deleted: {{event}}',
        rescheduleConflict: 'That time conflicts with: {{conflicts}}\nSuggestions: {{suggestions}}',
        rescheduleNoSuggestion: 'That time conflicts and I could not find nearby free slots. Please provide another date/time.',
        attendanceUpdated: 'Attendance updated: {{event}} · {{status}}',
        attendanceInvalid: 'I could not understand the attendance status. Use: pending, confirmed, tentative, or declined.',
    },
    pt: {
        confirmDelete: 'Você confirma excluir este evento? Responda "sim" para confirmar ou "não" para cancelar.\n- {{event}}',
        confirmUpdate: 'Você confirma atualizar este evento? Responda "sim" para confirmar ou "não" para cancelar.\nAntes: {{before}}\nDepois: {{after}}',
        pendingNeedDecision: 'Há uma ação pendente. Responda "sim" para confirmar ou "não" para cancelar.',
        pendingNeedSelection: 'Selecione o número do evento que deseja excluir (por exemplo: 1, 2 ou 3). Você também pode responder "não" para cancelar.',
        actionCancelled: 'Ação cancelada.',
        eventNotFound: 'Não encontrei um evento correspondente ao seu pedido.',
        eventAmbiguous: 'Encontrei vários eventos possíveis. Informe mais detalhes (data/hora) ou use o formulário para selecionar um.\n{{options}}',
        eventAmbiguousNumbered: 'Encontrei vários eventos possíveis. Responda com o número do evento correto (1-{{max}}):\n{{options}}',
        selectionInvalid: 'Não entendi a seleção. Responda com um número entre 1 e {{max}}, ou "não" para cancelar.',
        eventUpdated: 'Evento atualizado: {{event}}',
        eventDeleted: 'Evento excluído: {{event}}',
        rescheduleConflict: 'Esse horário conflita com: {{conflicts}}\nSugestões: {{suggestions}}',
        rescheduleNoSuggestion: 'Esse horário conflita e não encontrei horários livres próximos. Informe outra data/hora.',
        attendanceUpdated: 'Presença atualizada: {{event}} · {{status}}',
        attendanceInvalid: 'Não entendi o status de presença. Use: pendente, confirmado, tentativo ou recusado.',
    },
};

export function formatAssistantShortText(locale = 'es', key = '', vars = {}) {
    const lang = String(locale || 'es').slice(0, 2);
    const template = (ASSISTANT_SHORT_TEXT_DICT[lang] && ASSISTANT_SHORT_TEXT_DICT[lang][key])
        || ASSISTANT_SHORT_TEXT_DICT.es[key]
        || key;

    return Object.entries(vars).reduce(
        (acc, [k, v]) => acc.replaceAll(`{{${k}}}`, String(v ?? '')),
        template,
    );
}