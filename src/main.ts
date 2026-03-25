import * as utils from '@iobroker/adapter-core';
import type {
	EMessageRecipient,
	EMessageRecipientStatus,
	EMessageSendResult,
	EMessageServiceName,
} from './lib/emessageClient';
import { EMessageClient } from './lib/emessageClient';

type TriggerCondition = 'true' | 'false' | '=' | '>' | '<';
type ConnectionStatus = 'idle' | 'checking' | 'connected' | 'error';

interface PagerEntry {
	id: string;
	alias: string;
	service: EMessageServiceName;
	identifier: string;
	escalationLevel: number;
	enabled: boolean;
}

interface ResponseCodeEntry {
	id: string;
	label: string;
	code: number;
	endAlarm?: boolean;
	triggerNextPager?: boolean;
	setOutput?: boolean;
	outputStateId?: string;
	outputValue?: string;
	writeAckValue?: boolean;
	ackValue?: number;
}

interface TriggerStateEntry {
	id: string;
	stateId: string;
	enabled: boolean;
	condition: TriggerCondition;
	compareValue: string;
	messageText: string;
}

interface AlarmManagerNative {
	apiUserId: string;
	apiPassword: string;
	pollIntervalSec: number;
	queueDelaySec: number;
	defaultResponseTimeoutSec: number;
	ackResetDelaySec: number;
	outputResetDelaySec: number;
	telegramInstance: string;
	sendTelegramWithPager: boolean;
	testRecipientService: EMessageServiceName;
	testRecipientIdentifier: string;
	testMessage: string;
	pagers: PagerEntry[];
	responseCodes: ResponseCodeEntry[];
	triggerStates: TriggerStateEntry[];
}

interface ActiveAlarmSession {
	triggerId: string;
	triggerStateId: string;
	messageText: string;
	startedAt: string;
	activePager: PagerEntry | null;
	currentPagerIndex: number;
	triggeredPagerIds: string[];
	finished: boolean;
	acknowledged: boolean;
	trackingId?: string;
	processedResponseKeys: string[];
}

interface ProcessResponsePayload {
	code: number;
	pagerId?: string;
	pagerIdentifier?: string;
}

class AlarmManager extends utils.Adapter {
	private currentAlarm: ActiveAlarmSession | null = null;
	private pagerResponseTimeout: NodeJS.Timeout | null = null;
	private statusPollTimer: NodeJS.Timeout | null = null;
	private ackResetTimer: NodeJS.Timeout | null = null;
	private outputResetTimers: Record<string, NodeJS.Timeout> = {};

	public constructor(options: Partial<utils.AdapterOptions> = {}) {
		super({
			...options,
			name: 'alarmmanager',
		});

		this.on('ready', this.onReady.bind(this));
		this.on('message', this.onMessage.bind(this));
		this.on('stateChange', this.onStateChange.bind(this));
		this.on('objectChange', this.onObjectChange.bind(this));
		this.on('unload', this.onUnload.bind(this));
	}

	private get nativeConfig(): AlarmManagerNative {
		return this.config as unknown as AlarmManagerNative;
	}

	private getEMessageClient(): EMessageClient {
		const username = this.nativeConfig.apiUserId?.trim();
		const password = this.nativeConfig.apiPassword?.trim();

		if (!username || !password) {
			throw new Error('API User ID oder API Password fehlt');
		}

		return new EMessageClient({
			username,
			password,
		});
	}

	private serviceSupportsDirectResponse(service: EMessageServiceName): boolean {
		return service === '2wayS' || service === 'eBos';
	}

	private async setServiceConnection(isConnected: boolean): Promise<void> {
		await this.setStateAsync('info.connection', isConnected, true);
	}

	private async setConnectionStatus(status: ConnectionStatus, errorText = ''): Promise<void> {
		await this.setStateAsync('info.connectionStatus', status, true);
		await this.setStateAsync('info.connectionError', errorText, true);
	}

	private sanitizePagerFolderName(pagerId: string, fallbackIndex: number): string {
		const safe = String(pagerId || '')
			.trim()
			.replace(/[^a-zA-Z0-9_]/g, '_')
			.replace(/_+/g, '_')
			.replace(/^_+|_+$/g, '');

		return safe ? `pager_${safe}` : `pager_${fallbackIndex + 1}`;
	}

