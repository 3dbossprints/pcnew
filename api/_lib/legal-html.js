const UNSAFE_ELEMENTS = /<(script|style|iframe|object|embed|link|meta|base|form|svg|math)\b[\s\S]*?<\/\1\s*>/gi;
const UNSAFE_TAGS = /<\/?(script|style|iframe|object|embed|link|meta|base|form|svg|math|frame|frameset)\b[^>]*>/gi;
const EVENT_HANDLERS = /\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const SCRIPT_URLS = /(\s(?:href|src|action|formaction|xlink:href)\s*=\s*)(["']?)\s*(?:javascript|vbscript|data):[^"'\s>]*\2/gi;

export function sanitizeLegalHtml(value) {
  return String(value ?? "")
    .replace(UNSAFE_ELEMENTS, "")
    .replace(UNSAFE_TAGS, "")
    .replace(EVENT_HANDLERS, "")
    .replace(SCRIPT_URLS, '$1"#"');
}
