/**
 * Lightweight installer UI helpers.
 *
 * Goal: provide a premium, guided terminal experience without external deps.
 */
type Color = 'reset' | 'bold' | 'dim' | 'cyan' | 'green' | 'yellow' | 'red';

const ANSI: Record<Color, string> = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
};

function supportsColor(): boolean {
    if (process.env.NO_COLOR) return false;
    if (process.env.FORCE_COLOR === '0') return false;
    return Boolean(process.stdout.isTTY);
}

const COLOR = supportsColor();

function paint(value: string, color: Color): string {
    if (!COLOR) return value;
    return `${ANSI[color]}${value}${ANSI.reset}`;
}

function colorizeLogoLine(line: string): string {
    if (!COLOR) return line;

    let out = '';
    for (const ch of line) {
        if (ch === '█') {
            out += paint(ch, 'green');
            continue;
        }
        if (ch === '▒') {
            out += paint(ch, 'cyan');
            continue;
        }
        if (ch === '░') {
            out += paint(ch, 'dim');
            continue;
        }
        if ('╓╖╙╜║─'.includes(ch)) {
            out += paint(ch, 'cyan');
            continue;
        }
        out += ch;
    }
    return out;
}

export function uiLine(value = ''): void {
    console.log(value);
}

export type UiProgressHandle = {
    stop: () => void;
    setLabel: (nextLabel: string) => void;
};

export function uiStartProgressBar(label: string): UiProgressHandle {
    if (!process.stdout.isTTY) {
        uiLine(`      ${paint('…', 'cyan')} ${paint(label, 'dim')}`);
        return {
            stop: () => {
                // no-op
            },
            setLabel: () => {
                // no-op
            },
        };
    }

    const barWidth = 12;
    let frameIndex = 0;
    let currentLabel = label;
    const startTime = Date.now();
    let lastRenderLength = 0;

    const render = () => {
        const headPosition = frameIndex % barWidth;
        const cells = Array.from({ length: barWidth }, (_, idx) => (idx === headPosition ? '>' : '='));
        const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
        const bar = `[${cells.join('')}]`;
        const text = `      ${paint(bar, 'cyan')} ${currentLabel} ${paint(`${elapsedSeconds}s`, 'dim')}`;
        const padded = text.padEnd(lastRenderLength, ' ');
        process.stdout.write(`\r${padded}`);
        lastRenderLength = Math.max(lastRenderLength, text.length);
        frameIndex += 1;
    };

    render();
    const interval = setInterval(render, 120);
    interval.unref();

    return {
        setLabel: (nextLabel: string) => {
            currentLabel = nextLabel;
        },
        stop: () => {
            clearInterval(interval);
            if (lastRenderLength > 0) {
                process.stdout.write(`\r${' '.repeat(lastRenderLength)}\r`);
            }
        },
    };
}

export function uiBanner(platform: string, modelId: string, dataDir: string): void {
    const logo = [
        '╓──────────────────────────────╖',
        '║░░████▒░░░███▒░░█▒░░█▒░░███▒░░║',
        '║░░█▒░░█▒░█▒░░█▒░█▒░░█▒░█▒░░░░░║',
        '║░░█▒░░█▒░█▒░░█▒░█▒░░█▒░░██▒░░░║',
        '║░░█▒░░█▒░█▒░░█▒░█▒░░█▒░░░░█▒░░║',
        '║░░█▒░░█▒▓▒███▒▓▒░███▒▓▒███▒▓▒░║',
        '╙──────────────────────────────╜',
    ];

    for (const row of logo) {
        uiLine(colorizeLogoLine(row));
    }
    uiLine(`      ${paint('Neural Operations Unification System', 'bold')}`);
    uiLine(`      ${paint('Install Assistant', 'dim')}`);
    uiLine();
    uiLine(` Platform : ${paint(platform, 'bold')}`);
    uiLine(` Model    : ${paint(modelId, 'bold')}`);
    uiLine(` Data dir : ${paint(dataDir, 'bold')}`);
    uiLine();
}

export function uiStep(index: number, total: number, title: string, detail?: string): void {
    const prefix = paint(`[${index}/${total}]`, 'cyan');
    uiLine(`${prefix} ${paint(title, 'bold')}`);
    if (detail) {
        uiLine(`      ${paint(detail, 'dim')}`);
    }
}

export function uiOk(detail?: string): void {
    uiLine(`      ${paint('OK', 'green')}${detail ? ` ${paint(detail, 'dim')}` : ''}`);
}

export function uiWarn(detail: string): void {
    uiLine(`      ${paint('WARN', 'yellow')} ${detail}`);
}

export function uiFail(detail: string): void {
    uiLine(`      ${paint('FAIL', 'red')} ${detail}`);
}

export function uiNext(url: string): void {
    const line = '------------------------------------------------------------------------';
    uiLine();
    uiLine(paint(line, 'cyan'));
    uiLine(`${paint('Next:', 'bold')} Open ${paint(url, 'cyan')} in your browser.`);
    uiLine(paint(line, 'cyan'));
}
