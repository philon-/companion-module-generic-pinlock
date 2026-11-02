import { InstanceBase, InstanceStatus, type SomeCompanionConfigField } from '@companion-module/base'
import { GetConfigFields, MAX_PIN_LENGTH, ParseConfig, type ModuleConfig, type Satellite, type User } from './config.js'
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

/** How long the "Wrong PIN" state is shown after a failed attempt. */
const WRONG_PIN_FLASH_MS = 2000

type NavRequest = { surfaceId: string; page: number }

function secondsUntil(epochMs: number): number {
	return Math.max(0, Math.ceil((epochMs - Date.now()) / 1000))
}

type SurfaceSession = {
	entry: string
	user: User | undefined
	idleTimer: NodeJS.Timeout | undefined
	/** Epoch ms when the idle timer fires; undefined while locked */
	idleDeadline: number | undefined
	wrongPinTimer: NodeJS.Timeout | undefined
}

/**
 * Failed-attempt tracking, kept apart from the session because sessions are dropped on every lock;
 * otherwise a Log out press on the lock page would reset the lockout.
 */
type SurfaceGuard = {
	failedAttempts: number
	/** Epoch ms when the lockout ends; undefined when not locked out */
	cooldownUntil: number | undefined
	cooldownTimer: NodeJS.Timeout | undefined
}

export type SurfaceView =
	| { status: 'unmanaged' }
	| { status: 'locked'; entryLength: number; pinLength: number }
	| { status: 'wrong_pin' }
	| { status: 'cooldown'; seconds: number }
	| { status: 'unlocked'; user: string }

export default class ModuleInstance extends InstanceBase<ModuleSchema> {
	config!: ModuleConfig // Setup in init()

	#users = new Map<string, User>()
	#satellites = new Map<string, Satellite>()
	#sessions = new Map<string, SurfaceSession>()
	#guards = new Map<string, SurfaceGuard>()
	#ticker: NodeJS.Timeout | undefined

	#navQueue: NavRequest[] = []
	#navTimer: NodeJS.Timeout | undefined
	#navSeq = 0
	#lastNav: NavRequest | undefined
	#lastSurfaceId = ''

	constructor(internal: unknown) {
		super(internal)
	}

