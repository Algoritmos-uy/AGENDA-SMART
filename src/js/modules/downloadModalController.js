export function initDownloadModal() {
    const openBtn = document.getElementById('downloadAppLink');
    const modal = document.getElementById('downloadAppModal');
    if (!openBtn || !modal) return;

    const closeElements = modal.querySelectorAll('[data-download-close="modal"]');

    const open = () => {
        modal.classList.remove('is-hidden');
        modal.setAttribute('aria-hidden', 'false');
    };

    const close = () => {
        modal.classList.add('is-hidden');
        modal.setAttribute('aria-hidden', 'true');
    };

    openBtn.addEventListener('click', open);
    closeElements.forEach((el) => el.addEventListener('click', close));

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.classList.contains('is-hidden')) close();
    });
}