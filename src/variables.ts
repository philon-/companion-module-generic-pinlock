import type ModuleInstance from './main.js'

export type VariablesSchema = {
	nav_surface: string
	nav_page: number
	nav_seq: number
	last_surface_id: string
}

export function UpdateVariableDefinitions(self: ModuleInstance): void {
	self.setVariableDefinitions({
		nav_surface: { name: 'Navigation request: surface ID (used by the navigation trigger)' },
		nav_page: { name: 'Navigation request: page number (used by the navigation trigger)' },
		nav_seq: { name: 'Navigation request: sequence number (trigger fires on change)' },
		last_surface_id: { name: 'Surface ID of the last surface that pressed a pinlock button' },
	})
}