	private async ensureStaticObjects(): Promise<void> {
		await this.setObjectNotExistsAsync('pagers', {
			type: 'channel',
			common: { name: 'Pager' },
			native: {},
		});

		await this.setObjectNotExistsAsync('alarm', {
			type: 'channel',
			common: { name: 'Alarmstatus' },
			native: {},
		});

		await this.setObjectNotExistsAsync('info.connectionStatus', {
			type: 'state',
			common: {
				name: 'Verbindungsstatus',
				type: 'string',
				role: 'text',
				read: true,
				write: false,
				def: 'idle',
				states: {
					idle: 'Idle',
					checking: 'Prüfung läuft',
					connected: 'Verbunden',
					error: 'Fehler',
				},
			},
			native: {},
		});

		await this.setObjectNotExistsAsync('info.connectionError', {
			type: 'state',
			common: {
				name: 'Verbindungsfehler',
				type: 'string',
				role: 'text',
				read: true,
				write: false,
				def: '',
			},
			native: {},
		});

		await this.setObjectNotExistsAsync('alarm.active', {
			type: 'state',
			common: {
				name: 'Alarm aktiv',
				type: 'boolean',
				role: 'indicator',
				read: true,
				write: false,
				def: false,
			},
			native: {},
		});

		await this.setObjectNotExistsAsync('alarm.lastTriggerStateId', {
			type: 'state',
			common: {
				name: 'Letzte Auslösung durch State',
				type: 'string',
				role: 'text',
				read: true,
				write: false,
				def: '',
			},
			native: {},
		});

		await this.setObjectNotExistsAsync('alarm.lastTriggerMessage', {
			type: 'state',
			common: {
				name: 'Letzter Meldungstext',
				type: 'string',
				role: 'text',
				read: true,
				write: false,
				def: '',
			},
			native: {},
		});

		await this.setObjectNotExistsAsync('alarm.lastTriggeredPager', {
			type: 'state',
			common: {
				name: 'Zuletzt ausgelöster Pager',
				type: 'string',
				role: 'text',
				read: true,
				write: false,
				def: '',
			},
			native: {},
		});

		await this.setObjectNotExistsAsync('alarm.currentPagerId', {
			type: 'state',
			common: {
				name: 'Aktuelle Pager-ID',
				type: 'string',
				role: 'text',
				read: true,
				write: false,
				def: '',
			},
			native: {},
		});

		await this.setObjectNotExistsAsync('alarm.currentPagerAlias', {
			type: 'state',
			common: {
				name: 'Aktueller Pager Alias',
				type: 'string',
				role: 'text',
				read: true,
				write: false,
				def: '',
			},
			native: {},
		});

		await this.setObjectNotExistsAsync('alarm.currentEscalationLevel', {
			type: 'state',
			common: {
				name: 'Aktuelle Eskalationsstufe',
				type: 'number',
				role: 'value',
				read: true,
				write: false,
				def: 0,
			},
			native: {},
		});

		await this.setObjectNotExistsAsync('alarm.currentTrackingId', {
			type: 'state',
			common: {
				name: 'Aktuelle Tracking-ID',
				type: 'string',
				role: 'text',
				read: true,
				write: false,
				def: '',
			},
			native: {},
		});

		await this.setObjectNotExistsAsync('alarm.lastTrackingId', {
			type: 'state',
			common: {
				name: 'Letzte Tracking-ID',
				type: 'string',
				role: 'text',
				read: true,
				write: false,
				def: '',
			},
			native: {},
		});

		await this.setObjectNotExistsAsync('alarm.lastResponseCode', {
			type: 'state',
			common: {
				name: 'Letzter Antwortcode',
				type: 'number',
				role: 'value',
				read: true,
				write: false,
				def: 0,
			},
			native: {},
		});

		await this.setObjectNotExistsAsync('alarm.lastResponseText', {
			type: 'state',
			common: {
				name: 'Letzter Antworttext',
				type: 'string',
				role: 'text',
				read: true,
				write: false,
				def: '',
			},
			native: {},
		});

		await this.setObjectNotExistsAsync('alarm.injectResponseCode', {
			type: 'state',
			common: {
				name: 'Test: Antwortcode einspeisen',
				type: 'number',
				role: 'value',
				read: true,
				write: true,
				def: 0,
			},
			native: {},
		});

		await this.setObjectNotExistsAsync('alarm.externalResponseCode', {
			type: 'state',
			common: {
				name: 'Externer Antwortcode (z.B. Telegram)',
				type: 'number',
				role: 'value',
				read: true,
				write: true,
				def: 0,
			},
			native: {},
		});

		await this.setObjectNotExistsAsync('alarm.ackOutputValue', {
			type: 'state',
			common: {
				name: 'Ack-Ausgabewert',
				type: 'number',
				role: 'value',
				read: true,
				write: false,
				def: 0,
			},
			native: {},
		});

		await this.setObjectNotExistsAsync('alarm.ackOutputLastUpdate', {
			type: 'state',
			common: {
				name: 'Ack-Ausgabewert zuletzt gesetzt',
				type: 'string',
				role: 'text',
				read: true,
				write: false,
				def: '',
			},
			native: {},
		});

		await this.setObjectNotExistsAsync('alarm.triggeredCount', {
			type: 'state',
			common: {
				name: 'Ausgelöste Pager',
				type: 'number',
				role: 'value',
				read: true,
				write: false,
				def: 0,
			},
			native: {},
		});

		await this.setObjectNotExistsAsync('alarm.totalActivePagerCount', {
			type: 'state',
			common: {
				name: 'Anzahl aktiver Pager',
				type: 'number',
				role: 'value',
				read: true,
				write: false,
				def: 0,
			},
			native: {},
		});

		await this.setObjectNotExistsAsync('alarm.summary', {
			type: 'state',
			common: {
				name: 'Zusammenfassung',
				type: 'string',
				role: 'text',
				read: true,
				write: false,
				def: 'Bereit',
			},
			native: {},
		});

		await this.setObjectNotExistsAsync('alarm.finished', {
			type: 'state',
			common: {
				name: 'Sendevorgang abgeschlossen',
				type: 'boolean',
				role: 'indicator',
				read: true,
				write: false,
				def: false,
			},
			native: {},
		});

		await this.setObjectNotExistsAsync('alarm.acknowledged', {
			type: 'state',
			common: {
				name: 'Alarm quittiert',
				type: 'boolean',
				role: 'indicator',
				read: true,
				write: false,
				def: false,
			},
			native: {},
		});
	}

