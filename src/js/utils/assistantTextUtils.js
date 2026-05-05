export function toPlainAssistantText(value = '') {
    const raw = String(value || '');
    if (!raw.trim()) return '';

    let out = raw.replace(/\r/g, '');

    // Bloques de código y código inline
    out = out.replace(/```[\w-]*\n?/g, '');
    out = out.replace(/```/g, '');
    out = out.replace(/`([^`]+)`/g, '$1');

    // Imágenes y enlaces markdown
    out = out.replace(/!\[[^\]]*\]\([^)]*\)/g, '');
    out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');

    // Encabezados, citas y listas
    out = out.replace(/^\s{0,3}#{1,6}\s+/gm, '');
    out = out.replace(/^\s{0,3}>\s?/gm, '');
    out = out.replace(/^\s*[-*+]\s+/gm, '');
    out = out.replace(/^\s*\d+\.\s+/gm, '');

    // Énfasis markdown
    out = out.replace(/\*\*([^*]+)\*\*/g, '$1');
    out = out.replace(/__([^_]+)__/g, '$1');
    out = out.replace(/\*([^*]+)\*/g, '$1');
    out = out.replace(/_([^_]+)_/g, '$1');
    out = out.replace(/~~([^~]+)~~/g, '$1');

    // Tablas simples
    out = out.replace(/^\s*\|?\s*:?[-]{2,}:?\s*(\|\s*:?[-]{2,}:?\s*)+\|?\s*$/gm, '');
    out = out.replace(/\|/g, ' ');

    // Limpieza de espacios/saltos
    out = out
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();

    return out;
}