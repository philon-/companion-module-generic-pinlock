import type ModuleInstance from './main.js'

export type FeedbacksSchema = {
	spike_surface_text: {
		type: 'advanced'
		options: {
			surface: string
		}
	}
}

export function UpdateFeedbacks(self: ModuleInstance): void {
	self.setFeedbackDefinitions({
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