	private async ensurePagerObjects(): Promise<void> {
		const pagers = Array.isArray(this.nativeConfig.pagers) ? this.nativeConfig.pagers : [];

		for (let i = 0; i < pagers.length; i++) {
			const pager = pagers[i];
			const folder = this.sanitizePagerFolderName(pager.id, i);
			const channelId = `pagers.${folder}`;

			await this.setObjectNotExistsAsync(channelId, {
				type: 'channel',
				common: {
					name: pager.alias?.trim() || pager.identifier?.trim() || `Pager ${i + 1}`,
				},
				native: {
					pagerId: pager.id,
				},
			});

			await this.setObjectNotExistsAsync(`${channelId}.alias`, {
				type: 'state',
				common: {
					name: 'Alias / Name',
					type: 'string',
					role: 'text',
					read: true,
					write: false,
					def: '',
				},
				native: {},
			});

			await this.setObjectNotExistsAsync(`${channelId}.service`, {
				type: 'state',
				common: {
					name: 'Service',
					type: 'string',
					role: 'text',
					read: true,
					write: false,
					def: '',
				},
				native: {},
			});

			await this.setObjectNotExistsAsync(`${channelId}.identifier`, {
				type: 'state',
				common: {
					name: 'Pager-ID / Identifier',
					type: 'string',
					role: 'text',
					read: true,
					write: false,
					def: '',
				},
				native: {},
			});

			await this.setObjectNotExistsAsync(`${channelId}.escalationLevel`, {
				type: 'state',
				common: {
					name: 'Eskalationsstufe',
					type: 'number',
					role: 'value',
					read: true,
					write: false,
					def: 1,
				},
				native: {},
			});

			await this.setObjectNotExistsAsync(`${channelId}.enabled`, {
				type: 'state',
				common: {
					name: 'Aktiv',
					type: 'boolean',
					role: 'indicator',
					read: true,
					write: false,
					def: false,
				},
				native: {},
			});

			await this.setObjectNotExistsAsync(`${channelId}.lastTriggered`, {
				type: 'state',
				common: {
					name: 'Zuletzt ausgelöst',
					type: 'string',
					role: 'text',
					read: true,
					write: false,
					def: '',
				},
				native: {},
			});

			await this.setObjectNotExistsAsync(`${channelId}.lastResponseCode`, {
				type: 'state',
				common: {
					name: 'Letzter Antwortcode',
					type: 'number',
					role: 'value',
					read: true,
					write: false,
					def: 0,
				},
				native: {},
			});

			await this.setObjectNotExistsAsync(`${channelId}.lastResponseText`, {
				type: 'state',
				common: {
					name: 'Letzter Antworttext',
					type: 'string',
					role: 'text',
					read: true,
					write: false,
					def: '',
				},
				native: {},
			});

			await this.extendObjectAsync(channelId, {
				common: {
					name: pager.alias?.trim() || pager.identifier?.trim() || `Pager ${i + 1}`,
				},
				native: {
					pagerId: pager.id,
				},
			});

			await this.setStateAsync(`${channelId}.alias`, pager.alias || '', true);
			await this.setStateAsync(`${channelId}.service`, pager.service || '', true);
			await this.setStateAsync(`${channelId}.identifier`, pager.identifier || '', true);
			await this.setStateAsync(`${channelId}.escalationLevel`, Number(pager.escalationLevel || 1), true);
			await this.setStateAsync(`${channelId}.enabled`, Boolean(pager.enabled), true);
		}
	}

	private async updateAlarmOverviewStates(): Promise<void> {
		const pagers = this.getSortedActivePagers();

		await this.setStateAsync('alarm.totalActivePagerCount', pagers.length, true);

		const currentSummary =
			pagers.length > 0 ? `${pagers.length} aktive Pager konfiguriert` : 'Keine aktiven Pager konfiguriert';

		await this.setStateAsync('alarm.summary', currentSummary, true);
	}

	private getSortedActivePagers(): PagerEntry[] {
		const pagers = Array.isArray(this.nativeConfig.pagers) ? this.nativeConfig.pagers : [];
		return [...pagers].filter(p => p.enabled).sort((a, b) => a.escalationLevel - b.escalationLevel);
	}

	private getPagerStateFolder(pager: PagerEntry): string {
		const pagers = Array.isArray(this.nativeConfig.pagers) ? this.nativeConfig.pagers : [];
		const index = pagers.findIndex(item => item.id === pager.id);
		return this.sanitizePagerFolderName(pager.id, index >= 0 ? index : 0);
	}

	private formatPagerLabel(pager: PagerEntry): string {
		if (pager.alias?.trim()) {
			return `${pager.alias} (${pager.identifier})`;
		}
		return pager.identifier;
	}

	private findPagerByPayload(payload: ProcessResponsePayload): PagerEntry | null {
		const pagers = Array.isArray(this.nativeConfig.pagers) ? this.nativeConfig.pagers : [];

		if (payload.pagerId) {
			const byId = pagers.find(p => p.id === payload.pagerId);
			if (byId) {
				return byId;
			}
		}

		if (payload.pagerIdentifier) {
			const byIdentifier = pagers.find(p => p.identifier === payload.pagerIdentifier);
			if (byIdentifier) {
				return byIdentifier;
			}
		}

		return this.currentAlarm?.activePager || null;
	}

	private findResponseCodeEntryByCode(code: number): ResponseCodeEntry | null {
		const list = Array.isArray(this.nativeConfig.responseCodes) ? this.nativeConfig.responseCodes : [];
		return list.find(item => Number(item.code) === Number(code)) || null;
	}

	private findResponseCodeEntryByAnswer(answer: string): ResponseCodeEntry | null {
		const normalized = String(answer || '').trim();
		if (!normalized) {
			return null;
		}

		const list = Array.isArray(this.nativeConfig.responseCodes) ? this.nativeConfig.responseCodes : [];
		return (
			list.find(item => String(item.code) === normalized) ||
			list.find(item => item.label?.trim().toLowerCase() === normalized.toLowerCase()) ||
			null
		);
	}

	private clearPagerTimeout(): void {
		if (this.pagerResponseTimeout) {
			clearTimeout(this.pagerResponseTimeout);
			this.pagerResponseTimeout = null;
		}
	}

	private clearStatusPollTimer(): void {
		if (this.statusPollTimer) {
			clearInterval(this.statusPollTimer);
			this.statusPollTimer = null;
		}
	}

	private clearAckResetTimer(): void {
		if (this.ackResetTimer) {
			clearTimeout(this.ackResetTimer);
			this.ackResetTimer = null;
		}
	}

	private clearAllOutputResetTimers(): void {
		Object.keys(this.outputResetTimers).forEach(key => {
			clearTimeout(this.outputResetTimers[key]);
			delete this.outputResetTimers[key];
		});
	}

	private clearOutputResetTimer(stateId: string): void {
		if (this.outputResetTimers[stateId]) {
			clearTimeout(this.outputResetTimers[stateId]);
			delete this.outputResetTimers[stateId];
		}
	}

