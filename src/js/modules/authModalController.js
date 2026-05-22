import { getSession, login, loginWithGoogle, logout, register } from './authClient.js';

function $(id) { return document.getElementById(id); }

export function initAuthModals() {
    const loginLink = $('authLoginLink');
    const registerLink = $('authRegisterLink');
    const logoutBtn = $('authLogoutBtn');

    const loginModal = $('authLoginModal');
    const registerModal = $('authRegisterModal');

    const loginForm = $('authLoginForm');
    const registerForm = $('authRegisterForm');

    const loginError = $('authLoginError');
    const registerError = $('authRegisterError');

    const userBox = $('siteHeaderAuthUser');
    const linksBox = $('siteHeaderAuthLinks');
    const userName = $('authUserName');

    if (!loginLink || !registerLink || !loginModal || !registerModal) return;

    const setSessionUi = () => {
        const session = getSession();
        const loggedIn = !!session?.userId;

        userBox?.classList.toggle('is-hidden', !loggedIn);
        linksBox?.classList.toggle('is-hidden', loggedIn);
        if (userName && loggedIn) userName.textContent = session.name || session.email || 'Usuario';
    };

    const openModal = (el) => {
        el.classList.remove('is-hidden');
        el.setAttribute('aria-hidden', 'false');
    };

    const closeModal = (el) => {
        el.classList.add('is-hidden');
        el.setAttribute('aria-hidden', 'true');
    };

    loginLink.addEventListener('click', () => openModal(loginModal));
    registerLink.addEventListener('click', () => openModal(registerModal));
    logoutBtn?.addEventListener('click', () => { logout(); setSessionUi(); });

    document.querySelectorAll('[data-auth-close="login"]').forEach((el) => {
        el.addEventListener('click', () => closeModal(loginModal));
    });
    document.querySelectorAll('[data-auth-close="register"]').forEach((el) => {
        el.addEventListener('click', () => closeModal(registerModal));
    });

    loginForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        loginError.textContent = '';
        const data = new FormData(loginForm);
        try {
            await login({
                email: data.get('email'),
                password: data.get('password'),
            });
            closeModal(loginModal);
            setSessionUi();
        } catch {
            loginError.textContent = 'Credenciales inválidas.';
        }
    });

    registerForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        registerError.textContent = '';
        const data = new FormData(registerForm);
        try {
            await register({
                name: data.get('name'),
                email: data.get('email'),
                password: data.get('password'),
            });
            closeModal(registerModal);
            setSessionUi();
        } catch (err) {
            registerError.textContent = err?.message === 'EMAIL_ALREADY_EXISTS'
                ? 'Ese email ya está registrado.'
                : 'No se pudo registrar.';
        }
    });

    $('authLoginGoogleBtn')?.addEventListener('click', async () => {
        try { await loginWithGoogle(); } catch { loginError.textContent = 'Google aún no implementado.'; }
    });
    $('authRegisterGoogleBtn')?.addEventListener('click', async () => {
        try { await loginWithGoogle(); } catch { registerError.textContent = 'Google aún no implementado.'; }
    });

    setSessionUi();
}