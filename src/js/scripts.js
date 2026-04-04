import { Notifier } from './notifications.js';
import {
    addDays,
    addMonths,
    buildSlots,
    formatISODate,
    formatReadableDate,
    generateId,
    isInSlot,
    normalizeLocale,
    sameDate,
    sortEvents,
    startOfWeek
} from './utils/agendaDateUtils.js';
import {
    detectAssistantRange,
    extractAssistantAction,
    toEventPayload,
    validateEventPayload
} from './utils/assistantEventUtils.js';
import {
    cleanVoiceTranscript,
    getVoiceLang,
    hasVoiceRecognitionSupport,
    mapVoiceErrorCode
} from './utils/voiceUtils.js';
import { applyDocumentI18n, getIntlLocale, t } from './utils/i18n.js';

// Módulo IIFE: aísla la lógica de la agenda en un ámbito propio.
(() => {
    const notifier = new Notifier();

    // Persistencia: preferir store nativo (IPC) y hacer fallback a localStorage.
    const STORAGE_KEY = 'agenda-online-events';
    const hasNativeStore = typeof window !== 'undefined' && !!window.appBridge?.getEvents;
    let eventsCache = [];

    // Referencias de UI y campos del formulario.
    const form = document.getElementById('event-form');
    const statusEl = document.getElementById('form-status');
    const submitBtn = document.getElementById('submit-btn');
    const resetBtn = document.getElementById('reset-btn');
    const baseDateInput = document.getElementById('base-date');
    const weeklyPrevBtn = document.getElementById('weekly-prev');
    const weeklyNextBtn = document.getElementById('weekly-next');
    const monthlyPrevBtn = document.getElementById('monthly-prev');
    const monthlyNextBtn = document.getElementById('monthly-next');

    const titleInput = document.getElementById('title');
    const dateInput = document.getElementById('date');
    const startInput = document.getElementById('start');
    const endInput = document.getElementById('end');
    const descInput = document.getElementById('description');
    const colorInput = document.getElementById('color');
    const eventIdInput = document.getElementById('event-id');
    const reminderSelect = document.getElementById('reminder');
    const reminderCustomInput = document.getElementById('reminder-custom');
    const reminderCustomWrapper = document.getElementById('reminder-custom-wrapper');

    const DEFAULT_REMINDER_MINUTES = 10;

    const viewButtons = Array.from(document.querySelectorAll('[data-target]'));
    const views = document.querySelectorAll('.agenda-view');

    const versionEl = document.getElementById('app-version');

    const dailySlotsEl = document.getElementById('daily-slots');
    const weeklyGridEl = document.getElementById('weekly-grid');
    const monthlyGridEl = document.getElementById('monthly-grid');
    const eventListEl = document.getElementById('event-list');

    const dailyCaption = document.getElementById('daily-caption');
    const weeklyCaption = document.getElementById('weekly-caption');
    const monthlyCaption = document.getElementById('monthly-caption');

    const clockEl = document.getElementById('live-clock');
    const assistantOpenBtn = document.getElementById('assistant-open');
    const autoStartToggle = document.getElementById('autostart-toggle');
    const assistantModal = document.getElementById('assistant-modal');
    const assistantCloseBtn = document.getElementById('assistant-close');
    const assistantCloseFooterBtn = document.getElementById('assistant-close-footer');
    const assistantThread = document.getElementById('assistant-thread');
    const assistantForm = document.getElementById('assistant-form');
    const assistantInput = document.getElementById('assistant-input');
    const assistantStatus = document.getElementById('assistant-status');
    const assistantSendBtn = document.getElementById('assistant-send');
    const assistantVoiceBtn = document.getElementById('assistant-voice');
    const assistantClearBtn = document.getElementById('assistant-clear');

    const ASSISTANT_STORE_KEY = 'coordinalia-thread';
    const ASSISTANT_TEXT = {
        es: {
            prompt: 'Eres CoordinalIA, asistente de Agenda Inteligente. Tono: profesional y cercano, empático y claro. Responde breve, en español, y ayuda a gestionar eventos (crear, listar, reprogramar) con pasos concretos. Si falta la API key, indica de forma amable que se debe configurar una API key (DeepSeek u OpenAI). Si el usuario pide crear/agendar un evento y tienes título, fecha (YYYY-MM-DD), inicio (HH:mm) y fin (HH:mm), responde con un único bloque JSON plano con la forma {"action":"create_event","title":"...","date":"YYYY-MM-DD","start":"HH:mm","end":"HH:mm","description":"...","color":"#2563eb"}. No uses más texto fuera del JSON. Si falta algún dato, pídele al usuario solo ese dato faltante.',
            welcome: 'Hola, soy CoordinalIA. Estoy aquí para ayudarte con tu agenda: crear, consultar o reprogramar eventos de forma rápida. ¿En qué te apoyo?',
            noEvents: {
                today: 'No hay eventos para hoy.',
                week: 'No hay eventos esta semana.',
                month: 'No hay eventos este mes.'
            },
            headers: {
                today: 'Eventos de hoy:',
                week: 'Eventos de la semana:',
                month: 'Eventos del mes:'
            }
        },
        en: {
            prompt: 'You are CoordinalIA, assistant of Smart Agenda. Tone: professional yet friendly and clear. Reply briefly in English and help manage events (create, list, reschedule) with concrete steps. If the API key is missing, politely say an API key (DeepSeek or OpenAI) must be configured. If the user asks to create/schedule an event and you have title, date (YYYY-MM-DD), start (HH:mm), end (HH:mm), answer with a single plain JSON block: {"action":"create_event","title":"...","date":"YYYY-MM-DD","start":"HH:mm","end":"HH:mm","description":"...","color":"#2563eb"}. Do not add extra text outside JSON. If a field is missing, ask only for that missing field.',
            welcome: "Hi, I'm CoordinalIA. I can help you create, check, or reschedule events quickly. How can I help?",
            noEvents: {
                today: 'No events for today.',
                week: 'No events this week.',
                month: 'No events this month.'
            },
            headers: {
                today: "Today's events:",
                week: 'This week\'s events:',
                month: 'This month\'s events:'
            }
        },
        pt: {
            prompt: 'Você é a CoordinalIA, assistente da Agenda Inteligente. Tom: profissional e próximo, claro e empático. Responda de forma breve, em português, ajudando a gerir eventos (criar, listar, reagendar) com passos concretos. Se faltar a API key, avise gentilmente que é preciso configurar uma API key (DeepSeek ou OpenAI). Se o usuário pedir para criar/agendar um evento e você tiver título, data (AAAA-MM-DD), início (HH:mm) e fim (HH:mm), responda com um único JSON simples: {"action":"create_event","title":"...","date":"AAAA-MM-DD","start":"HH:mm","end":"HH:mm","description":"...","color":"#2563eb"}. Não adicione texto fora do JSON. Se faltar algum campo, peça apenas esse campo faltante.',
            welcome: 'Olá, sou a CoordinalIA. Posso ajudar a criar, consultar ou reagendar eventos rapidamente. Como posso ajudar?',
            noEvents: {
                today: 'Sem eventos para hoje.',
                week: 'Sem eventos nesta semana.',
                month: 'Sem eventos neste mês.'
            },
            headers: {
                today: 'Eventos de hoje:',
                week: 'Eventos da semana:',
                month: 'Eventos do mês:'
            }
        }
    };

    const ASSISTANT_CONFIG_KEY = 'coordinalia-config';
    const ASSISTANT_PROVIDERS = {
        deepseek: { id: 'deepseek', label: 'DeepSeek' },
        openai: { id: 'openai', label: 'OpenAI' }
    };

    const assistantMessages = [];
    let assistantUnsubscribe = null;
    let assistantLocale = 'es';
    let assistantStrings = ASSISTANT_TEXT.es;
    let assistantSystemPrompt = assistantStrings.prompt;
    let assistantProvider = 'deepseek';
    let assistantProviderBtn = null;
    let assistantRecognizer = null;
    let assistantListening = false;
    let assistantVoiceRetryCount = 0;
    let assistantVoiceRetryTimer = null;
    let assistantVoiceStopRequested = false;
    let assistantRecorder = null;
    let assistantRecorderChunks = [];
    let assistantRecorderStream = null;
    let assistantVoiceMode = 'recognition';
    const ASSISTANT_VOICE_MAX_RETRIES = 2;

    function tr(key, vars = {}) {
        return t(assistantLocale, key, vars);
    }

    function getCurrentIntlLocale() {
        return getIntlLocale(assistantLocale);
    }

    function applyI18n() {
        applyDocumentI18n(document, assistantLocale);
        if (submitBtn) {
            submitBtn.textContent = eventIdInput?.value ? tr('form.update') : tr('form.save');
        }
        renderAssistantProviderBtn();
        updateVoiceUi();
    }

    function loadAssistantConfig() {
        try {
            const raw = localStorage.getItem(ASSISTANT_CONFIG_KEY);
            const parsed = raw ? JSON.parse(raw) : {};
            const provider = ASSISTANT_PROVIDERS[parsed.provider]?.id || 'deepseek';
            return { provider };
        } catch (_e) {
            return { provider: 'deepseek' };
        }
    }

    function saveAssistantConfig(config) {
        try {
            localStorage.setItem(ASSISTANT_CONFIG_KEY, JSON.stringify(config));
        } catch (e) {
            console.warn('No se pudo guardar la configuración del asistente', e);
        }
    }

    function getAssistantConfig() {
        const cfg = loadAssistantConfig();
        assistantProvider = cfg.provider;
        return cfg;
    }

    function renderAssistantProviderBtn() {
        if (!assistantProviderBtn) return;
        assistantProviderBtn.textContent = tr('assistant.providerLabel', { provider: getAssistantProviderLabel() });
        assistantProviderBtn.title = tr('assistant.providerTitle');
    }

    async function promptAssistantProvider(force = false) {
        const current = assistantProvider || 'deepseek';
        const cfg = getAssistantConfig();
        if (!force) return { provider: current };
        const prov = current === 'deepseek' ? 'openai' : 'deepseek';
        cfg.provider = prov;
        saveAssistantConfig(cfg);
        assistantProvider = prov;
        renderAssistantProviderBtn();
        return { provider: prov };
    }

    function getAssistantProviderLabel() {
        const prov = assistantProvider || 'deepseek';
        return ASSISTANT_PROVIDERS[prov]?.label || 'DeepSeek';
    }

    document.addEventListener('DOMContentLoaded', init);

    // Configuración inicial: valores por defecto, listeners y primer render.
    async function init() {
        const today = new Date();
        baseDateInput.value = formatISODate(today);
        dateInput.value = formatISODate(today);
        startInput.value = '09:00';
        endInput.value = '10:00';
    setReminderDefault();

    await hydrateAssistantLocale();
    applyI18n();

        startClock();
        try { await notifier.init(); } catch (e) { console.warn('Notifier init failed', e); }
        notifier.setLocale?.(assistantLocale);

    await loadEventsFromStore();
    renderAll();
    try { notifier.rescheduleAll(getEvents()); } catch (e) { console.warn('Reschedule failed', e); }

    getAssistantConfig();
    renderAssistantProviderBtn();
    loadAssistantHistory();

        form.addEventListener('submit', handleSubmit);
        resetBtn.addEventListener('click', resetForm);
        viewButtons.forEach(btn => btn.addEventListener('click', handleViewSwitch));
        baseDateInput.addEventListener('change', renderAll);
        weeklyPrevBtn?.addEventListener('click', () => shiftBaseDateDays(-7));
        weeklyNextBtn?.addEventListener('click', () => shiftBaseDateDays(7));
        monthlyPrevBtn?.addEventListener('click', () => shiftBaseDateMonths(-1));
        monthlyNextBtn?.addEventListener('click', () => shiftBaseDateMonths(1));
    reminderSelect?.addEventListener('change', handleReminderChange);
        autoStartToggle?.addEventListener('change', handleAutoStartToggle);

        hydrateVersion();
        hydrateAutoStart();
        setupAssistantModal();
    }

    async function hydrateAutoStart() {
        if (!autoStartToggle || !window.appBridge?.getAutoStartStatus) return;
        autoStartToggle.disabled = true;
        try {
            const status = await window.appBridge.getAutoStartStatus();
            const supported = !!status?.supported;
            autoStartToggle.checked = !!status?.enabled;
            autoStartToggle.disabled = !supported;
            autoStartToggle.title = supported
                ? tr('header.autoStart')
                : tr('app.unavailable');
        } catch (e) {
            console.warn('No se pudo leer estado de inicio automático', e);
            autoStartToggle.disabled = true;
            autoStartToggle.title = tr('app.unavailable');
        }
    }

    async function handleAutoStartToggle() {
        if (!autoStartToggle || !window.appBridge?.setAutoStartEnabled) return;
        const desired = !!autoStartToggle.checked;
        autoStartToggle.disabled = true;
        try {
            const result = await window.appBridge.setAutoStartEnabled(desired);
            autoStartToggle.checked = !!result?.enabled;
            autoStartToggle.disabled = !result?.supported;
            setStatus(result?.enabled
                ? tr('form.statusAutoStartOn')
                : tr('form.statusAutoStartOff'), 'muted');
        } catch (e) {
            console.warn('No se pudo actualizar inicio automático', e);
            autoStartToggle.checked = !desired;
            autoStartToggle.disabled = false;
            setStatus(tr('form.statusAutoStartFail'), 'danger');
        }
    }

    // Crear o actualizar eventos desde el formulario.
    function handleSubmit(event) {
        event.preventDefault();
    const payload = getFormData();
        if (!payload) return;

        const events = getEvents();
        if (payload.id) {
            const index = events.findIndex(e => e.id === payload.id);
            if (index !== -1) {
                events[index] = payload;
            }
            setStatus(tr('form.statusEventUpdated'), 'success');
        } else {
            payload.id = generateId();
            events.push(payload);
            setStatus(tr('form.statusEventSaved'), 'success');
        }
        saveEvents(events);
        resetForm();
        renderAll();
        try { notifier.scheduleFor(payload); } catch (e) { console.warn('Schedule failed', e); }
    }

    function shiftBaseDateDays(days) {
        const current = parseLocalDate(baseDateInput.value) || new Date();
        baseDateInput.value = formatISODate(addDays(current, days));
        renderAll();
    }

    function shiftBaseDateMonths(months) {
        const current = parseLocalDate(baseDateInput.value) || new Date();
        baseDateInput.value = formatISODate(addMonths(current, months));
        renderAll();
    }

    // Cambia entre vistas (diaria, semanal, mensual) con estado accesible.
    function handleViewSwitch(evt) {
        const target = normalizeViewTarget(evt.currentTarget.dataset.target);
        viewButtons.forEach(btn => {
            const isActive = normalizeViewTarget(btn.dataset.target) === target;
            btn.classList.toggle('is-active', isActive);
            btn.setAttribute('aria-pressed', String(isActive));
        });
        views.forEach(view => {
            view.classList.toggle('is-hidden', view.dataset.view !== target);
        });
        renderAll(); // re-render al cambiar vista
    }

    // Limpia el formulario y regresa a modo "nuevo evento".
    function resetForm() {
        form.reset();
        eventIdInput.value = '';
        submitBtn.textContent = tr('form.save');
        setStatus('');
        setReminderDefault();
    }

    // Lee y valida campos del formulario; devuelve un objeto de evento o null.
    function getFormData() {
        const title = titleInput.value.trim();
        const date = dateInput.value;
        const start = startInput.value;
        const end = endInput.value;
        const description = descInput.value.trim();
        const color = colorInput.value || '#2563eb';
        const id = eventIdInput.value || null;
    const reminderSeconds = getReminderSecondsFromForm();
    if (reminderSeconds === null) return null;

        if (!title || !date || !start || !end) {
            setStatus(tr('form.statusRequired'), 'danger');
            return null;
        }

        if (end <= start) {
            setStatus(tr('form.statusEndAfterStart'), 'danger');
            return null;
        }

        return { id, title, date, start, end, description, color, reminder_offset: reminderSeconds };
    }

    // Muestra mensajes de estado contextuales.
    function setStatus(message, type = 'muted') {
        statusEl.textContent = message;
        statusEl.className = `status ${type ? `text-${type}` : ''}`.trim();
    }


    // Persistencia de eventos (cache + store nativo o localStorage como fallback).
    function getEvents() {
        return eventsCache;
    }

    async function loadEventsFromStore() {
        if (hasNativeStore && window.appBridge?.getEvents) {
            try {
                const nativeEvents = await window.appBridge.getEvents();
                if (Array.isArray(nativeEvents) && nativeEvents.length) {
                    eventsCache = nativeEvents;
                    return;
                }
                // Migración inicial: si no hay datos en store nativo, usa localStorage si existe.
                const legacy = loadEventsFromLocal();
                eventsCache = legacy;
                await window.appBridge.saveEvents(eventsCache);
                return;
            } catch (e) {
                console.warn('No se pudo cargar store nativo, se usa localStorage', e);
                eventsCache = loadEventsFromLocal();
                return;
            }
        }
        eventsCache = loadEventsFromLocal();
    }

    function saveEvents(list) {
        eventsCache = Array.isArray(list) ? [...list] : [];
        if (hasNativeStore && window.appBridge?.saveEvents) {
            window.appBridge.saveEvents(eventsCache).catch((e) => console.warn('Persistencia nativa falló', e));
        }
        // Mantener localStorage sincronizado como respaldo.
        saveEventsToLocal(eventsCache);
    }

    function loadEventsFromLocal() {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            console.warn('No se pudo parsear eventos locales', e);
            return [];
        }
    }

    function saveEventsToLocal(list) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
        } catch (e) {
            console.warn('No se pudo guardar en localStorage', e);
        }
    }

    function renderAll() {
        try {
            const events = sortEvents(getEvents());
            renderDaily(events);
            renderWeekly(events);
            renderMonthly(events);
            renderList(events);
            notifier.rescheduleAll(events);
        } catch (err) {
            console.error('Error al renderizar', err);
        }
    }

    // Parseo seguro de fechas en formato YYYY-MM-DD como fecha local (sin desfase UTC).
    function parseLocalDate(dateStr) {
        if (!dateStr) return null;
        const [y, m, d] = dateStr.split('-').map(Number);
        return new Date(y, m - 1, d);
    }

    // Render de la vista diaria: slots por hora y chips de eventos.
    function renderDaily(events) {
        if (!dailySlotsEl) return;
        const base = parseLocalDate(baseDateInput.value);
        if (!base || Number.isNaN(base)) return;
        if (dailyCaption) dailyCaption.textContent = base.toLocaleDateString(getCurrentIntlLocale(), { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

        const slots = buildSlots(8, 20);
        dailySlotsEl.innerHTML = '';

        slots.forEach(slot => {
            const slotEl = document.createElement('div');
            slotEl.className = 'slot';
            slotEl.innerHTML = `
                <div class="slot__label">${slot.label}</div>
                <div class="slot__events"></div>
            `;
            const slotEventsEl = slotEl.querySelector('.slot__events');

            const slotEvents = events.filter(e => sameDate(e.date, base) && isInSlot(e, slot));
            slotEvents.forEach(ev => {
                const chip = document.createElement('div');
                chip.className = 'event-chip';
                chip.style.background = ev.color;
                chip.innerHTML = `
                    <span class="event-chip__title">${ev.title}</span>
                    <span class="event-chip__time">${ev.start} - ${ev.end}</span>
                `;
                chip.addEventListener('click', () => loadToForm(ev));
                slotEventsEl.appendChild(chip);
            });

            dailySlotsEl.appendChild(slotEl);
        });
    }

    // Vista semanal: 7 columnas desde el lunes de la semana base.
    function renderWeekly(events) {
        if (!weeklyGridEl) return;
        const base = parseLocalDate(baseDateInput.value);
        if (!base || Number.isNaN(base)) return;
        const weekStart = startOfWeek(base);
        if (weeklyCaption) weeklyCaption.textContent = `${formatISODate(weekStart)} - ${formatISODate(addDays(weekStart, 6))}`;

        weeklyGridEl.innerHTML = '';
        for (let i = 0; i < 7; i++) {
            const day = addDays(weekStart, i);
            const dayEvents = events.filter(e => sameDate(e.date, day));
            const column = document.createElement('div');
            column.className = 'week-day';
            column.innerHTML = `
                <div class="week-day__label">${day.toLocaleDateString(getCurrentIntlLocale(), { weekday: 'short', day: 'numeric', month: 'short' })}</div>
                <div class="week-day__events"></div>
            `;

            const list = column.querySelector('.week-day__events');
            if (!dayEvents.length) {
                list.innerHTML = `<p class="muted">${tr('calendar.noEvents')}</p>`;
            } else {
                dayEvents.forEach(ev => {
                    const item = document.createElement('div');
                    item.className = 'event-chip';
                    item.style.background = ev.color;
                    item.innerHTML = `
                        <span class="event-chip__title">${ev.title}</span>
                        <span class="event-chip__time">${ev.start} - ${ev.end}</span>
                    `;
                    item.addEventListener('click', () => loadToForm(ev));
                    list.appendChild(item);
                });
            }

            weeklyGridEl.appendChild(column);
        }
    }

    // Vista mensual: celdas por día del mes, con badges de eventos.
    function renderMonthly(events) {
        if (!monthlyGridEl) return;
        const base = parseLocalDate(baseDateInput.value);
        if (!base || Number.isNaN(base)) return;
        const startMonth = new Date(base.getFullYear(), base.getMonth(), 1);
        const endMonth = new Date(base.getFullYear(), base.getMonth() + 1, 0);
    if (monthlyCaption) monthlyCaption.textContent = startMonth.toLocaleDateString(getCurrentIntlLocale(), { month: 'long', year: 'numeric' });

        monthlyGridEl.innerHTML = '';
        for (let d = 1; d <= endMonth.getDate(); d++) {
            const day = new Date(base.getFullYear(), base.getMonth(), d);
            const dayEvents = events.filter(e => sameDate(e.date, day));
            const cell = document.createElement('div');
            cell.className = 'month-day';
            cell.innerHTML = `
                <div class="month-day__header">
                    <span>${d}</span>
                    <span class="muted">${day.toLocaleDateString(getCurrentIntlLocale(), { weekday: 'short' })}</span>
                </div>
                <div class="month-day__events"></div>
            `;

            const list = cell.querySelector('.month-day__events');
            dayEvents.forEach(ev => {
                const badge = document.createElement('div');
                badge.className = 'badge';
                badge.style.background = ev.color + '20';
                badge.style.color = ev.color;
                badge.textContent = `${ev.start} · ${ev.title}`;
                badge.addEventListener('click', () => loadToForm(ev));
                list.appendChild(badge);
            });

            monthlyGridEl.appendChild(cell);
        }
    }

    // Lista cronológica de próximos eventos con acciones de editar/eliminar.
    function renderList(events) {
        if (!eventListEl) return;
        eventListEl.innerHTML = '';
        if (!events.length) {
            eventListEl.innerHTML = `<p class="muted">${tr('list.empty')}</p>`;
            return;
        }

        events.forEach(ev => {
            const card = document.createElement('article');
            card.className = 'event-card';
            card.innerHTML = `
                <div class="event-card__title">
                    <h3>${ev.title}</h3>
                </div>
                <div class="event-card__meta">
                    <span class="event-card__color" style="background:${ev.color}"></span>
                    <span>${formatReadableDate(ev.date, getCurrentIntlLocale())}</span>
                    <span>${ev.start} - ${ev.end}</span>
                    ${ev.description ? `<span class="badge">${ev.description}</span>` : ''}
                </div>
                <div class="event-card__actions">
                    <button class="btn btn--ghost" data-action="edit">${tr('list.edit')}</button>
                    <button class="btn btn--ghost" data-action="delete">${tr('list.delete')}</button>
                </div>
            `;

            card.querySelector('[data-action="edit"]').addEventListener('click', () => loadToForm(ev));
            card.querySelector('[data-action="delete"]').addEventListener('click', () => deleteEvent(ev.id));

            eventListEl.appendChild(card);
        });
    }

    function deleteEvent(id) {
        const filtered = getEvents().filter((e) => e.id !== id);
        saveEvents(filtered);
        renderAll();
        try { notifier.cancelFor(id); } catch (e) { console.warn('Cancel failed', e); }
        setStatus(tr('form.statusEventDeleted'));
    }

    // Carga un evento existente en el formulario para editarlo.
    function loadToForm(ev) {
        titleInput.value = ev.title;
        dateInput.value = ev.date;
        startInput.value = ev.start;
        endInput.value = ev.end;
        descInput.value = ev.description || '';
        colorInput.value = ev.color;
        eventIdInput.value = ev.id;
        applyReminderToForm(ev.reminder_offset);
        submitBtn.textContent = tr('form.update');
        setStatus(tr('form.statusEditing'), 'muted');
    }

    function handleReminderChange() {
        const value = reminderSelect.value;
        const isCustom = value === 'custom';
        if (isCustom) {
            reminderCustomWrapper.style.display = 'flex';
            if (!reminderCustomInput.value) reminderCustomInput.value = '';
            reminderCustomInput.focus();
        } else {
            reminderCustomWrapper.style.display = 'none';
            reminderCustomInput.value = '';
        }
    }

    function setReminderDefault() {
        if (!reminderSelect) return;
        reminderSelect.value = String(DEFAULT_REMINDER_MINUTES);
        reminderCustomInput.value = '';
        reminderCustomWrapper.style.display = 'none';
    }

    function getReminderSecondsFromForm() {
        if (!reminderSelect) return DEFAULT_REMINDER_MINUTES * 60;
        const value = reminderSelect.value;
        if (value === 'custom') {
            const minutes = parseInt(reminderCustomInput.value, 10);
            if (Number.isFinite(minutes) && minutes > 0) return minutes * 60;
            setStatus(tr('form.statusReminderInvalid'), 'danger');
            return null;
        }
        const minutes = parseInt(value, 10);
        return Number.isFinite(minutes) && minutes > 0 ? minutes * 60 : DEFAULT_REMINDER_MINUTES * 60;
    }

    function applyReminderToForm(reminderOffsetSeconds) {
        if (!reminderSelect) return;
        const minutes = Number.isFinite(reminderOffsetSeconds) ? Math.round(reminderOffsetSeconds / 60) : DEFAULT_REMINDER_MINUTES;
        const allowed = ['5', '10', '15', '30', '60'];
        if (allowed.includes(String(minutes))) {
            reminderSelect.value = String(minutes);
            reminderCustomWrapper.style.display = 'none';
            reminderCustomInput.value = '';
        } else {
            reminderSelect.value = 'custom';
            reminderCustomWrapper.style.display = 'flex';
            reminderCustomInput.value = minutes > 0 ? minutes : '';
        }
    }

    // Helpers
    function normalizeViewTarget(target) {
        const map = { day: 'daily', week: 'weekly', month: 'monthly', diaria: 'daily', semanal: 'weekly', mensual: 'monthly' };
        return map[target] || target;
    }


    function getEventsByRange(range) {
        const events = sortEvents(getEvents());
        const today = new Date();
        const todayFloor = new Date(today.getFullYear(), today.getMonth(), today.getDate());

        if (range === 'today') {
            return events.filter(ev => sameDate(ev.date, todayFloor));
        }

        if (range === 'week') {
            const start = startOfWeek(todayFloor);
            const end = addDays(start, 6);
            return events.filter(ev => {
                const d = parseLocalDate(ev.date);
                return d && d >= start && d <= end;
            });
        }

        if (range === 'month') {
            const month = todayFloor.getMonth();
            const year = todayFloor.getFullYear();
            return events.filter(ev => {
                const d = parseLocalDate(ev.date);
                return d && d.getMonth() === month && d.getFullYear() === year;
            });
        }

        return [];
    }

    function formatAssistantEvents(list, range) {
        const headers = assistantStrings.headers;
        const noEvents = assistantStrings.noEvents;
        if (!list.length) {
            return (noEvents && noEvents[range]) || tr('calendar.noEvents');
        }
        const title = (headers && headers[range]) || tr('assistant.eventsTitle');
        const lines = list.map(ev => {
            const desc = ev.description ? ` — ${ev.description}` : '';
            return `- ${ev.date} ${ev.start}-${ev.end} ${ev.title}${desc}`;
        });
        return `${title}\n${lines.join('\n')}`;
    }

    function startClock() {
        if (!clockEl) return;
        const update = () => {
            const now = new Date();
            clockEl.textContent = now.toLocaleTimeString(getCurrentIntlLocale(), { hour12: false });
        };
        update();
        setInterval(update, 1000);
    }

    async function hydrateVersion() {
        if (!versionEl || !window.appBridge?.getVersion) return;
        try {
            const version = await window.appBridge.getVersion();
            if (version) versionEl.textContent = `v${version}`;
        } catch (err) {
            console.warn('No se pudo obtener la versión', err);
        }
    }

    async function hydrateAssistantLocale() {
        try {
            const detected = (await window.appBridge?.getLocale?.()) || navigator.language || 'es';
            assistantLocale = normalizeLocale(detected);
            assistantStrings = ASSISTANT_TEXT[assistantLocale] || ASSISTANT_TEXT.es;
            assistantSystemPrompt = assistantStrings.prompt;
            notifier.setLocale?.(assistantLocale);
        } catch (e) {
            assistantLocale = 'es';
            assistantStrings = ASSISTANT_TEXT.es;
            assistantSystemPrompt = assistantStrings.prompt;
            notifier.setLocale?.('es');
        }
        applyI18n();
    }

    function loadAssistantHistory() {
        try {
            const raw = localStorage.getItem(ASSISTANT_STORE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return;
            parsed.slice(-30).forEach((m) => {
                if (m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string') {
                    assistantMessages.push({ role: m.role, content: m.content });
                }
            });
            renderAssistantMessages();
        } catch (e) {
            console.warn('No se pudo cargar el hilo de CoordinalIA', e);
        }
    }

    function saveAssistantHistory() {
        try {
            const clean = assistantMessages
                .filter(m => m.role === 'user' || m.role === 'assistant')
                .slice(-30)
                .map(m => ({ role: m.role, content: m.content }));
            localStorage.setItem(ASSISTANT_STORE_KEY, JSON.stringify(clean));
        } catch (e) {
            console.warn('No se pudo guardar el hilo de CoordinalIA', e);
        }
    }

    function setupAssistantModal() {
        if (!assistantModal || !assistantOpenBtn) return;
        const closeButtons = [assistantCloseBtn, assistantCloseFooterBtn];
        const backdrop = assistantModal.querySelector('[data-dismiss="assistant"]');

        // Botón para alternar proveedor dentro del título del modal
        const titleGroup = assistantModal.querySelector('.modal__title-group');
        if (titleGroup) {
            let existing = titleGroup.querySelector('#assistant-provider');
            assistantProviderBtn = existing;
            if (!assistantProviderBtn) {
                assistantProviderBtn = document.createElement('button');
                assistantProviderBtn.type = 'button';
                assistantProviderBtn.id = 'assistant-provider';
                assistantProviderBtn.className = 'btn btn--ghost';
                assistantProviderBtn.style.marginLeft = '0.5rem';
                titleGroup.appendChild(assistantProviderBtn);
            }
            assistantProviderBtn.addEventListener('click', () => promptAssistantProvider(true));
            renderAssistantProviderBtn();
        }

        assistantOpenBtn.addEventListener('click', openAssistantModal);
        closeButtons.forEach(btn => btn?.addEventListener('click', closeAssistantModal));
        backdrop?.addEventListener('click', closeAssistantModal);

        document.addEventListener('keydown', (evt) => {
            if (evt.key === 'Escape' && !assistantModal.classList.contains('is-hidden')) {
                closeAssistantModal();
            }
        });

        assistantForm?.addEventListener('submit', handleAssistantSubmit);
        setupAssistantVoice();
        assistantClearBtn?.addEventListener('click', clearAssistantThread);
    }

    function setupAssistantVoice() {
        if (!assistantVoiceBtn) return;

        if (!hasVoiceRecognitionSupport(window)) {
            assistantVoiceBtn.disabled = true;
            assistantVoiceBtn.title = tr('assistant.voiceUnsupported');
            return;
        }

        assistantVoiceBtn.addEventListener('click', toggleAssistantVoice);
        updateVoiceUi();
    }

    function createAssistantRecognizer() {
        const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognitionCtor) return null;
        const rec = new SpeechRecognitionCtor();
        rec.lang = getVoiceLang(assistantLocale);
        rec.interimResults = false;
        rec.continuous = false;
        rec.maxAlternatives = 1;

        rec.onstart = () => {
            assistantListening = true;
            setAssistantStatus(tr('assistant.listening'));
            updateVoiceUi();
        };

        rec.onend = () => {
            assistantListening = false;
            updateVoiceUi();
        };

        rec.onerror = (event) => {
            const code = event?.error || 'unknown';
            const isNetworkError = code === 'network';

            if (isNetworkError && !assistantVoiceStopRequested && assistantVoiceRetryCount < ASSISTANT_VOICE_MAX_RETRIES) {
                assistantVoiceRetryCount += 1;
                const waitMs = 700 * assistantVoiceRetryCount;
                setAssistantStatus(tr('assistant.networkRetry', {
                    current: assistantVoiceRetryCount,
                    max: ASSISTANT_VOICE_MAX_RETRIES,
                }));
                clearTimeout(assistantVoiceRetryTimer);
                assistantVoiceRetryTimer = setTimeout(() => {
                    startAssistantVoiceRecognition({ fromRetry: true });
                }, waitMs);
                return;
            }

            if (isNetworkError && !assistantVoiceStopRequested) {
                setAssistantStatus(tr('assistant.voiceServiceFallback'));
                assistantVoiceMode = 'recorder';
                assistantListening = false;
                updateVoiceUi();
                startVoiceRecorderFlow();
                return;
            }

            const msg = mapVoiceErrorCode(code, assistantLocale);
            setAssistantStatus(msg);
            assistantListening = false;
            updateVoiceUi();
        };

        rec.onresult = (event) => {
            const transcriptRaw = event?.results?.[0]?.[0]?.transcript || '';
            const transcript = cleanVoiceTranscript(transcriptRaw);
            if (!transcript) {
                setAssistantStatus(tr('assistant.transcriptFailed'));
                return;
            }
            if (assistantInput) assistantInput.value = transcript;
            submitAssistantFromVoice();
        };

        return rec;
    }

    function submitAssistantFromVoice() {
        setAssistantStatus(tr('assistant.textCapturedPreparing'));
        setTimeout(() => {
            if (!assistantInput?.value?.trim()) {
                setAssistantStatus(tr('assistant.textMissing'));
                return;
            }
            setAssistantStatus(tr('assistant.textCapturedSending'));
            assistantForm?.requestSubmit?.();
        }, 650);
    }

    async function ensureAssistantMicrophonePermission() {
        if (!navigator?.mediaDevices?.getUserMedia) return true;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(track => track.stop());
            return true;
        } catch (e) {
            const code = e?.name === 'NotAllowedError' ? 'not-allowed'
                : e?.name === 'NotFoundError' ? 'audio-capture'
                    : 'unknown';
            setAssistantStatus(mapVoiceErrorCode(code, assistantLocale));
            return false;
        }
    }

    function startAssistantVoiceRecognition({ fromRetry = false } = {}) {
        if (!assistantRecognizer) {
            assistantRecognizer = createAssistantRecognizer();
        }
        if (!assistantRecognizer) {
            setAssistantStatus(tr('assistant.recognitionUnavailable'));
            return;
        }

        assistantRecognizer.lang = getVoiceLang(assistantLocale);
        try {
            assistantRecognizer.start();
            if (!fromRetry) {
                setAssistantStatus(tr('assistant.listening'));
            }
        } catch (e) {
            console.warn('No se pudo iniciar reconocimiento de voz', e);
            setAssistantStatus(tr('assistant.recognitionStartFailed'));
        }
    }

    async function toggleAssistantVoice() {
        if (!assistantVoiceBtn) return;
        if (assistantListening) {
            assistantVoiceStopRequested = true;
            clearTimeout(assistantVoiceRetryTimer);
            if (assistantVoiceMode === 'recorder') {
                stopVoiceRecorderFlow();
                return;
            }
            assistantRecognizer?.stop?.();
            return;
        }

        if (navigator && 'onLine' in navigator && !navigator.onLine) {
            setAssistantStatus(tr('assistant.offline'));
            return;
        }

        const micReady = await ensureAssistantMicrophonePermission();
        if (!micReady) {
            updateVoiceUi();
            return;
        }

        assistantVoiceStopRequested = false;
        assistantVoiceRetryCount = 0;
        clearTimeout(assistantVoiceRetryTimer);

        if (assistantVoiceMode === 'recorder') {
            startVoiceRecorderFlow();
            return;
        }

        startAssistantVoiceRecognition({ fromRetry: false });
    }

    async function startVoiceRecorderFlow() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            assistantRecorderStream = stream;
            assistantRecorderChunks = [];

            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : 'audio/webm';
            assistantRecorder = new MediaRecorder(stream, { mimeType });

            assistantRecorder.ondataavailable = (evt) => {
                if (evt?.data && evt.data.size > 0) {
                    assistantRecorderChunks.push(evt.data);
                }
            };

            assistantRecorder.onstop = async () => {
                try {
                    const blob = new Blob(assistantRecorderChunks, { type: assistantRecorder.mimeType || 'audio/webm' });
                    if (!blob.size) {
                        setAssistantStatus(tr('assistant.noAudioCaptured'));
                        return;
                    }

                    setAssistantStatus(tr('assistant.transcribing'));
                    const buffer = await blob.arrayBuffer();
                    const cfg = getAssistantConfig();
                    const transcript = await window.appBridge?.transcribeAudio?.({
                        provider: cfg.provider,
                        language: getVoiceLang(assistantLocale),
                        mimeType: blob.type || 'audio/webm',
                        audioBuffer: buffer,
                    });

                    const text = cleanVoiceTranscript(transcript || '');
                    if (!text) {
                        setAssistantStatus(tr('assistant.transcriptFailed'));
                        return;
                    }

                    if (assistantInput) assistantInput.value = text;
                    submitAssistantFromVoice();
                } catch (e) {
                    console.warn('Fallo transcripción de audio', e);
                    const msg = /NO_STT_API_KEY|OPENAI_API_KEY/i.test(e?.message || '')
                        ? tr('assistant.transcribeApiKey')
                        : /STT error/i.test(e?.message || '')
                            ? tr('assistant.transcribeError', { error: (e.message || '').slice(0, 120) })
                            : tr('assistant.transcribeRecordedFail');
                    setAssistantStatus(msg);
                } finally {
                    assistantListening = false;
                    updateVoiceUi();
                    stopRecorderTracks();
                }
            };

            assistantRecorder.start();
            assistantListening = true;
            setAssistantStatus(tr('assistant.recording'));
            updateVoiceUi();
        } catch (e) {
            console.warn('No se pudo iniciar grabación de voz', e);
            setAssistantStatus(tr('assistant.recordingStartFailed'));
            assistantListening = false;
            updateVoiceUi();
            stopRecorderTracks();
        }
    }

    function stopRecorderTracks() {
        if (assistantRecorderStream) {
            assistantRecorderStream.getTracks().forEach(t => t.stop());
            assistantRecorderStream = null;
        }
    }

    function stopVoiceRecorderFlow() {
        if (assistantRecorder && assistantRecorder.state !== 'inactive') {
            assistantRecorder.stop();
        } else {
            assistantListening = false;
            updateVoiceUi();
            stopRecorderTracks();
        }
    }

    function updateVoiceUi() {
        if (!assistantVoiceBtn) return;
        assistantVoiceBtn.classList.toggle('is-listening', assistantListening);
        assistantVoiceBtn.textContent = assistantListening ? tr('assistant.voiceButtonStop') : tr('assistant.voiceButton');
        assistantVoiceBtn.title = assistantListening
            ? tr('assistant.voiceButtonStop')
            : assistantVoiceMode === 'recorder'
                ? tr('assistant.voiceRecorderMode')
                : tr('assistant.voiceTitle');
    }

    function openAssistantModal() {
        assistantModal.classList.remove('is-hidden');
        assistantModal.querySelector('.modal__dialog')?.focus?.();
        if (!assistantMessages.length) {
            appendAssistantMessage({
                role: 'assistant',
                content: assistantStrings.welcome
            });
        }
        scrollAssistantBottom();
    }

    function closeAssistantModal() {
        assistantVoiceStopRequested = true;
        clearTimeout(assistantVoiceRetryTimer);
        stopVoiceRecorderFlow();
        if (assistantListening) assistantRecognizer?.stop?.();
        assistantModal.classList.add('is-hidden');
        assistantOpenBtn?.focus();
    }

    function clearAssistantThread() {
        assistantMessages.length = 0;
        saveAssistantHistory();
        renderAssistantMessages();
        setAssistantStatus('');
        if (assistantInput) assistantInput.value = '';
    }

    async function handleAssistantSubmit(evt) {
        evt.preventDefault();
        if (!assistantInput) return;
        const text = assistantInput.value.trim();
        if (!text) return;

        appendAssistantMessage({ role: 'user', content: text });
        assistantInput.value = '';
    setAssistantStatus(tr('assistant.sending'));
        setAssistantBusy(true);

        // Consulta rápida local: eventos de hoy/semana/mes
        const quickRange = detectAssistantRange(text);
        if (quickRange) {
            const list = getEventsByRange(quickRange);
            const reply = formatAssistantEvents(list, quickRange);
            appendAssistantMessage({ role: 'assistant', content: reply });
            setAssistantStatus('');
            setAssistantBusy(false);
            scrollAssistantBottom();
            return;
        }

        const cfg = getAssistantConfig();

        const messagesForApi = buildAssistantPayload();
        try {
            const requestId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
            const assistantMsg = { role: 'assistant', content: '', requestId };
            appendAssistantMessage(assistantMsg);
            let safetyTimer = null;

            if (!window.appBridge?.chatStream) {
                throw new Error(tr('assistant.desktopOnly'));
            }

            // Suscribir a los chunks de streaming
            assistantUnsubscribe?.();
            assistantUnsubscribe = window.appBridge.onAssistantChunk((data) => {
                if (!data || data.requestId !== requestId) return;
                if (data.delta) {
                    assistantMsg.content += data.delta;
                    renderAssistantMessages();
                } else if (typeof data.content === 'string' && data.content.length > assistantMsg.content.length) {
                    // Fallback cuando el proveedor envía el texto completo en cada chunk
                    assistantMsg.content = data.content;
                    renderAssistantMessages();
                }
                if (data.done) {
                    setAssistantStatus('');
                    setAssistantBusy(false);
                    assistantUnsubscribe?.();
                    assistantUnsubscribe = null;
                    if (safetyTimer) clearTimeout(safetyTimer);
                }
                scrollAssistantBottom();
            });

            // Cortafuegos por si el streaming no termina nunca
            safetyTimer = setTimeout(() => {
                setAssistantStatus(tr('assistant.noResponse'));
                setAssistantBusy(false);
                assistantUnsubscribe?.();
                assistantUnsubscribe = null;
                scrollAssistantBottom();
            }, 45000);

            let finalReply = '';
            try {
                finalReply = await window.appBridge.chatStream({
                    messages: messagesForApi,
                    requestId,
                    provider: cfg.provider
                });
            } catch (streamErr) {
                console.error('assistant stream failed, fallback to non-stream', streamErr);
                setAssistantStatus(tr('assistant.streamFallback'));
                // Fallback sin streaming para no dejar colgado el UI
                finalReply = await window.appBridge.chat({
                    messages: messagesForApi,
                    provider: cfg.provider,
                    retry: true
                });
            }

            if (safetyTimer) clearTimeout(safetyTimer);
            if (!assistantMsg.content) {
                assistantMsg.content = finalReply || tr('assistant.noResponse');
                renderAssistantMessages();
            }
            handleAssistantAction(assistantMsg.content);
            setAssistantStatus('');
        } catch (err) {
            console.error('assistant error', err);
            const rawMsg = err?.message || tr('assistant.contactError');
            const msg = /NO_API_KEY|Falta API key/i.test(rawMsg)
                ? tr('assistant.missingApiKey')
                : rawMsg;
            appendAssistantMessage({ role: 'assistant', content: `⚠️ ${msg}` });
            setAssistantStatus(msg);
        } finally {
            assistantUnsubscribe = null;
            setAssistantBusy(false);
            scrollAssistantBottom();
        }
    }

    function appendAssistantMessage(message) {
        assistantMessages.push(message);
        renderAssistantMessages();
        saveAssistantHistory();
    }

    function renderAssistantMessages() {
        if (!assistantThread) return;
        assistantThread.innerHTML = '';
        assistantMessages.slice(-20).forEach((msg) => {
            const div = document.createElement('div');
            div.className = `assistant-msg assistant-msg--${msg.role}`;
            div.textContent = msg.content;
            assistantThread.appendChild(div);
        });
    }

    function buildAssistantPayload() {
        const history = assistantMessages
            .filter(m => m.role === 'user' || m.role === 'assistant')
            .slice(-12);
        const context = buildAssistantContext();
        const base = [{ role: 'system', content: assistantSystemPrompt }];
        if (context) base.push({ role: 'system', content: context });
        return [...base, ...history];
    }

    function handleAssistantAction(content = '') {
        const action = extractAssistantAction(content);
        if (!action || action.action !== 'create_event') return;

        const validation = validateEventPayload(action, assistantLocale);
        if (!validation.ok) {
            appendAssistantMessage({ role: 'assistant', content: validation.error });
            return;
        }

        const evt = toEventPayload(validation.data);
        const events = getEvents();
        events.push(evt);
        saveEvents(events);
        renderAll();
        try { notifier.scheduleFor(evt); } catch (e) { console.warn('Schedule failed', e); }

        const confirmText = tr('assistant.eventCreated', {
            title: evt.title,
            date: evt.date,
            start: evt.start,
            end: evt.end,
        });
        appendAssistantMessage({ role: 'assistant', content: confirmText });

        if (validation?.data?.autoCompletedEnd) {
            const autoText = tr('assistant.autoEnd', { end: evt.end });
            appendAssistantMessage({ role: 'assistant', content: autoText });
        }
    }

    function buildAssistantContext() {
        const events = sortEvents(getEvents());
        const today = new Date();
        const todayFloor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const upcoming = events
            .filter(ev => {
                const d = parseLocalDate(ev.date);
                return d && d >= todayFloor;
            })
            .slice(0, 5);

        if (!upcoming.length) return '';

        const lines = upcoming.map(ev => {
            const desc = ev.description ? ` — ${ev.description}` : '';
            return `- ${ev.date} ${ev.start}-${ev.end} ${ev.title}${desc}`;
        });
        return `Agenda context (max 5 upcoming):\n${lines.join('\n')}`;
    }

    function setAssistantStatus(text) {
        if (assistantStatus) assistantStatus.textContent = text;
    }

    function setAssistantBusy(isBusy) {
        if (assistantSendBtn) assistantSendBtn.disabled = isBusy;
        if (assistantInput) assistantInput.disabled = isBusy;
        if (assistantVoiceBtn) assistantVoiceBtn.disabled = isBusy;
    }

    function scrollAssistantBottom() {
        if (!assistantThread) return;
        requestAnimationFrame(() => {
            assistantThread.scrollTop = assistantThread.scrollHeight;
        });
    }
})();