	private async writeAckOutputValue(value: number): Promise<void> {
		await this.setStateAsync('alarm.ackOutputValue', value, true);
		await this.setStateAsync('alarm.ackOutputLastUpdate', new Date().toISOString(), true);

		this.clearAckResetTimer();

		const delaySec = Math.max(0, Number(this.nativeConfig.ackResetDelaySec || 60));
		if (delaySec <= 0) {
			return;
		}

		this.log.info(`Ack-Ausgabewert ${value} gesetzt, Rücksetzung auf 0 in ${delaySec} Sekunden`);

		this.ackResetTimer = setTimeout(() => {
			void this.resetAckOutputValue();
		}, delaySec * 1000);
	}

	private async resetAckOutputValue(): Promise<void> {
		this.clearAckResetTimer();
		await this.setStateAsync('alarm.ackOutputValue', 0, true);
		await this.setStateAsync('alarm.ackOutputLastUpdate', new Date().toISOString(), true);
		this.log.info('Ack-Ausgabewert wurde auf 0 zurückgesetzt');
	}

	private parseOutputValue(rawValue: string | undefined): boolean | number | string {
		const value = String(rawValue ?? '').trim();

		if (value.toLowerCase() === 'true') {
			return true;
		}
		if (value.toLowerCase() === 'false') {
			return false;
		}
		if (value !== '' && !Number.isNaN(Number(value))) {
			return Number(value);
		}

		return value;
	}

	private getResetValueForOutput(value: boolean | number | string): boolean | number | string {
		if (typeof value === 'boolean') {
			return false;
		}
		if (typeof value === 'number') {
			return 0;
		}
		return '';
	}

	private async triggerConfiguredOutput(responseEntry: ResponseCodeEntry): Promise<void> {
		if (!responseEntry.setOutput) {
			return;
		}

		const stateId = String(responseEntry.outputStateId ?? '').trim();
		if (!stateId) {
			this.log.warn(`Antwortcode "${responseEntry.label}" hat keine Ziel-State-ID für Folgeaktion`);
			return;
		}

		const parsedValue = this.parseOutputValue(responseEntry.outputValue);
		await this.setForeignStateAsync(stateId, parsedValue as ioBroker.StateValue);

		this.log.info(
			`Folgeaktion ausgelöst: ${stateId} = ${JSON.stringify(parsedValue)} durch Antwortcode "${responseEntry.label}"`,
		);

		const resetDelaySec = Math.max(0, Number(this.nativeConfig.outputResetDelaySec || 0));
		if (resetDelaySec <= 0) {
			return;
		}

		const resetValue = this.getResetValueForOutput(parsedValue);
		this.clearOutputResetTimer(stateId);

		this.outputResetTimers[stateId] = setTimeout(() => {
			void this.resetConfiguredOutput(stateId, resetValue);
		}, resetDelaySec * 1000);

		this.log.info(
			`Folgeaktion ${stateId} wird in ${resetDelaySec} Sekunden auf ${JSON.stringify(resetValue)} zurückgesetzt`,
		);
	}

	private async resetConfiguredOutput(stateId: string, resetValue: boolean | number | string): Promise<void> {
		this.clearOutputResetTimer(stateId);
		await this.setForeignStateAsync(stateId, resetValue as ioBroker.StateValue);
		this.log.info(`Folgeaktion zurückgesetzt: ${stateId} = ${JSON.stringify(resetValue)}`);
	}

	private startPagerTimeout(): void {
		this.clearPagerTimeout();

		if (!this.currentAlarm || !this.currentAlarm.activePager) {
			return;
		}

		const timeoutSec = Number(this.nativeConfig.defaultResponseTimeoutSec || 120);
		const timeoutMs = Math.max(1, timeoutSec) * 1000;
		const pagerLabel = this.formatPagerLabel(this.currentAlarm.activePager);
		const expectedPagerId = this.currentAlarm.activePager.id;

		this.log.info(`Starte Antwort-Timeout für ${pagerLabel}: ${timeoutSec} Sekunden`);

		this.pagerResponseTimeout = setTimeout(() => {
			void this.handlePagerTimeout(expectedPagerId);
		}, timeoutMs);
	}

	private startStatusPolling(): void {
		this.clearStatusPollTimer();

		const pollSec = Math.max(3, Number(this.nativeConfig.pollIntervalSec || 30));

		this.statusPollTimer = setInterval(() => {
			void this.pollCurrentAlarmStatus();
		}, pollSec * 1000);

		this.log.info(`Status-Polling gestartet: alle ${pollSec} Sekunden`);
	}

