import type ModuleInstance from './main.js'

export type ActionsSchema = {
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
