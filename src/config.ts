import type { SomeCompanionConfigField } from '@companion-module/base'

// Users, satellites and timeouts arrive in Phase 1 (see ROADMAP.md).
export type ModuleConfig = Record<string, never>

export function GetConfigFields(): SomeCompanionConfigField[] {
	return []
}
