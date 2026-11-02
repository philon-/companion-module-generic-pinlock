import type {
	CompanionButtonStyleProps,
	CompanionPresetDefinitions,
	CompanionPresetSection,
} from '@companion-module/base'
import type { ModuleSchema } from './main.js'
import type ModuleInstance from './main.js'

const KEY_STYLE: CompanionButtonStyleProps = {
	text: '',
	size: '24',
	color: 0xffffff,
	bgcolor: 0x262626,
	show_topbar: false,
}

/** Lock pages read their satellite's ID from this page variable. */
const PAGE_SURFACE = '$(page:surface_id)'

export function UpdatePresets(self: ModuleInstance): void {
	const presets: CompanionPresetDefinitions<ModuleSchema> = {}

	const digits = Array.from({ length: 10 }, (_, digit) => `${digit}`)
	for (const digit of digits) {
		presets[`digit_${digit}`] = {
			type: 'simple',
			name: `Digit ${digit}`,
			style: { ...KEY_STYLE, text: digit },
			steps: [{ down: [{ actionId: 'digit', options: { digit } }], up: [] }],
			feedbacks: [],
		}
	}

	presets['backspace'] = {
		type: 'simple',
		name: 'Delete last digit',
		style: { ...KEY_STYLE, text: '⌫' },
		steps: [{ down: [{ actionId: 'backspace', options: {} }], up: [] }],
		feedbacks: [],
	}

	presets['clear'] = {
		type: 'simple',
		name: 'Clear entry',
		style: { ...KEY_STYLE, text: 'CLR', size: '18' },
		steps: [{ down: [{ actionId: 'clear', options: {} }], up: [] }],
		feedbacks: [],
	}

	presets['submit'] = {
		type: 'simple',
		name: 'Submit PIN',
		style: { ...KEY_STYLE, text: 'OK', bgcolor: 0x00662e },
		steps: [{ down: [{ actionId: 'submit', options: {} }], up: [] }],
		feedbacks: [],
	}

	presets['display'] = {
		type: 'simple',
		name: 'PIN display',
		style: { ...KEY_STYLE, text: 'Enter PIN', size: 'auto', bgcolor: 0x000000 },
		steps: [],
		feedbacks: [
			{ feedbackId: 'entry_display', options: { surface: PAGE_SURFACE } },
			{
				feedbackId: 'state',
				options: { surface: PAGE_SURFACE, state: 'wrong_pin' },
				style: { bgcolor: 0xcc0000, color: 0xffffff },
			},
		],
	}

	presets['logout'] = {
		type: 'simple',
		name: 'Log out',
		style: { ...KEY_STYLE, text: 'Log out', size: '18', bgcolor: 0x662200 },
		steps: [{ down: [{ actionId: 'logout', options: {} }], up: [] }],
		feedbacks: [],
	}

	const structure: CompanionPresetSection[] = [
		{
			id: 'lock_page',
			name: 'Lock page',
			description: `For each satellite's lock page. The display reads the page variable surface_id (${PAGE_SURFACE}).`,
			definitions: [
				{
					id: 'keypad',
					name: 'Keypad',
					type: 'simple',
					presets: [...digits.map((d) => `digit_${d}`), 'backspace', 'clear', 'submit'],
				},
				{ id: 'display', name: 'Display', type: 'simple', presets: ['display'] },
			],
		},
		{
			id: 'protected_pages',
			name: 'Protected pages',
			description: 'Also add the Touch action to every button on protected pages.',
			definitions: [{ id: 'session', name: 'Session', type: 'simple', presets: ['logout'] }],
		},
	]

	self.setPresetDefinitions(structure, presets)
}