	async init(config: ModuleConfig): Promise<void> {
		this.updateActions() // export actions
		this.updateFeedbacks() // export feedbacks
		this.updatePresets() // export Presets

		this.#applyConfig(config, 'module started')
	}
	// When module gets deleted
	async destroy(): Promise<void> {
		this.log('debug', 'destroy')
		this.#clearSessions()
		clearTimeout(this.#navTimer)
		this.#navTimer = undefined
		this.#navQueue = []
	}

	async configUpdated(config: ModuleConfig): Promise<void> {
		this.#applyConfig(config, 'configuration changed')
	}

	get satellites(): Satellite[] {
		return [...this.#satellites.values()]
	}

	/**
	 * Parse the config and lock every satellite. Sessions are never carried over a config change:
	 * the user list they were opened with may no longer exist.
	 */
	#applyConfig(config: ModuleConfig, reason: string): void {
		this.config = config
		const parsed = ParseConfig(config)

		this.#clearSessions()
		this.#users = parsed.users
		this.#satellites = parsed.satellites

		for (const error of parsed.errors) this.log('warn', `Config: ${error}`)
		if (parsed.errors.length > 0) {
			this.updateStatus(InstanceStatus.BadConfig, parsed.errors.join('; '))
		} else {
			this.updateStatus(InstanceStatus.Ok)
		}

		// Redefining variables can drop values, so republish the module-wide ones from our own state
		this.updateVariableDefinitions()
		this.setVariableValues({
			nav_surface: this.#lastNav?.surfaceId ?? '',
			nav_page: this.#lastNav?.page ?? 0,
			nav_seq: this.#navSeq,
			last_surface_id: this.#lastSurfaceId,
		})
		this.log('info', `Loaded ${this.#users.size} user(s) and ${this.#satellites.size} satellite(s)`)
		for (const satellite of this.#satellites.values()) this.#lock(satellite, reason)
	}

	#clearSessions(): void {
		for (const session of this.#sessions.values()) {
			clearTimeout(session.idleTimer)
			clearTimeout(session.wrongPinTimer)
		}
		this.#sessions.clear()
		for (const guard of this.#guards.values()) clearTimeout(guard.cooldownTimer)
		this.#guards.clear()
		clearInterval(this.#ticker)
		this.#ticker = undefined
	}

	/** What a feedback should show for a surface ID. */
	getSurfaceView(surfaceId: string): SurfaceView {
		if (!this.#satellites.has(surfaceId)) return { status: 'unmanaged' }
		const session = this.#sessions.get(surfaceId)
		if (session?.user) return { status: 'unlocked', user: session.user.name }
		const cooldownUntil = this.#guards.get(surfaceId)?.cooldownUntil
		if (cooldownUntil) return { status: 'cooldown', seconds: secondsUntil(cooldownUntil) }
		if (session?.wrongPinTimer) return { status: 'wrong_pin' }
		return { status: 'locked', entryLength: session?.entry.length ?? 0, pinLength: this.config.pinLength }
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
			session = { entry: '', user: undefined, idleTimer: undefined, idleDeadline: undefined, wrongPinTimer: undefined }
			this.#sessions.set(surfaceId, session)
		}
		return { satellite, session }
	}

	/** Entry actions only apply to a locked surface that isn't locked out. */
	#entryContext(surfaceId: string | undefined): { satellite: Satellite; session: SurfaceSession } | undefined {
		const context = this.#pressContext(surfaceId)
		if (!context || context.session.user || this.#guards.get(context.satellite.surfaceId)?.cooldownUntil) {
			return undefined
		}
		return context
	}

	enterDigit(surfaceId: string | undefined, digit: string): void {
		const context = this.#entryContext(surfaceId)
		if (!context) return

		const { satellite, session } = context
		const maxLength = this.config.pinLength > 0 ? this.config.pinLength : MAX_PIN_LENGTH
		if (session.entry.length >= maxLength) return
		this.#endWrongPinFlash(session)
		session.entry += digit

		if (this.config.pinLength > 0 && session.entry.length === this.config.pinLength) {
			this.#submit(satellite, session)
		} else {
			this.#surfaceChanged(satellite)
		}
	}

	deleteDigit(surfaceId: string | undefined): void {
		const context = this.#entryContext(surfaceId)
		if (!context) return
		this.#endWrongPinFlash(context.session)
		context.session.entry = context.session.entry.slice(0, -1)
		this.#surfaceChanged(context.satellite)
	}

	clearEntry(surfaceId: string | undefined): void {
		const context = this.#entryContext(surfaceId)
		if (!context) return
		this.#endWrongPinFlash(context.session)
		context.session.entry = ''
		this.#surfaceChanged(context.satellite)
	}

	submitPin(surfaceId: string | undefined): void {
		const context = this.#entryContext(surfaceId)
		if (!context?.session.entry) return
		this.#submit(context.satellite, context.session)
	}

	#submit(satellite: Satellite, session: SurfaceSession): void {
		const user = this.#users.get(session.entry)
		session.entry = ''

		let guard = this.#guards.get(satellite.surfaceId)
		if (!guard) {
			guard = { failedAttempts: 0, cooldownUntil: undefined, cooldownTimer: undefined }
			this.#guards.set(satellite.surfaceId, guard)
		}

		if (!user) {
			guard.failedAttempts++
			if (this.config.maxAttempts > 0 && guard.failedAttempts >= this.config.maxAttempts) {
				this.#startCooldown(satellite, guard)
			} else {
				this.log('warn', `Wrong PIN on ${satellite.label}`)
				session.wrongPinTimer = setTimeout(() => {
					session.wrongPinTimer = undefined
					this.#surfaceChanged(satellite)
				}, WRONG_PIN_FLASH_MS)
			}
			this.#surfaceChanged(satellite)
			return
		}

		guard.failedAttempts = 0
		session.user = user
		this.log('info', `Unlocked ${satellite.label} for ${user.name}`)
		this.#restartIdleTimer(satellite, session)
		this.#surfaceChanged(satellite)
		this.requestNavigation(satellite.surfaceId, user.landingPage)
	}

	#startCooldown(satellite: Satellite, guard: SurfaceGuard): void {
		this.log(
			'warn',
			`${guard.failedAttempts} wrong PINs on ${satellite.label}: PIN entry blocked for ${this.config.cooldown}s`,
		)
		guard.failedAttempts = 0
		guard.cooldownUntil = Date.now() + this.config.cooldown * 1000
		guard.cooldownTimer = setTimeout(() => {
			guard.cooldownUntil = undefined
			guard.cooldownTimer = undefined
			this.#surfaceChanged(satellite)
		}, this.config.cooldown * 1000)
		this.#ensureTicker()
	}