	private async pollCurrentAlarmStatus(): Promise<void> {
		if (!this.currentAlarm?.trackingId) {
			return;
		}

		if (
			!this.currentAlarm.activePager ||
			!this.serviceSupportsDirectResponse(this.currentAlarm.activePager.service)
		) {
			return;
		}

		try {
			const client = this.getEMessageClient();
			const result = await client.getMessageStatus(this.currentAlarm.trackingId);

			for (const recipient of result.recipients) {
				await this.processRecipientStatus(recipient);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.log.warn(`Status-Polling fehlgeschlagen: ${message}`);
		}
	}

	private async processRecipientStatus(recipient: EMessageRecipientStatus): Promise<void> {
		if (!this.currentAlarm) {
			return;
		}

		const identifier = recipient.identifier || '';
		const statusList = Array.isArray(recipient.status) ? recipient.status : [];

		for (const entry of statusList) {
			const answerText = String(entry.answer || '').trim();
			const answerNoRaw = entry.answerNo;
			const answerNo = Number(answerNoRaw);

			let responseEntry: ResponseCodeEntry | null = null;
			let responseKey = '';

			if (answerText) {
				responseEntry = this.findResponseCodeEntryByAnswer(answerText);
				responseKey = `${identifier}:answer:${answerText}`;
			}

			if (!responseEntry && answerNoRaw !== undefined && answerNoRaw !== null && !Number.isNaN(answerNo)) {
				responseEntry = this.findResponseCodeEntryByCode(answerNo);
				responseKey = `${identifier}:answerNo:${answerNo}`;
			}

			if (!responseEntry || !responseKey) {
				continue;
			}

			if (this.currentAlarm.processedResponseKeys.includes(responseKey)) {
				continue;
			}

			this.currentAlarm.processedResponseKeys.push(responseKey);

			this.log.info(
				`Rückmeldung aus Statusabfrage gefunden: Identifier=${identifier}, answer=${answerText}, answerNo=${String(answerNoRaw ?? '')}`,
			);

			await this.handleResponseCode({
				code: responseEntry.code,
				pagerIdentifier: identifier || undefined,
			});

			if (!this.currentAlarm) {
				return;
			}
		}
	}

	private async handlePagerTimeout(expectedPagerId: string): Promise<void> {
		if (!this.currentAlarm || !this.currentAlarm.activePager) {
			return;
		}

		if (this.currentAlarm.activePager.id !== expectedPagerId) {
			return;
		}

		const timedOutPager = this.currentAlarm.activePager;
		const pagerLabel = this.formatPagerLabel(timedOutPager);

		this.log.warn(`Keine Antwort von ${pagerLabel} innerhalb des Timeouts`);

		await this.setStateAsync('alarm.summary', `Keine Antwort von ${pagerLabel}, nächster Pager wird geprüft`, true);

		try {
			await this.triggerNextPager(`Timeout bei ${pagerLabel}`);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.log.error(`Fehler bei Timeout-Eskalation: ${message}`);
			await this.finishAlarm(`Alarm beendet nach Timeout-Fehler: ${message}`, false);
		}
	}

	private async resetAlarmStates(): Promise<void> {
		this.clearPagerTimeout();
		this.clearStatusPollTimer();

		await this.setStateAsync('alarm.active', false, true);
		await this.setStateAsync('alarm.lastTriggerStateId', '', true);
		await this.setStateAsync('alarm.lastTriggerMessage', '', true);
		await this.setStateAsync('alarm.lastTriggeredPager', '', true);
		await this.setStateAsync('alarm.currentPagerId', '', true);
		await this.setStateAsync('alarm.currentPagerAlias', '', true);
		await this.setStateAsync('alarm.currentEscalationLevel', 0, true);
		await this.setStateAsync('alarm.lastResponseCode', 0, true);
		await this.setStateAsync('alarm.lastResponseText', '', true);
		await this.setStateAsync('alarm.injectResponseCode', 0, true);
		await this.setStateAsync('alarm.externalResponseCode', 0, true);
		await this.setStateAsync('alarm.currentTrackingId', '', true);
		await this.setStateAsync('alarm.triggeredCount', 0, true);
		await this.setStateAsync('alarm.finished', false, true);
		await this.setStateAsync('alarm.acknowledged', false, true);
		await this.setStateAsync('alarm.summary', 'Bereit', true);

		this.currentAlarm = null;
	}

	private async testCredentials(): Promise<void> {
		this.log.info('Prüfe e*Message Zugangsdaten ...');

		await this.setConnectionStatus('checking', '');
		await this.setServiceConnection(false);

		try {
			const client = this.getEMessageClient();
			await client.login();

			this.log.info('e*Message Zugangsdaten sind gültig');
			await this.setServiceConnection(true);
			await this.setConnectionStatus('connected', '');
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			await this.setServiceConnection(false);
			await this.setConnectionStatus('error', message);
			throw error;
		}
	}

	private async sendPagerMessage(messageText: string, recipients: EMessageRecipient[]): Promise<EMessageSendResult> {
		if (!messageText.trim()) {
			throw new Error('Nachricht ist leer');
		}

		if (!recipients.length) {
			throw new Error('Es wurden keine Empfänger übergeben');
		}

		this.log.info(`Sende Nachricht an ${recipients.length} Empfänger ...`);

		const client = this.getEMessageClient();
		const result = await client.sendMessage(messageText, recipients);

		this.log.info('e*Message Versand abgeschlossen');
		this.log.debug(`e*Message Antwort: ${JSON.stringify(result.raw)}`);

		return result;
	}

	private async sendConfiguredTestMessage(): Promise<EMessageSendResult> {
		const serviceName = this.nativeConfig.testRecipientService;
		const identifier = this.nativeConfig.testRecipientIdentifier?.trim();
		const messageText = this.nativeConfig.testMessage?.trim();

		this.log.info('Starte Testversand ...');

		if (!identifier) {
			throw new Error('Test Pager-ID fehlt');
		}

		if (!messageText) {
			throw new Error('Testnachricht fehlt');
		}

		const result = await this.sendPagerMessage(messageText, [{ serviceName, identifier }]);

		await this.setStateAsync('alarm.lastTrackingId', result.trackingId || '', true);
		await this.setStateAsync('alarm.currentTrackingId', result.trackingId || '', true);
		await this.setStateAsync('alarm.summary', `Testversand gesendet an ${identifier}`, true);

		if (this.serviceSupportsDirectResponse(serviceName) && result.trackingId) {
			this.currentAlarm = {
				triggerId: 'test',
				triggerStateId: 'test',
				messageText,
				startedAt: new Date().toISOString(),
				activePager: {
					id: 'test',
					alias: 'Testpager',
					service: serviceName,
					identifier,
					escalationLevel: 1,
					enabled: true,
				},
				currentPagerIndex: 0,
				triggeredPagerIds: ['test'],
				finished: false,
				acknowledged: false,
				trackingId: result.trackingId,
				processedResponseKeys: [],
			};

			await this.setStateAsync('alarm.active', true, true);
			await this.setStateAsync('alarm.finished', false, true);
			await this.setStateAsync('alarm.acknowledged', false, true);
			await this.setStateAsync('alarm.currentPagerId', identifier, true);
			await this.setStateAsync('alarm.currentPagerAlias', 'Testpager', true);
			await this.setStateAsync('alarm.currentEscalationLevel', 1, true);
			await this.setStateAsync(
				'alarm.summary',
				`Testversand gesendet, warte auf Rückmeldung von ${identifier}`,
				true,
			);

			this.startStatusPolling();
			this.startPagerTimeout();
		} else {
			await this.setStateAsync(
				'alarm.summary',
				`Testversand gesendet, für ${serviceName} wird keine direkte Pager-Rückmeldung erwartet`,
				true,
			);
		}

		return result;
	}

	private async subscribeConfiguredTriggerStates(): Promise<void> {
		const triggers = Array.isArray(this.nativeConfig.triggerStates) ? this.nativeConfig.triggerStates : [];

		for (const trigger of triggers) {
			const stateId = trigger.stateId?.trim();

			if (trigger.enabled && stateId) {
				await this.subscribeForeignStatesAsync(stateId);
				this.log.info(`Trigger-State abonniert: ${stateId}`);
			}
		}

		await this.subscribeStatesAsync('alarm.injectResponseCode');
		await this.subscribeStatesAsync('alarm.externalResponseCode');
	}

	private evaluateTriggerCondition(trigger: TriggerStateEntry, state: ioBroker.State): boolean {
		const currentValue = state.val;

		switch (trigger.condition) {
			case 'true':
				return currentValue === true;
			case 'false':
				return currentValue === false;
			case '=':
				return String(currentValue) === trigger.compareValue;
			case '>': {
				const currentNumber = Number(currentValue);
				const compareNumber = Number(trigger.compareValue);
				return !Number.isNaN(currentNumber) && !Number.isNaN(compareNumber) && currentNumber > compareNumber;
			}
			case '<': {
				const currentNumber = Number(currentValue);
				const compareNumber = Number(trigger.compareValue);
				return !Number.isNaN(currentNumber) && !Number.isNaN(compareNumber) && currentNumber < compareNumber;
			}
			default:
				return false;
		}
	}

	private findTriggerByStateId(stateId: string): TriggerStateEntry | null {
		const triggers = Array.isArray(this.nativeConfig.triggerStates) ? this.nativeConfig.triggerStates : [];
		return triggers.find(trigger => trigger.enabled && trigger.stateId?.trim() === stateId) || null;
	}

	private async sendToPager(pager: PagerEntry, messageText: string): Promise<EMessageSendResult> {
		const pagerLabel = this.formatPagerLabel(pager);
		const pagerFolder = this.getPagerStateFolder(pager);
		const startedAt = new Date().toISOString();

		this.log.info(`Sende Alarm an Pager ${pagerLabel}`);

		const result = await this.sendPagerMessage(messageText, [
			{
				serviceName: pager.service,
				identifier: pager.identifier,
			},
		]);

		await this.setStateAsync(`pagers.${pagerFolder}.lastTriggered`, startedAt, true);
		await this.setStateAsync('alarm.lastTriggeredPager', pagerLabel, true);
		await this.setStateAsync('alarm.currentPagerId', pager.identifier, true);
		await this.setStateAsync('alarm.currentPagerAlias', pager.alias || '', true);
		await this.setStateAsync('alarm.currentEscalationLevel', pager.escalationLevel, true);

		if (result.trackingId) {
			await this.setStateAsync('alarm.currentTrackingId', result.trackingId, true);
			await this.setStateAsync('alarm.lastTrackingId', result.trackingId, true);
		}

		return result;
	}

	private async triggerAlarm(trigger: TriggerStateEntry, state: ioBroker.State): Promise<void> {
		if (this.currentAlarm) {
			this.log.warn(`Alarm bereits aktiv. Neue Auslösung von ${trigger.stateId} wird ignoriert.`);
			return;
		}

		const activePagers = this.getSortedActivePagers();

		if (!activePagers.length) {
			this.log.warn('Auslösung erkannt, aber es sind keine aktiven Pager konfiguriert');
			await this.setStateAsync('alarm.summary', 'Auslösung erkannt, aber keine aktiven Pager vorhanden', true);
			return;
		}

		const firstPager = activePagers[0];
		const messageText = trigger.messageText?.trim();

		if (!messageText) {
			this.log.warn(`Trigger ${trigger.stateId} hat keinen Nachrichtentext`);
			await this.setStateAsync('alarm.summary', `Trigger ${trigger.stateId} hat keinen Nachrichtentext`, true);
			return;
		}

		this.log.info(`Alarm ausgelöst durch ${trigger.stateId}`);
		this.log.info(`Erster Pager der Eskalation: ${this.formatPagerLabel(firstPager)}`);

		this.currentAlarm = {
			triggerId: trigger.id,
			triggerStateId: trigger.stateId,
			messageText,
			startedAt: new Date().toISOString(),
			activePager: firstPager,
			currentPagerIndex: 0,
			triggeredPagerIds: [firstPager.id],
			finished: false,
			acknowledged: false,
			trackingId: '',
			processedResponseKeys: [],
		};

		await this.setStateAsync('alarm.active', true, true);
		await this.setStateAsync('alarm.finished', false, true);
		await this.setStateAsync('alarm.acknowledged', false, true);
		await this.setStateAsync('alarm.lastTriggerStateId', trigger.stateId, true);
		await this.setStateAsync('alarm.lastTriggerMessage', messageText, true);
		await this.setStateAsync('alarm.triggeredCount', 1, true);
		await this.setStateAsync(
			'alarm.summary',
			`Alarm aktiv: ${this.formatPagerLabel(firstPager)} wurde ausgelöst`,
			true,
		);

		try {
			const result = await this.sendToPager(firstPager, messageText);
			this.currentAlarm.trackingId = result.trackingId || '';

			if (this.serviceSupportsDirectResponse(firstPager.service)) {
				await this.setStateAsync(
					'alarm.summary',
					`Alarm gesendet an ${this.formatPagerLabel(firstPager)}, warte auf Rückmeldung`,
					true,
				);
				this.startStatusPolling();
			} else {
				await this.setStateAsync(
					'alarm.summary',
					`Alarm an ${this.formatPagerLabel(firstPager)} gesendet, keine direkte Pager-Rückmeldung erwartet`,
					true,
				);
			}

			this.startPagerTimeout();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.log.error(`Fehler beim Alarmversand: ${message}`);
			await this.setStateAsync('alarm.summary', `Alarmversand fehlgeschlagen: ${message}`, true);
			await this.setStateAsync('alarm.finished', true, true);
			await this.setStateAsync('alarm.active', false, true);
			await this.setStateAsync('alarm.currentTrackingId', '', true);
			this.currentAlarm = null;
		}

		this.log.debug(`Auslösender State-Wert: ${JSON.stringify(state.val)}`);
	}

	private async finishAlarm(summaryText: string, acknowledged: boolean): Promise<void> {
		if (!this.currentAlarm) {
			return;
		}

		this.clearPagerTimeout();
		this.clearStatusPollTimer();

		this.currentAlarm.finished = true;
		this.currentAlarm.acknowledged = acknowledged;

		await this.setStateAsync('alarm.active', false, true);
		await this.setStateAsync('alarm.finished', true, true);
		await this.setStateAsync('alarm.acknowledged', acknowledged, true);
		await this.setStateAsync('alarm.summary', summaryText, true);
		await this.setStateAsync('alarm.injectResponseCode', 0, true);
		await this.setStateAsync('alarm.externalResponseCode', 0, true);
		await this.setStateAsync('alarm.currentTrackingId', '', true);

		this.log.info(`Alarm abgeschlossen: ${summaryText}`);
		this.currentAlarm = null;
	}

	private async triggerNextPager(reason: string): Promise<void> {
		if (!this.currentAlarm) {
			throw new Error('Kein aktiver Alarm vorhanden');
		}

		this.clearPagerTimeout();
		this.clearStatusPollTimer();

		const activePagers = this.getSortedActivePagers();
		const nextIndex = this.currentAlarm.currentPagerIndex + 1;

		if (nextIndex >= activePagers.length) {
			await this.finishAlarm(`Kein weiterer aktiver Pager vorhanden. Grund: ${reason}`, false);
			return;
		}

		const nextPager = activePagers[nextIndex];
		this.currentAlarm.currentPagerIndex = nextIndex;
		this.currentAlarm.activePager = nextPager;
		this.currentAlarm.trackingId = '';
		this.currentAlarm.processedResponseKeys = [];

		if (!this.currentAlarm.triggeredPagerIds.includes(nextPager.id)) {
			this.currentAlarm.triggeredPagerIds.push(nextPager.id);
		}

		await this.setStateAsync('alarm.triggeredCount', this.currentAlarm.triggeredPagerIds.length, true);
		await this.setStateAsync(
			'alarm.summary',
			`Nächster Pager wird ausgelöst: ${this.formatPagerLabel(nextPager)} (${reason})`,
			true,
		);

		const result = await this.sendToPager(nextPager, this.currentAlarm.messageText);
		this.currentAlarm.trackingId = result.trackingId || '';

		if (this.serviceSupportsDirectResponse(nextPager.service)) {
			await this.setStateAsync(
				'alarm.summary',
				`Alarm weitergeleitet an ${this.formatPagerLabel(nextPager)}, warte auf Rückmeldung`,
				true,
			);
			this.startStatusPolling();
		} else {
			await this.setStateAsync(
				'alarm.summary',
				`Alarm weitergeleitet an ${this.formatPagerLabel(nextPager)}, keine direkte Pager-Rückmeldung erwartet`,
				true,
			);
		}

		this.log.info(`Nächster Pager ausgelöst: ${this.formatPagerLabel(nextPager)}`);
		this.startPagerTimeout();
	}

	private async handleResponseCode(payload: ProcessResponsePayload): Promise<void> {
		if (!this.currentAlarm || !this.currentAlarm.activePager) {
			throw new Error('Kein aktiver Alarm vorhanden');
		}

		this.clearPagerTimeout();

		const responseEntry = this.findResponseCodeEntryByCode(Number(payload.code));
		if (!responseEntry) {
			throw new Error(`Unbekannter Antwortcode: ${payload.code}`);
		}

		const pager = this.findPagerByPayload(payload) || this.currentAlarm.activePager;
		const pagerFolder = this.getPagerStateFolder(pager);
		const pagerLabel = this.formatPagerLabel(pager);

		this.log.info(`Antwortcode ${responseEntry.code} (${responseEntry.label}) von ${pagerLabel} verarbeitet`);

		await this.setStateAsync('alarm.lastResponseCode', responseEntry.code, true);
		await this.setStateAsync('alarm.lastResponseText', responseEntry.label, true);
		await this.setStateAsync(`pagers.${pagerFolder}.lastResponseCode`, responseEntry.code, true);
		await this.setStateAsync(`pagers.${pagerFolder}.lastResponseText`, responseEntry.label, true);

		if (responseEntry.writeAckValue) {
			const ackValue = Number(responseEntry.ackValue ?? 0);
			await this.writeAckOutputValue(ackValue);
		}

		if (responseEntry.setOutput) {
			await this.triggerConfiguredOutput(responseEntry);
		}

		if (responseEntry.endAlarm) {
			await this.finishAlarm(`Alarm beendet durch Antwortcode "${responseEntry.label}" von ${pagerLabel}`, true);
			return;
		}

		if (responseEntry.triggerNextPager) {
			await this.triggerNextPager(`Antwortcode "${responseEntry.label}" von ${pagerLabel}`);
			return;
		}

		await this.setStateAsync(
			'alarm.summary',
			`Antwortcode "${responseEntry.label}" von ${pagerLabel} empfangen, warte weiter`,
			true,
		);

		this.startPagerTimeout();
	}

	private async onReady(): Promise<void> {
		try {
			this.log.info('AlarmManager startet ...');

			await this.ensureStaticObjects();
			await this.setServiceConnection(false);
			await this.setConnectionStatus('idle', '');
			await this.ensurePagerObjects();
			await this.updateAlarmOverviewStates();
			await this.resetAlarmStates();
			await this.resetAckOutputValue();
			await this.subscribeConfiguredTriggerStates();

			const hasCredentials = !!this.nativeConfig.apiUserId?.trim() && !!this.nativeConfig.apiPassword?.trim();

			if (hasCredentials) {
				try {
					await this.testCredentials();
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					this.log.warn(`Automatischer Verbindungstest fehlgeschlagen: ${message}`);
				}
			} else {
				this.log.info('Keine Zugangsdaten hinterlegt, Verbindung bleibt auf false');
				await this.setConnectionStatus('idle', 'Keine Zugangsdaten hinterlegt');
				await this.setServiceConnection(false);
			}

			this.log.info('AlarmManager gestartet');
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.log.error(`Fehler in onReady: ${message}`);

			try {
				await this.setServiceConnection(false);
				await this.setConnectionStatus('error', message);
			} catch {
				// ignorieren
			}
		}
	}

	private async onStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void> {
		if (!state) {
			return;
		}

		this.log.debug(`stateChange ${id}: ${JSON.stringify(state)}`);

		if (
			id === `${this.namespace}.alarm.injectResponseCode` ||
			id === `${this.namespace}.alarm.externalResponseCode`
		) {
			if (state.ack) {
				return;
			}

			const code = Number(state.val);
			const stateName = id.endsWith('.externalResponseCode') ? 'externer Antwortcode' : 'Test-Antwortcode';

			if (!code) {
				if (id === `${this.namespace}.alarm.injectResponseCode`) {
					await this.setStateAsync('alarm.injectResponseCode', 0, true);
				} else {
					await this.setStateAsync('alarm.externalResponseCode', 0, true);
				}
				return;
			}

			this.log.info(`${stateName} über State empfangen: ${code}`);

			if (!this.currentAlarm) {
				this.log.warn(`${stateName} ignoriert: Kein aktiver Alarm vorhanden`);
				await this.setStateAsync('alarm.summary', `Kein aktiver Alarm für ${stateName} vorhanden`, true);

				if (id === `${this.namespace}.alarm.injectResponseCode`) {
					await this.setStateAsync('alarm.injectResponseCode', 0, true);
				} else {
					await this.setStateAsync('alarm.externalResponseCode', 0, true);
				}
				return;
			}

			try {
				await this.handleResponseCode({ code });
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				this.log.warn(`${stateName} konnte nicht verarbeitet werden: ${message}`);
				await this.setStateAsync('alarm.summary', `${stateName} fehlgeschlagen: ${message}`, true);
			} finally {
				if (id === `${this.namespace}.alarm.injectResponseCode`) {
					await this.setStateAsync('alarm.injectResponseCode', 0, true);
				} else {
					await this.setStateAsync('alarm.externalResponseCode', 0, true);
				}
			}
			return;
		}

		if (state.ack) {
			return;
		}

		const trigger = this.findTriggerByStateId(id);
		if (!trigger) {
			return;
		}

		this.log.info(`Trigger-State Änderung erkannt: ${id}`);

		const matches = this.evaluateTriggerCondition(trigger, state);
		if (!matches) {
			this.log.debug(`Trigger-Bedingung nicht erfüllt für ${id}`);
			return;
		}

		await this.triggerAlarm(trigger, state);
	}

	private onObjectChange(id: string, obj: ioBroker.Object | null | undefined): void {
		if (obj) {
			this.log.debug(`objectChange ${id}`);
		}
	}

	private onUnload(callback: () => void): void {
		this.clearPagerTimeout();
		this.clearStatusPollTimer();
		this.clearAckResetTimer();
		this.clearAllOutputResetTimers();

		Promise.all([this.setServiceConnection(false), this.setConnectionStatus('idle', '')])
			.then(() => callback())
			.catch(() => callback());
	}

	private async onMessage(obj: ioBroker.Message): Promise<void> {
		if (!obj || !obj.command) {
			return;
		}

		this.log.info(`Nachricht empfangen: ${obj.command}`);
		this.log.debug(`Komplette Nachricht: ${JSON.stringify(obj)}`);

		try {
			switch (obj.command) {
				case 'sendTestMessage': {
					const result = await this.sendConfiguredTestMessage();
					await this.setServiceConnection(true);
					await this.setConnectionStatus('connected', '');

					if (obj.callback) {
						this.sendTo(
							obj.from,
							obj.command,
							{
								success: true,
								result,
							},
							obj.callback,
						);
					}
					break;
				}

				case 'testCredentials': {
					await this.testCredentials();

					if (obj.callback) {
						this.sendTo(
							obj.from,
							obj.command,
							{
								success: true,
							},
							obj.callback,
						);
					}
					break;
				}

				case 'processResponseCode': {
					const payload = (obj.message || {}) as ProcessResponsePayload;

					if (payload.code === undefined || payload.code === null || Number.isNaN(Number(payload.code))) {
						throw new Error('Antwortcode fehlt');
					}

					await this.handleResponseCode({
						code: Number(payload.code),
						pagerId: payload.pagerId,
						pagerIdentifier: payload.pagerIdentifier,
					});

					if (obj.callback) {
						this.sendTo(
							obj.from,
							obj.command,
							{
								success: true,
							},
							obj.callback,
						);
					}
					break;
				}

				default: {
					this.log.warn(`Unbekannter Befehl empfangen: ${obj.command}`);

					if (obj.callback) {
						this.sendTo(
							obj.from,
							obj.command,
							{
								success: false,
								error: `Unknown command: ${obj.command}`,
							},
							obj.callback,
						);
					}
					break;
				}
			}
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			this.log.error(`Fehler bei ${obj.command}: ${message}`);

			if (obj.command === 'testCredentials') {
				try {
					await this.setServiceConnection(false);
					await this.setConnectionStatus('error', message);
				} catch {
					// ignorieren
				}
			}

			if (obj.callback) {
				this.sendTo(
					obj.from,
					obj.command,
					{
						success: false,
						error: message,
					},
					obj.callback,
				);
			}
		}
	}
}

if (require.main !== module) {
	module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new AlarmManager(options);
} else {
	(() => new AlarmManager())();
}
