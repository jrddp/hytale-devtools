export function parseJsonc(text: string): unknown {
    const withoutBom = stripBom(text);
    const withoutComments = stripJsonComments(withoutBom);
    const withoutTrailingCommas = stripTrailingCommas(withoutComments);
    return JSON.parse(withoutTrailingCommas);
}

function stripBom(text: string): string {
    if (text.charCodeAt(0) === 0xFEFF) {
        return text.slice(1);
    }
    return text;
}

function stripJsonComments(text: string): string {
    let result = '';
    let inString = false;
    let escaping = false;

    for (let index = 0; index < text.length; index += 1) {
        const current = text[index];
        const next = index + 1 < text.length ? text[index + 1] : '';

        if (inString) {
            result += current;
            if (escaping) {
                escaping = false;
            } else if (current === '\\') {
                escaping = true;
            } else if (current === '"') {
                inString = false;
            }
            continue;
        }

        if (current === '"') {
            inString = true;
            result += current;
            continue;
        }

        if (current === '/' && next === '/') {
            index += 2;
            while (index < text.length && text[index] !== '\n') {
                index += 1;
            }
            if (index < text.length) {
                result += text[index];
            }
            continue;
        }

        if (current === '/' && next === '*') {
            index += 2;
            while (index + 1 < text.length && !(text[index] === '*' && text[index + 1] === '/')) {
                index += 1;
            }
            if (index + 1 < text.length) {
                index += 1;
            }
            continue;
        }

        result += current;
    }

    return result;
}

function stripTrailingCommas(text: string): string {
    let result = '';
    let inString = false;
    let escaping = false;

    for (let index = 0; index < text.length; index += 1) {
        const current = text[index];

        if (inString) {
            result += current;
            if (escaping) {
                escaping = false;
            } else if (current === '\\') {
                escaping = true;
            } else if (current === '"') {
                inString = false;
            }
            continue;
        }

        if (current === '"') {
            inString = true;
            result += current;
            continue;
        }

        if (current === ',') {
            let lookahead = index + 1;
            while (lookahead < text.length && /\s/.test(text[lookahead])) {
                lookahead += 1;
            }

            if (lookahead < text.length && (text[lookahead] === '}' || text[lookahead] === ']')) {
                continue;
            }
        }

        result += current;
    }

    return result;
}
