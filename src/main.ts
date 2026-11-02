import { InstanceBase, InstanceStatus, type SomeCompanionConfigField } from '@companion-module/base'
import { GetConfigFields, ParseConfig, type ModuleConfig, type Satellite, type User } from './config.js'
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

/** Longest entry accepted when auto-submit is off; matches the longest valid PIN. */
const MAX_ENTRY_LENGTH = 12

type NavRequest = { surfaceId: string; page: number }

type SurfaceSession = {
	entry: string
	user: User | undefined
	idleTimer: NodeJS.Timeout | undefined
}

export default class ModuleInstance extends InstanceBase<ModuleSchema> {
	config!: ModuleConfig // Setup in init()

	#users = new Map<string, User>()
	#satellites = new Map<string, Satellite>()
	#sessions = new Map<string, SurfaceSession>()

	#navQueue: NavRequest[] = []
	#navTimer: NodeJS.Timeout | undefined
	#navSeq = 0

	constructor(internal: unknown) {
		super(internal)
	}

	async init(config: ModuleConfig): Promise<void> {
		this.updateActions() // export actions
		this.updateFeedbacks() // export feedbacks
		this.updatePresets() // export Presets
		this.updateVariableDefinitions() // export variable definitions
		this.setVariableValues({ nav_surface: '', nav_page: 0, nav_seq: this.#navSeq, last_surface_id: '' })

		this.#applyConfig(config, 'module started')
	}
	// When module gets deleted
	async destroy(): Promise<void> {
		this.log('debug', 'destroy')
		for (const session of this.#sessions.values()) clearTimeout(session.idleTimer)
		this.#sessions.clear()
		clearTimeout(this.#navTimer)
		this.#navTimer = undefined
		this.#navQueue = []
	}

	async configUpdated(config: ModuleConfig): Promise<void> {
		this.#applyConfig(config, 'configuration changed')
	}

	/**
	 * Parse the config and lock every satellite. Sessions are never carried over a config change:
	 * the user list they were opened with may no longer exist.
	 */
	#applyConfig(config: ModuleConfig, reason: string): void {
		this.config = config
		const parsed = ParseConfig(config)

		for (const session of this.#sessions.values()) clearTimeout(session.idleTimer)
		this.#sessions.clear()
		this.#users = parsed.users
		this.#satellites = parsed.satellites

		for (const error of parsed.errors) this.log('warn', `Config: ${error}`)
		if (parsed.errors.length > 0) {
			this.updateStatus(InstanceStatus.BadConfig, parsed.errors.join('; '))
		} else {
			this.updateStatus(InstanceStatus.Ok)
		}

		this.log('info', `Loaded ${this.#users.size} user(s) and ${this.#satellites.size} satellite(s)`)
		for (const satellite of this.#satellites.values()) this.#lock(satellite, reason)
	}

	/**
	 * Resolve the satellite and session behind an action press. Presses without a surface (e.g.
	 * from a trigger) and from surfaces that aren't listed in the config are ignored.
	 */
	#pressContext(surfaceId: string | undefined): { satellite: Satellite; session: SurfaceSession } | undefined {
		if (!surfaceId) {
			this.log('debug', 'Ignoring pinlock action with no surface (run from a trigger?)')
			return undefined
		}
		this.noteSurface(surfaceId)

		const satellite = this.#satellites.get(surfaceId)
		if (!satellite) {
			this.log('debug', `Ignoring pinlock action from unmanaged surface ${surfaceId}`)
			return undefined
		}

		let session = this.#sessions.get(surfaceId)
		if (!session) {
			session = { entry: '', user: undefined, idleTimer: undefined }
			this.#sessions.set(surfaceId, session)
		}
		return { satellite, session }
	}

	enterDigit(surfaceId: string | undefined, digit: string): void {
		const context = this.#pressContext(surfaceId)
		if (!context || context.session.user) return

		const { session } = context
		const maxLength = this.config.pinLength > 0 ? this.config.pinLength : MAX_ENTRY_LENGTH
		if (session.entry.length >= maxLength) return
		session.entry += digit

		if (this.config.pinLength > 0 && session.entry.length === this.config.pinLength) {
			this.#submit(context.satellite, session)
		}
	}

	deleteDigit(surfaceId: string | undefined): void {
		const context = this.#pressContext(surfaceId)
		if (!context || context.session.user) return
		context.session.entry = context.session.entry.slice(0, -1)
	}

	clearEntry(surfaceId: string | undefined): void {
		const context = this.#pressContext(surfaceId)
		if (!context || context.session.user) return
		context.session.entry = ''
	}

	submitPin(surfaceId: string | undefined): void {
		const context = this.#pressContext(surfaceId)
		if (!context || context.session.user || !context.session.entry) return
		this.#submit(context.satellite, context.session)
	}

	#submit(satellite: Satellite, session: SurfaceSession): void {
		const user = this.#users.get(session.entry)
		session.entry = ''

		if (!user) {
			this.log('warn', `Wrong PIN on ${satellite.label}`)
			return
		}

		session.user = user
		this.log('info', `Unlocked ${satellite.label} for ${user.name}`)
		this.#restartIdleTimer(satellite, session)
		this.requestNavigation(satellite.surfaceId, user.landingPage)
	}

	touch(surfaceId: string | undefined): void {
		const context = this.#pressContext(surfaceId)
		if (!context?.session.user) return
		this.#restartIdleTimer(context.satellite, context.session)
	}

	logout(surfaceId: string | undefined): void {
		const context = this.#pressContext(surfaceId)
		if (!context) return
		this.#lock(context.satellite, 'logged out')
	}

	#restartIdleTimer(satellite: Satellite, session: SurfaceSession): void {
		clearTimeout(session.idleTimer)
		session.idleTimer = setTimeout(() => {
			session.idleTimer = undefined
			this.#lock(satellite, `idle for ${this.config.idleTimeout}s`)
		}, this.config.idleTimeout * 1000)
	}

	/** End any session on the satellite and send it to its lock page. */
	#lock(satellite: Satellite, reason: string): void {
		const session = this.#sessions.get(satellite.surfaceId)
		if (session) {
			clearTimeout(session.idleTimer)
			if (session.user) this.log('info', `Locked ${satellite.label} (${session.user.name}): ${reason}`)
			this.#sessions.delete(satellite.surfaceId)
		}
		this.requestNavigation(satellite.surfaceId, satellite.lockPage)
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
