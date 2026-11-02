import type { CompanionVariableDefinitions } from '@companion-module/base'
import type ModuleInstance from './main.js'

export type VariablesSchema = {
	nav_surface: string
	nav_page: number
	nav_seq: number
	last_surface_id: string
	/** Per satellite: `sat_<variableId>_user`, `_locked` and `_remaining` */
	[satelliteVariable: `sat_${string}`]: string | number | boolean
}

export function UpdateVariableDefinitions(self: ModuleInstance): void {
	const definitions: CompanionVariableDefinitions<VariablesSchema> = {
		nav_surface: { name: 'Navigation request: surface ID (used by the navigation trigger)' },
		nav_page: { name: 'Navigation request: page number (used by the navigation trigger)' },
		nav_seq: { name: 'Navigation request: sequence number (trigger fires on change)' },
		last_surface_id: { name: 'Surface ID of the last surface that pressed a pinlock button' },
	}
	for (const satellite of self.satellites) {
		definitions[`sat_${satellite.variableId}_user`] = { name: `${satellite.label}: logged-in user (empty when locked)` }
		definitions[`sat_${satellite.variableId}_locked`] = { name: `${satellite.label}: locked (true/false)` }
		definitions[`sat_${satellite.variableId}_remaining`] = {
			name: `${satellite.label}: seconds until idle lock (0 when locked)`,
		}
	}
	self.setVariableDefinitions(definitions)
}
