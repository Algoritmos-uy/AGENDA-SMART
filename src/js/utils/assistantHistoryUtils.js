const DEFAULT_HISTORY_LIMIT = 30;
const LEGACY_DESKTOP_ONLY_RX = /(available only in the desktop app|solo en la app de escritorio|apenas no app desktop).*(electron)/i;

function isAllowedRole(role = '') {
    return role === 'user' || role === 'assistant';
}

export function compactAssistantHistory(messages = [], limit = DEFAULT_HISTORY_LIMIT) {
    return (Array.isArray(messages) ? messages : [])
        .filter(m => m && isAllowedRole(m.role) && typeof m.content === 'string')
        .slice(-Math.max(1, Number(limit) || DEFAULT_HISTORY_LIMIT))
        .map(m => ({ role: m.role, content: m.content }));
}

export function parseAssistantHistory(raw = '', options = {}) {
    const limit = Math.max(1, Number(options.limit) || DEFAULT_HISTORY_LIMIT);
    const omitLegacyDesktopOnly = options.omitLegacyDesktopOnly !== false;

    if (!raw || typeof raw !== 'string') return [];

    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return [];
    }

    const compact = compactAssistantHistory(parsed, limit);
    if (!omitLegacyDesktopOnly) return compact;

    return compact.filter((m) => {
        if (m.role !== 'assistant') return true;
        return !LEGACY_DESKTOP_ONLY_RX.test(m.content);
    });
}

export function buildAssistantPayloadMessages({
    messages = [],
    systemPrompt = '',
    context = '',
    historyLimit = 12,
} = {}) {
    const history = compactAssistantHistory(messages, historyLimit);
    const base = [{ role: 'system', content: String(systemPrompt || '') }];
    if (context) base.push({ role: 'system', content: context });
    return [...base, ...history];
}

export function selectAssistantThreadMessages(messages = [], limit = 20) {
    return (Array.isArray(messages) ? messages : [])
        .slice(-Math.max(1, Number(limit) || 20));
}
