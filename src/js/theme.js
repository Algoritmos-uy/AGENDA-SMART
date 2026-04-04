// Control simple de tema claro/oscuro con persistencia en localStorage.
(() => {
    const STORAGE_KEY = 'agenda-theme';
    const root = document.documentElement;
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const saved = localStorage.getItem(STORAGE_KEY);
    const initial = saved || (prefersDark ? 'dark' : 'light');

    applyTheme(initial);

    document.addEventListener('DOMContentLoaded', () => {
        const toggleBtn = document.getElementById('theme-toggle');
        if (!toggleBtn) return;
        updateButtonLabel(initial, toggleBtn);

        toggleBtn.addEventListener('click', () => {
            const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
            applyTheme(next);
            updateButtonLabel(next, toggleBtn);
        });
    });

    function applyTheme(theme) {
        root.dataset.theme = theme;
        localStorage.setItem(STORAGE_KEY, theme);
    }

    function updateButtonLabel(theme, btn) {
        const isDark = theme === 'dark';
        const lang = String(document?.documentElement?.lang || 'es').toLowerCase();
        const labels = lang.startsWith('en')
            ? { dark: 'Dark', light: 'Light' }
            : lang.startsWith('pt')
                ? { dark: 'Escuro', light: 'Claro' }
                : { dark: 'Oscuro', light: 'Claro' };
        btn.textContent = isDark ? labels.light : labels.dark;
        btn.setAttribute('aria-pressed', String(isDark));
    }
})();
