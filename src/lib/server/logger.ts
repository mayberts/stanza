const LEVELS = ['error', 'warn', 'info', 'debug'] as const;
export type LogLevel = (typeof LEVELS)[number];

function levelIndex(level: LogLevel): number {
	return LEVELS.indexOf(level);
}

export class Logger {
	constructor(private readonly minLevel: LogLevel) {}

	private log(level: LogLevel, message: string): void {
		if (levelIndex(level) > levelIndex(this.minLevel)) return;
		const timestamp = new Date().toISOString();
		console[level === 'debug' ? 'log' : level](`${timestamp} [${level}] ${message}`);
	}

	error(message: string): void {
		this.log('error', message);
	}

	warn(message: string): void {
		this.log('warn', message);
	}

	info(message: string): void {
		this.log('info', message);
	}

	debug(message: string): void {
		this.log('debug', message);
	}
}

export function isLogLevel(value: string): value is LogLevel {
	return (LEVELS as readonly string[]).includes(value);
}
