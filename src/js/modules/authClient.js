const AUTH_USERS_KEY = 'agenda-auth-users';
const AUTH_SESSION_KEY = 'agenda-auth-session';

function readJson(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
}

function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}

export function getSession() {
    return readJson(AUTH_SESSION_KEY, null);
}

export function logout() {
    localStorage.removeItem(AUTH_SESSION_KEY);
}

export async function register({ name, email, password }) {
    const users = readJson(AUTH_USERS_KEY, []);
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (users.some((u) => u.email === normalizedEmail)) {
        throw new Error('EMAIL_ALREADY_EXISTS');
    }

    const user = {
        id: crypto.randomUUID(),
        name: String(name || '').trim(),
        email: normalizedEmail,
        password: String(password || ''),
    };

    users.push(user);
    writeJson(AUTH_USERS_KEY, users);

    const session = { userId: user.id, name: user.name, email: user.email };
    writeJson(AUTH_SESSION_KEY, session);
    return session;
}

export async function login({ email, password }) {
    const users = readJson(AUTH_USERS_KEY, []);
    const normalizedEmail = String(email || '').trim().toLowerCase();

    const user = users.find((u) => u.email === normalizedEmail && u.password === String(password || ''));
    if (!user) throw new Error('INVALID_CREDENTIALS');

    const session = { userId: user.id, name: user.name, email: user.email };
    writeJson(AUTH_SESSION_KEY, session);
    return session;
}

export async function loginWithGoogle() {
    throw new Error('GOOGLE_NOT_IMPLEMENTED');
}