	#endWrongPinFlash(session: SurfaceSession): void {
		clearTimeout(session.wrongPinTimer)
		session.wrongPinTimer = undefined
	}

	touch(surfaceId: string | undefined): void {
		const context = this.#pressContext(surfaceId)
		if (!context) return
		if (!context.session.user) {
			// A protected button pressed while locked means a lock navigation never landed, e.g. the
			// satellite was offline at the time or reconnected onto its last page. Send it back.
			this.log('warn', `${context.satellite.label} used a protected button while locked; returning it to its lock page`)
			this.requestNavigation(context.satellite.surfaceId, context.satellite.lockPage)
			return
		}
		this.#restartIdleTimer(context.satellite, context.session)
		this.#updateSatelliteVariables(context.satellite)
	}

	logout(surfaceId: string | undefined): void {
		const context = this.#pressContext(surfaceId)
		if (!context) return
		this.#lock(context.satellite, 'logged out')
	}

	/** Lock every satellite. Works from triggers too, since it doesn't depend on the pressing surface. */
	lockAll(): void {
		this.log('info', 'Locking all satellites')
		for (const satellite of this.#satellites.values()) this.#lock(satellite, 'lock all')
	}

	#restartIdleTimer(satellite: Satellite, session: SurfaceSession): void {
		clearTimeout(session.idleTimer)
		session.idleDeadline = Date.now() + this.config.idleTimeout * 1000
		session.idleTimer = setTimeout(() => {
			session.idleTimer = undefined
			this.#lock(satellite, `idle for ${this.config.idleTimeout}s`)
		}, this.config.idleTimeout * 1000)
		this.#ensureTicker()
	}

	/** End any session on the satellite and send it to its lock page. */
	#lock(satellite: Satellite, reason: string): void {
		const session = this.#sessions.get(satellite.surfaceId)
		if (session) {
			clearTimeout(session.idleTimer)
			clearTimeout(session.wrongPinTimer)
			if (session.user) this.log('info', `Locked ${satellite.label} (${session.user.name}): ${reason}`)
			this.#sessions.delete(satellite.surfaceId)
		}
		this.#surfaceChanged(satellite)
		this.requestNavigation(satellite.surfaceId, satellite.lockPage)
	}

	#surfaceChanged(satellite: Satellite): void {
		this.#updateSatelliteVariables(satellite)
		this.checkFeedbacks('entry_display', 'state')
	}

	#updateSatelliteVariables(satellite: Satellite): void {
		const session = this.#sessions.get(satellite.surfaceId)
		const remaining = session?.idleDeadline ? secondsUntil(session.idleDeadline) : 0
		this.setVariableValues({
			[`sat_${satellite.variableId}_user`]: session?.user?.name ?? '',
			[`sat_${satellite.variableId}_locked`]: !session?.user,
			[`sat_${satellite.variableId}_remaining`]: remaining,
		})
	}

	/**
	 * Once a second while any satellite is unlocked or locked out: tick the `_remaining` variables
	 * and redraw lockout countdowns.
	 */
	#ensureTicker(): void {
		if (this.#ticker) return
		this.#ticker = setInterval(() => {
			const unlocked = [...this.#sessions.entries()].filter(([, session]) => session.user)
			const coolingDown = [...this.#guards.values()].some((guard) => guard.cooldownUntil)
			if (unlocked.length === 0 && !coolingDown) {
				clearInterval(this.#ticker)
				this.#ticker = undefined
				return
			}
			for (const [surfaceId] of unlocked) {
				const satellite = this.#satellites.get(surfaceId)
				if (satellite) this.#updateSatelliteVariables(satellite)
			}
			if (coolingDown) this.checkFeedbacks('entry_display', 'state')
		}, 1000)
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
		this.#lastNav = next
		this.log('debug', `Navigation #${this.#navSeq}: ${next.surfaceId} -> page ${next.page}`)
		this.setVariableValues({ nav_surface: next.surfaceId, nav_page: next.page, nav_seq: this.#navSeq })

		this.#navTimer = setTimeout(() => {
			this.#navTimer = undefined
			this.#publishNextNavigation()
		}, NAV_SPACING_MS)
	}

	noteSurface(surfaceId: string): void {
		this.#lastSurfaceId = surfaceId
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
