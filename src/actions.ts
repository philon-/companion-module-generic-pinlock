import type ModuleInstance from './main.js'

export type ActionsSchema = {
	digit: {
		options: {
			digit: string
		}
	}
	backspace: { options: Record<string, never> }
	clear: { options: Record<string, never> }
	submit: { options: Record<string, never> }
	touch: { options: Record<string, never> }
	logout: { options: Record<string, never> }
	lock_all: { options: Record<string, never> }
	spike_navigate: {
		options: {
			page: number
		}
	}
	spike_navigate_burst: {
		options: {
			targets: string
		}
	}
}

export function UpdateActions(self: ModuleInstance): void {
	self.setActionDefinitions({
		digit: {
			name: 'Enter digit',
			description: 'Adds a digit to the PIN being entered on this surface.',
			options: [
				{
					id: 'digit',
					type: 'dropdown',
					label: 'Digit',
					default: '1',
					choices: Array.from({ length: 10 }, (_, digit) => ({ id: `${digit}`, label: `${digit}` })),
				},
			],
			callback: async (event) => {
				self.enterDigit(event.surfaceId, event.options.digit)
			},
		},
		backspace: {
			name: 'Delete last digit',
			options: [],
			callback: async (event) => {
				self.deleteDigit(event.surfaceId)
			},
		},
		clear: {
			name: 'Clear entry',
			options: [],
			callback: async (event) => {
				self.clearEntry(event.surfaceId)
			},
		},
		submit: {
			name: 'Submit PIN',
			description: 'Checks the entered PIN and, if it matches a user, opens their landing page on this surface.',
			options: [],
			callback: async (event) => {
				self.submitPin(event.surfaceId)
			},
		},
		touch: {
			name: 'Touch (keep session alive)',
			description: 'Add to every button on protected pages. Restarts the idle timer for this surface.',
			options: [],
			callback: async (event) => {
				self.touch(event.surfaceId)
			},
		},
		logout: {
			name: 'Log out',
			description: 'Ends the session on this surface and returns it to its lock page.',
			options: [],
			callback: async (event) => {
				self.logout(event.surfaceId)
			},
		},
		lock_all: {
			name: 'Lock all satellites',
			description: 'Ends every session and returns every satellite to its lock page. Can be run from a trigger.',
			options: [],
			callback: async () => {
				self.lockAll()
			},
		},
		spike_navigate: {
			name: 'Spike: Navigate this surface to page',
			description: 'Phase 0 test. Sends a navigation request for the surface that pressed the button.',
			options: [
				{
					id: 'page',
					type: 'number',
					label: 'Page',
					default: 1,
					min: 1,
					max: 99,
				},
			],
			callback: async (event) => {
				if (!event.surfaceId) {
					self.log('warn', 'Spike navigate: no surface ID (pressed from a trigger?)')
					return
				}
				self.noteSurface(event.surfaceId)
				self.requestNavigation(event.surfaceId, event.options.page)
			},
		},
		spike_navigate_burst: {
			name: 'Spike: Navigate several surfaces at once',
			description:
				'Phase 0 test. Sends back-to-back navigation requests to check that queued requests are not merged by the trigger throttle.',
			options: [
				{
					id: 'targets',
					type: 'textinput',
					label: 'Targets (one "surfaceId=page" per line)',
					default: '',
					multiline: true,
				},
			],
			callback: async (event) => {
				if (event.surfaceId) self.noteSurface(event.surfaceId)
				for (const line of event.options.targets.split('\n')) {
					const [surfaceId, page] = line.split('=').map((part) => part.trim())
					const pageNumber = Number(page)
					if (!surfaceId || !Number.isInteger(pageNumber) || pageNumber < 1) {
						if (line.trim()) self.log('warn', `Spike burst: skipping invalid line "${line}"`)
						continue
					}
					self.requestNavigation(surfaceId, pageNumber)
				}
			},
		},
	})
}
