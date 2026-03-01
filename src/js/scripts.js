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

        form.addEventListener('submit', handleSubmit);
        resetBtn.addEventListener('click', resetForm);
        viewButtons.forEach(btn => btn.addEventListener('click', handleViewSwitch));
        baseDateInput.addEventListener('change', renderAll);
        weeklyPrevBtn?.addEventListener('click', () => shiftBaseDateDays(-7));
        weeklyNextBtn?.addEventListener('click', () => shiftBaseDateDays(7));
        monthlyPrevBtn?.addEventListener('click', () => shiftBaseDateMonths(-1));
        monthlyNextBtn?.addEventListener('click', () => shiftBaseDateMonths(1));

        hydrateVersion();
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
})();
