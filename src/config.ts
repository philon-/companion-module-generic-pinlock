import type { SomeCompanionConfigField } from '@companion-module/base'

export type ModuleConfig = {
	users: string
	satellites: string
	idleTimeout: number
	pinLength: number
}

export type User = { name: string; pin: string; landingPage: number }
export type Satellite = {
	surfaceId: string
	lockPage: number
	label: string
	/** Surface ID made safe for variable names, used in `sat_<variableId>_*` */
	variableId: string
}

export type ParsedConfig = {
	/** Keyed by PIN — a PIN identifies its user, so PINs are unique */
	users: Map<string, User>
	/** Keyed by surface ID */
	satellites: Map<string, Satellite>
	errors: string[]
}

const PIN_PATTERN = /^\d{1,12}$/

export function GetConfigFields(): SomeCompanionConfigField[] {
	return [
		{
			type: 'static-text',
			id: 'info',
			label: 'Setup',
			width: 12,
			value:
				'Each satellite needs its own lock page and the navigation trigger (variable <code>$(pinlock:nav_seq)</code> changed → <i>Surface: Set to page</i> with surface <code>$(pinlock:nav_surface)</code> and page <code>$(pinlock:nav_page)</code>). See the help for the full setup.',
		},
		{
			type: 'textinput',
			id: 'users',
			label: 'Users (one "name, pin, landing page" per line)',
			description: 'PINs are digits only and must be unique. Lines starting with # are ignored.',
			width: 12,
			multiline: true,
			default: '',
		},
		{
			type: 'textinput',
			id: 'satellites',
			label: 'Satellites (one "surface ID, lock page[, label]" per line)',
			description:
				'Only these surfaces are locked. Press any pinlock button on a satellite and read $(pinlock:last_surface_id) to find its ID.',
			width: 12,
			multiline: true,
			default: '',
		},
		{
			type: 'number',
			id: 'idleTimeout',
			label: 'Idle timeout (seconds)',
			description: 'Lock a satellite after this long without a pinlock Touch.',
			width: 6,
			min: 5,
			max: 86400,
			default: 120,
		},
		{
			type: 'number',
			id: 'pinLength',
			label: 'Auto-submit PIN length (0 = press Submit)',
			description: 'When set, every PIN must have exactly this many digits.',
			width: 6,
			min: 0,
			max: 12,
			default: 0,
		},
	]
}

function* configLines(text: string | undefined): Generator<{ lineNo: number; parts: string[] }> {
	const lines = (text ?? '').split('\n')
	for (const [index, raw] of lines.entries()) {
		const line = raw.trim()
		if (!line || line.startsWith('#')) continue
		yield { lineNo: index + 1, parts: line.split(',').map((part) => part.trim()) }
	}
}

function parsePage(value: string | undefined): number | undefined {
	if (!value || !/^\d+$/.test(value)) return undefined
	const page = Number(value)
	return page >= 1 ? page : undefined
}

/**
 * Parse the users and satellites lists. Invalid lines are skipped and reported in `errors`, so a
 * typo never creates a user or satellite that behaves differently from what was written.
 */
export function ParseConfig(config: ModuleConfig): ParsedConfig {
	const errors: string[] = []
	const users = new Map<string, User>()
	const satellites = new Map<string, Satellite>()

	for (const { lineNo, parts } of configLines(config.users)) {
		const [name, pin, page] = parts
		const landingPage = parsePage(page)
		if (parts.length !== 3 || !name || !pin || landingPage === undefined) {
			errors.push(`Users line ${lineNo}: expected "name, pin, landing page"`)
		} else if (!PIN_PATTERN.test(pin)) {
			errors.push(`Users line ${lineNo} (${name}): PIN must be 1-12 digits`)
		} else if (config.pinLength > 0 && pin.length !== config.pinLength) {
			errors.push(`Users line ${lineNo} (${name}): PIN must be ${config.pinLength} digits (auto-submit length)`)
		} else if (users.has(pin)) {
			errors.push(`Users line ${lineNo} (${name}): PIN already used by ${users.get(pin)?.name}`)
		} else {
			users.set(pin, { name, pin, landingPage })
		}
	}

	const variableIds = new Map<string, string>()
	for (const { lineNo, parts } of configLines(config.satellites)) {
		const [surfaceId, page, label] = parts
		const lockPage = parsePage(page)
		const variableId = surfaceId ? surfaceId.replace(/[^A-Za-z0-9_-]/g, '_') : ''
		if (parts.length < 2 || parts.length > 3 || !surfaceId || lockPage === undefined) {
			errors.push(`Satellites line ${lineNo}: expected "surface ID, lock page[, label]"`)
		} else if (satellites.has(surfaceId)) {
			errors.push(`Satellites line ${lineNo}: ${surfaceId} is listed twice`)
		} else if (variableIds.has(variableId)) {
			errors.push(
				`Satellites line ${lineNo}: ${surfaceId} and ${variableIds.get(variableId)} would share variable names (sat_${variableId}_*)`,
			)
		} else {
			variableIds.set(variableId, surfaceId)
			satellites.set(surfaceId, { surfaceId, lockPage, label: label || surfaceId, variableId })
		}
	}

	if (users.size === 0) errors.push('No valid users configured')
	if (satellites.size === 0) errors.push('No valid satellites configured')

	return { users, satellites, errors }
}
