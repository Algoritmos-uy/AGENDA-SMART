import { Notifier } from './notifications.js';

// Módulo IIFE: aísla la lógica de la agenda en un ámbito propio.
(() => {
    const notifier = new Notifier();

    // Clave única para persistir en localStorage.
    const STORAGE_KEY = 'agenda-online-events';

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
    const assistantModal = document.getElementById('assistant-modal');
    const assistantCloseBtn = document.getElementById('assistant-close');
    const assistantCloseFooterBtn = document.getElementById('assistant-close-footer');
    const assistantThread = document.getElementById('assistant-thread');
    const assistantForm = document.getElementById('assistant-form');
    const assistantInput = document.getElementById('assistant-input');
    const assistantStatus = document.getElementById('assistant-status');
    const assistantSendBtn = document.getElementById('assistant-send');
    const assistantClearBtn = document.getElementById('assistant-clear');

    const ASSISTANT_STORE_KEY = 'coordinalia-thread';
    const ASSISTANT_TEXT = {
        es: {
            prompt: 'Eres CoordinalIA, asistente de Agenda Inteligente. Tono: profesional y cercano, empático y claro. Responde breve, en español, y ayuda a gestionar eventos (crear, listar, reprogramar) con pasos concretos. Si falta la API key, indica de forma amable que se debe configurar DEEPSEEK_API_KEY. Si el usuario pide crear/agendar un evento y tienes título, fecha (YYYY-MM-DD), inicio (HH:mm) y fin (HH:mm), responde con un único bloque JSON plano con la forma {"action":"create_event","title":"...","date":"YYYY-MM-DD","start":"HH:mm","end":"HH:mm","description":"...","color":"#2563eb"}. No uses más texto fuera del JSON. Si falta algún dato, pídele al usuario solo ese dato faltante.',
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
            prompt: 'You are CoordinalIA, assistant of Smart Agenda. Tone: professional yet friendly and clear. Reply briefly in English and help manage events (create, list, reschedule) with concrete steps. If the API key is missing, politely say DEEPSEEK_API_KEY must be configured. If the user asks to create/schedule an event and you have title, date (YYYY-MM-DD), start (HH:mm), end (HH:mm), answer with a single plain JSON block: {"action":"create_event","title":"...","date":"YYYY-MM-DD","start":"HH:mm","end":"HH:mm","description":"...","color":"#2563eb"}. Do not add extra text outside JSON. If a field is missing, ask only for that missing field.',
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
            prompt: 'Você é a CoordinalIA, assistente da Agenda Inteligente. Tom: profissional e próximo, claro e empático. Responda de forma breve, em português, ajudando a gerir eventos (criar, listar, reagendar) com passos concretos. Se faltar a API key, avise gentilmente que é preciso configurar DEEPSEEK_API_KEY. Se o usuário pedir para criar/agendar um evento e você tiver título, data (AAAA-MM-DD), início (HH:mm) e fim (HH:mm), responda com um único JSON simples: {"action":"create_event","title":"...","date":"AAAA-MM-DD","start":"HH:mm","end":"HH:mm","description":"...","color":"#2563eb"}. Não adicione texto fora do JSON. Se faltar algum campo, peça apenas esse campo faltante.',
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

    const assistantMessages = [];
    let assistantUnsubscribe = null;
    let assistantLocale = 'es';
    let assistantStrings = ASSISTANT_TEXT.es;
    let assistantSystemPrompt = assistantStrings.prompt;

    document.addEventListener('DOMContentLoaded', init);

    // Configuración inicial: valores por defecto, listeners y primer render.
    async function init() {
        const today = new Date();
        baseDateInput.value = formatISODate(today);
        dateInput.value = formatISODate(today);
        startInput.value = '09:00';
        endInput.value = '10:00';

        startClock();
        try { await notifier.init(); } catch (e) { console.warn('Notifier init failed', e); }
        renderAll();
        try { notifier.rescheduleAll(getEvents()); } catch (e) { console.warn('Reschedule failed', e); }

    await hydrateAssistantLocale();
    loadAssistantHistory();

        form.addEventListener('submit', handleSubmit);
        resetBtn.addEventListener('click', resetForm);
        viewButtons.forEach(btn => btn.addEventListener('click', handleViewSwitch));
        baseDateInput.addEventListener('change', renderAll);
        weeklyPrevBtn?.addEventListener('click', () => shiftBaseDateDays(-7));
        weeklyNextBtn?.addEventListener('click', () => shiftBaseDateDays(7));
        monthlyPrevBtn?.addEventListener('click', () => shiftBaseDateMonths(-1));
        monthlyNextBtn?.addEventListener('click', () => shiftBaseDateMonths(1));

        hydrateVersion();
        setupAssistantModal();
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
            setStatus('Evento actualizado', 'success');
        } else {
            payload.id = generateId();
            events.push(payload);
            setStatus('Evento guardado', 'success');
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
        submitBtn.textContent = 'Guardar evento';
        setStatus('');
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

        if (!title || !date || !start || !end) {
            setStatus('Completa título, fecha y horas.', 'danger');
            return null;
        }

        if (end <= start) {
            setStatus('La hora de fin debe ser posterior a la de inicio.', 'danger');
            return null;
        }

        return { id, title, date, start, end, description, color };
    }

    // Muestra mensajes de estado contextuales.
    function setStatus(message, type = 'muted') {
        statusEl.textContent = message;
        statusEl.className = `status ${type ? `text-${type}` : ''}`.trim();
    }

    // CRUD: leer y guardar desde/para localStorage.
    function getEvents() {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    }

    function saveEvents(list) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
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
        if (dailyCaption) dailyCaption.textContent = base.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

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
                <div class="week-day__label">${day.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
                <div class="week-day__events"></div>
            `;

            const list = column.querySelector('.week-day__events');
            if (!dayEvents.length) {
                list.innerHTML = '<p class="muted">Sin eventos</p>';
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
        if (monthlyCaption) monthlyCaption.textContent = startMonth.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

        monthlyGridEl.innerHTML = '';
        for (let d = 1; d <= endMonth.getDate(); d++) {
            const day = new Date(base.getFullYear(), base.getMonth(), d);
            const dayEvents = events.filter(e => sameDate(e.date, day));
            const cell = document.createElement('div');
            cell.className = 'month-day';
            cell.innerHTML = `
                <div class="month-day__header">
                    <span>${d}</span>
                    <span class="muted">${day.toLocaleDateString('es-ES', { weekday: 'short' })}</span>
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
            eventListEl.innerHTML = '<p class="muted">No hay eventos aún. Crea el primero.</p>';
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
                    <span>${formatReadableDate(ev.date)}</span>
                    <span>${ev.start} - ${ev.end}</span>
                    ${ev.description ? `<span class="badge">${ev.description}</span>` : ''}
                </div>
                <div class="event-card__actions">
                    <button class="btn btn--ghost" data-action="edit">Editar</button>
                    <button class="btn btn--ghost" data-action="delete">Eliminar</button>
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
        setStatus('Evento eliminado');
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
        submitBtn.textContent = 'Actualizar evento';
        setStatus('Editando evento. Guarda o cancela.', 'muted');
    }

    // Helpers
    function normalizeViewTarget(target) {
        const map = { day: 'daily', week: 'weekly', month: 'monthly', diaria: 'daily', semanal: 'weekly', mensual: 'monthly' };
        return map[target] || target;
    }

    // Construye slots horarios (por defecto de 08:00 a 20:00).
    function buildSlots(startHour = 8, endHour = 20, slotDuration = 60) {
        const slots = [];
        for (let h = startHour; h < endHour; h++) {
            const from = `${String(h).padStart(2, '0')}:00`;
            const to = `${String(h + 1).padStart(2, '0')}:00`;
            slots.push({ start: from, end: to, label: `${from} - ${to}` });
        }
        return slots;
    }

    // Determina si un evento cae dentro de un slot horario.
    function isInSlot(event, slot) {
        return event.start >= slot.start && event.start < slot.end;
    }

    // Compara fechas (YYYY-MM-DD) ignorando hora.
    function sameDate(dateStr, dateObj) {
        const compare = typeof dateObj === 'string' ? parseLocalDate(dateObj) : dateObj;
        return dateStr === formatISODate(compare);
    }

    // Formatea a cadena ISO corta, corrigiendo timezone local.
    function formatISODate(date) {
        return new Date(date.getFullYear(), date.getMonth(), date.getDate())
            .toISOString()
            .split('T')[0];
    }

    // Fecha legible en español.
    function formatReadableDate(dateStr) {
        const d = parseLocalDate(dateStr);
        return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    }

    // Devuelve el lunes de la semana de una fecha dada.
    function startOfWeek(date) {
        const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const day = d.getDay();
        const diff = (day === 0 ? -6 : 1) - day; // lunes como inicio
        d.setDate(d.getDate() + diff);
        return d;
    }

    // Suma días a una fecha.
    function addDays(date, days) {
        const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        d.setDate(d.getDate() + days);
        return d;
    }

    function addMonths(date, months) {
        const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        d.setMonth(d.getMonth() + months);
        return d;
    }

    // Ordena eventos por fecha y hora de inicio.
    function sortEvents(events) {
        return [...events].sort((a, b) => {
            if (a.date === b.date) return a.start.localeCompare(b.start);
            return a.date.localeCompare(b.date);
        });
    }

    // Genera un id único con fallback si randomUUID no está disponible (WebView antiguos).
    function generateId() {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
        return 'ev-' + Math.random().toString(16).slice(2) + Date.now().toString(16);
    }

    function normalizeLocale(locale) {
        const lc = (locale || '').toLowerCase();
        if (lc.startsWith('en')) return 'en';
        if (lc.startsWith('pt')) return 'pt';
        return 'es';
    }

    function detectAssistantRange(text = '') {
        const t = text.toLowerCase();
        if (/(hoy|today|hoje)\b/.test(t)) return 'today';
        if (/(semana|week|semana)/.test(t)) return 'week';
        if (/(mes|mes\s|month|mês|m\u00eas)/.test(t)) return 'month';
        return null;
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
            return (noEvents && noEvents[range]) || 'Sin eventos.';
        }
        const title = (headers && headers[range]) || 'Eventos:';
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
            clockEl.textContent = now.toLocaleTimeString('es-ES', { hour12: false });
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
        } catch (e) {
            assistantLocale = 'es';
            assistantStrings = ASSISTANT_TEXT.es;
            assistantSystemPrompt = assistantStrings.prompt;
        }
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

        assistantOpenBtn.addEventListener('click', openAssistantModal);
        closeButtons.forEach(btn => btn?.addEventListener('click', closeAssistantModal));
        backdrop?.addEventListener('click', closeAssistantModal);

        document.addEventListener('keydown', (evt) => {
            if (evt.key === 'Escape' && !assistantModal.classList.contains('is-hidden')) {
                closeAssistantModal();
            }
        });

        assistantForm?.addEventListener('submit', handleAssistantSubmit);
        assistantClearBtn?.addEventListener('click', clearAssistantThread);
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
        setAssistantStatus('Enviando...');
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

        const messagesForApi = buildAssistantPayload();
        try {
            const requestId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
            const assistantMsg = { role: 'assistant', content: '', requestId };
            appendAssistantMessage(assistantMsg);

            if (!window.appBridge?.chatStream) {
                throw new Error('Disponible solo en la app de escritorio (Electron)');
            }

            // Suscribir a los chunks de streaming
            assistantUnsubscribe?.();
            assistantUnsubscribe = window.appBridge.onAssistantChunk((data) => {
                if (!data || data.requestId !== requestId) return;
                if (data.delta) {
                    assistantMsg.content += data.delta;
                    renderAssistantMessages();
                }
                if (data.done) {
                    setAssistantStatus('');
                    setAssistantBusy(false);
                    assistantUnsubscribe?.();
                }
            });

            const finalReply = await window.appBridge.chatStream(messagesForApi, requestId);
            if (!assistantMsg.content) {
                assistantMsg.content = finalReply || 'Sin respuesta del asistente.';
                renderAssistantMessages();
            }
            handleAssistantAction(assistantMsg.content);
            setAssistantStatus('');
        } catch (err) {
            console.error('assistant error', err);
            const msg = err?.message || 'Error al contactar el asistente';
            appendAssistantMessage({ role: 'assistant', content: `⚠️ ${msg}` });
            setAssistantStatus(msg);
        } finally {
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

        const validation = validateEventPayload(action);
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

        const confirmText = assistantLocale === 'en'
            ? `Event created: ${evt.title} on ${evt.date} ${evt.start}-${evt.end}.`
            : assistantLocale === 'pt'
                ? `Evento criado: ${evt.title} em ${evt.date} ${evt.start}-${evt.end}.`
                : `Evento creado: ${evt.title} el ${evt.date} ${evt.start}-${evt.end}.`;
        appendAssistantMessage({ role: 'assistant', content: confirmText });
    }

    function extractAssistantAction(content = '') {
        const match = content.match(/\{[\s\S]*\}/);
        if (!match) return null;
        try {
            return JSON.parse(match[0]);
        } catch (e) {
            return null;
        }
    }

    function validateEventPayload(obj = {}) {
        const errors = [];
        const title = (obj.title || '').trim();
        const date = (obj.date || '').trim();
        const start = (obj.start || '').trim();
        const end = (obj.end || '').trim();
        const description = (obj.description || '').trim();
        const color = (obj.color || '#2563eb').trim();

        if (!title) errors.push('Falta título.');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.push('Fecha inválida (YYYY-MM-DD).');
        if (!/^\d{2}:\d{2}$/.test(start)) errors.push('Hora de inicio inválida (HH:MM).');
        if (!/^\d{2}:\d{2}$/.test(end)) errors.push('Hora de fin inválida (HH:MM).');
        if (start && end && end <= start) errors.push('La hora de fin debe ser posterior a la de inicio.');

        if (errors.length) {
            return { ok: false, error: errors.join(' ') };
        }
        return { ok: true, data: { title, date, start, end, description, color } };
    }

    function toEventPayload(data) {
        return {
            id: generateId(),
            title: data.title,
            date: data.date,
            start: data.start,
            end: data.end,
            description: data.description || '',
            color: data.color || '#2563eb'
        };
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
        return 'Contexto de agenda (máx 5 próximos):\n' + lines.join('\n');
    }

    function setAssistantStatus(text) {
        if (assistantStatus) assistantStatus.textContent = text;
    }

    function setAssistantBusy(isBusy) {
        if (assistantSendBtn) assistantSendBtn.disabled = isBusy;
        if (assistantInput) assistantInput.disabled = isBusy;
    }

    function scrollAssistantBottom() {
        if (!assistantThread) return;
        requestAnimationFrame(() => {
            assistantThread.scrollTop = assistantThread.scrollHeight;
        });
    }
})();
