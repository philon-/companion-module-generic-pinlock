import type { CompanionInputFieldTextInput } from '@companion-module/base'
import type ModuleInstance from './main.js'

export type FeedbacksSchema = {
	entry_display: {
		type: 'advanced'
		options: {
			surface: string
		}
	}
	state: {
		type: 'boolean'
		options: {
			surface: string
			state: 'locked' | 'unlocked' | 'wrong_pin' | 'cooldown'
		}
	}
	spike_surface_text: {
		type: 'advanced'
		options: {
			surface: string
		}
	}
}

/**
 * Feedbacks aren't told which surface is showing them, so each one names its surface. On a lock
 * page the default reads the page variable `surface_id`, so copies of the page only differ there.
 */
const SURFACE_OPTION: CompanionInputFieldTextInput<'surface'> = {
	id: 'surface',
	type: 'textinput',
	label: 'Surface ID',
	description: 'Defaults to the page variable surface_id set on each satellite’s lock page.',
	default: '$(page:surface_id)',
	useVariables: true,
}

export function UpdateFeedbacks(self: ModuleInstance): void {
	self.setFeedbackDefinitions({
		entry_display: {
			name: 'PIN entry display',
			description: 'Shows PIN progress, "Wrong PIN" or the logged-in user for a satellite as the button text.',
			type: 'advanced',
			affectedProperties: ['text'],
			options: [SURFACE_OPTION],
			callback: (feedback) => {
				const view = self.getSurfaceView(feedback.options.surface)
				switch (view.status) {
					case 'unmanaged':
						return { text: `Not a pinlock satellite:\n${feedback.options.surface || '(empty)'}` }
					case 'unlocked':
						return { text: view.user }
					case 'wrong_pin':
						return { text: 'Wrong PIN' }
					case 'cooldown':
						return { text: `Too many attempts\nWait ${view.seconds}s` }
					case 'locked': {
						if (view.pinLength > 0) {
							return { text: '●'.repeat(view.entryLength) + '○'.repeat(view.pinLength - view.entryLength) }
						}
						return { text: view.entryLength > 0 ? '●'.repeat(view.entryLength) : 'Enter PIN' }
					}
				}
			},
		},
		state: {
			name: 'Satellite state',
			description:
				'True when the satellite is in the chosen state. "Locked" includes the wrong-PIN flash and the lockout after too many attempts.',
			type: 'boolean',
			defaultStyle: {
				bgcolor: 0xcc0000,
				color: 0xffffff,
			},
			options: [
				SURFACE_OPTION,
				{
					id: 'state',
					type: 'dropdown',
					label: 'State',
					default: 'wrong_pin',
					choices: [
						{ id: 'locked', label: 'Locked' },
						{ id: 'unlocked', label: 'Unlocked' },
						{ id: 'wrong_pin', label: 'Wrong PIN (briefly after a failed attempt)' },
						{ id: 'cooldown', label: 'Locked out (too many wrong PINs)' },
					],
				},
			],
			callback: (feedback) => {
				const { status } = self.getSurfaceView(feedback.options.surface)
				switch (feedback.options.state) {
					case 'locked':
						return status === 'locked' || status === 'wrong_pin' || status === 'cooldown'
					case 'unlocked':
						return status === 'unlocked'
					case 'wrong_pin':
						return status === 'wrong_pin'
					case 'cooldown':
						return status === 'cooldown'
				}
			},
		},
		spike_surface_text: {
			name: 'Spike: Show surface option',
			description: 'Phase 0 test. Shows what the Surface option resolves to, e.g. a page variable.',
			type: 'advanced',
			affectedProperties: ['text', 'size'],
			options: [
				{
					id: 'surface',
					type: 'textinput',
					label: 'Surface',
					default: '$(page:surface_id)',
					useVariables: true,
				},
			],
			callback: (feedback) => ({
				text: `surface:\n${feedback.options.surface || '(empty)'}`,
				size: 'auto',
			}),
		},
	})
}
