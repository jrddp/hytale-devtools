export function toCamelCase(str: string): string {
    return str
        .replace(/[^a-zA-Z0-9]+(.)/g, (match, chr) => chr.toUpperCase())
        .replace(/^[A-Z]/, chr => chr.toLowerCase());
}

export function toKebabCase(str: string): string {
    return str
        .replace(/([a-z])([A-Z])/g, '$1-$2')
        .replace(/[\s_]+/g, '-')
        .toLowerCase();
}

export function replaceTokens(content: string, replacements: Record<string, string>): string {
    let result = content;
    for (const [key, value] of Object.entries(replacements)) {
        result = result.split(key).join(value);
    }
    return result;
}
