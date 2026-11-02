import type ModuleInstance from './main.js'

export function UpdatePresets(self: ModuleInstance): void {
	// Keypad, display, logout and countdown presets arrive in Phase 2 (see ROADMAP.md).
	self.setPresetDefinitions([], {})
}
