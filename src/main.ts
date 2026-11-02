import { InstanceBase, InstanceStatus, type SomeCompanionConfigField } from '@companion-module/base'
import { GetConfigFields, type ModuleConfig } from './config.js'
import { UpdateVariableDefinitions, type VariablesSchema } from './variables.js'
import { UpgradeScripts } from './upgrades.js'
import { UpdateActions, type ActionsSchema } from './actions.js'
import { UpdateFeedbacks, type FeedbacksSchema } from './feedbacks.js'
import { UpdatePresets } from './presets.js'

export type ModuleSchema = {
	config: ModuleConfig
	secrets: undefined
	actions: ActionsSchema
	feedbacks: FeedbacksSchema
	variables: VariablesSchema
}

export { UpgradeScripts }

/**
 * Minimum gap between navigation requests. Companion throttles variable-change triggers to one run
 * per 50ms and merges changes inside that window, so back-to-back requests would be lost.
 */
const NAV_SPACING_MS = 100

type NavRequest = { surfaceId: string; page: number }

export default class ModuleInstance extends InstanceBase<ModuleSchema> {
	config!: ModuleConfig // Setup in init()

	#navQueue: NavRequest[] = []
	#navTimer: NodeJS.Timeout | undefined
	#navSeq = 0

	constructor(internal: unknown) {
		super(internal)
	}

	async init(config: ModuleConfig): Promise<void> {
		this.config = config

		this.updateStatus(InstanceStatus.Ok)

		this.updateActions() // export actions
		this.updateFeedbacks() // export feedbacks
		this.updatePresets() // export Presets
		this.updateVariableDefinitions() // export variable definitions
		this.setVariableValues({ nav_surface: '', nav_page: 0, nav_seq: this.#navSeq, last_surface_id: '' })
	}
	// When module gets deleted
	async destroy(): Promise<void> {
		this.log('debug', 'destroy')
		clearTimeout(this.#navTimer)
		this.#navTimer = undefined
		this.#navQueue = []
	}

	/**
	 * Ask the navigation trigger to move a surface to a page. Requests are published one at a time,
	 * NAV_SPACING_MS apart, so each one gets its own trigger run.
	 */
	requestNavigation(surfaceId: string, page: number): void {
		this.#navQueue.push({ surfaceId, page })
		this.#publishNextNavigation()
	}

	#publishNextNavigation(): void {
		if (this.#navTimer) return
		const next = this.#navQueue.shift()
		if (!next) return

		this.#navSeq++
		this.log('debug', `Navigation #${this.#navSeq}: ${next.surfaceId} -> page ${next.page}`)
		this.setVariableValues({ nav_surface: next.surfaceId, nav_page: next.page, nav_seq: this.#navSeq })

		this.#navTimer = setTimeout(() => {
			this.#navTimer = undefined
			this.#publishNextNavigation()
		}, NAV_SPACING_MS)
	}

	noteSurface(surfaceId: string): void {
		this.setVariableValues({ last_surface_id: surfaceId })
	}

	async configUpdated(config: ModuleConfig): Promise<void> {
		this.config = config
	}

	// Return config fields for web config
	getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields()
	}

	updateActions(): void {
		UpdateActions(this)
	}

	updateFeedbacks(): void {
		UpdateFeedbacks(this)
	}

	updatePresets(): void {
		UpdatePresets(this)
	}

	updateVariableDefinitions(): void {
		UpdateVariableDefinitions(this)
	}
}
