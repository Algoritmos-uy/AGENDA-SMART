const ALLOWED_ROLES = new Set(['system', 'user', 'assistant']);
const MAX_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 4000;
const MAX_TOTAL_CHARS = 24000;

function sanitizeContent(value) {
  if (typeof value !== 'string') return '';
  let out = '';
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    const code = ch.charCodeAt(0);
    const isSafeControl = code === 9 || code === 10 || code === 13; // tab, \n, \r
    const isForbidden = (code >= 0 && code <= 31 && !isSafeControl) || code === 127;
    if (!isForbidden) out += ch;
  }
  return out.trim();
}

function normalizeMessages(messages = []) {
  if (!Array.isArray(messages)) {
    const err = new Error('Formato de mensajes inválido');
    err.code = 'INVALID_MESSAGES';
    throw err;
  }

  const normalized = messages
    .filter((m) => m && typeof m === 'object')
    .map((m) => {
      const role = typeof m.role === 'string' ? m.role.trim() : '';
      const content = sanitizeContent(m.content);
      return {
        role: ALLOWED_ROLES.has(role) ? role : null,
        content: content.slice(0, MAX_MESSAGE_CHARS),
      };
    })
    .filter((m) => m.role && m.content.length > 0)
    .slice(-MAX_MESSAGES);

  if (!normalized.length) {
    const err = new Error('No hay mensajes válidos para enviar');
    err.code = 'EMPTY_MESSAGES';
    throw err;
  }

  let total = 0;
  const bounded = [];
  for (const msg of normalized) {
    const remaining = MAX_TOTAL_CHARS - total;
    if (remaining <= 0) break;
    const content = msg.content.slice(0, remaining);
    if (!content) break;
    bounded.push({ role: msg.role, content });
    total += content.length;
  }

  if (!bounded.length) {
    const err = new Error('Payload excede límites permitidos');
    err.code = 'PAYLOAD_TOO_LARGE';
    throw err;
  }

  return bounded;
}

module.exports = {
  normalizeMessages,
  sanitizeContent,
  limits: {
    MAX_MESSAGES,
    MAX_MESSAGE_CHARS,
    MAX_TOTAL_CHARS,
  },
};
