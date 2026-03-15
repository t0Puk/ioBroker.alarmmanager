import utils from '@iobroker/adapter-core';
import { EMessageClient } from './lib/emessageClient';

class Alarmmanager extends utils.Adapter {
	private pollTimer: ioBroker.Interval | undefined;
	private readonly emessageClient: EMessageClient;

	public constructor(options: Partial<utils.AdapterOptions> = {}) {
		super({
			...options,
			name: 'alarmmanager',
		});

		this.emessageClient = new EMessageClient('https://api.emessage.de');

		this.on('ready', this.onReady.bind(this));
		this.on('stateChange', this.onStateChange.bind(this));
		this.on('unload', this.onUnload.bind(this));
	}

	private async onReady(): Promise<void> {
		this.log.info('AlarmManager startet ...');

		await this.setState('info.connection', false, true);

		await this.extendObject('info.lastLogin', {
			type: 'state',
			common: {
				name: 'Zeitpunkt des letzten erfolgreichen API-Logins',
				type: 'string',
				role: 'text',
				read: true,
				write: false,
			},
			native: {},
		});

		await this.extendObject('info.lastError', {
			type: 'state',
			common: {
				name: 'Letzter Fehler',
				type: 'string',
				role: 'text',
				read: true,
				write: false,
			},
			native: {},
		});

		await this.extendObject('info.queueLength', {
			type: 'state',
			common: {
				name: 'Anzahl wartender Alarme',
				type: 'number',
				role: 'value',
				read: true,
				write: false,
				def: 0,
			},
			native: {},
		});

		await this.extendObject('actions.testLogin', {
			type: 'state',
			common: {
				name: 'Testet den Login zur e*Message API',
				type: 'boolean',
				role: 'button',
				read: false,
				write: true,
				def: false,
			},
			native: {},
		});

		await this.extendObject('actions.testSend', {
			type: 'state',
			common: {
				name: 'Sendet eine Testnachricht',
				type: 'boolean',
				role: 'button',
				read: false,
				write: true,
				def: false,
			},
			native: {},
		});

		await this.extendObject('actions.testMessage', {
			type: 'state',
			common: {
				name: 'Text für Testnachricht',
				type: 'string',
				role: 'text',
				read: true,
				write: true,
				def: 'AlarmManager Testnachricht',
			},
			native: {},
		});

		await this.extendObject('actions.lastSendResult', {
			type: 'state',
			common: {
				name: 'Ergebnis der letzten Testsendung',
				type: 'string',
				role: 'json',
				read: true,
				write: false,
			},
			native: {},
		});

		await this.subscribeStates('actions.testLogin');
		await this.subscribeStates('actions.testSend');

		await this.setState('info.queueLength', 0, true);

		this.startPollingInfoLog();
		this.log.info('AlarmManager wurde initialisiert.');
	}

	private startPollingInfoLog(): void {
		const intervalSec = Number(this.config.pollIntervalSec) || 30;

		this.pollTimer = this.setInterval(() => {
			this.log.debug(`Polling aktiv. Intervall: ${intervalSec} Sekunden`);
		}, intervalSec * 1000);
	}

	private async onStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void> {
		if (!state || state.ack) {
			return;
		}

		if (id === `${this.namespace}.actions.testLogin` && state.val === true) {
			await this.handleTestLogin();
			await this.setState('actions.testLogin', false, true);
		}

		if (id === `${this.namespace}.actions.testSend` && state.val === true) {
			await this.handleTestSend();
			await this.setState('actions.testSend', false, true);
		}
	}

	private async handleTestLogin(): Promise<void> {
		try {
			const apiUserId = String(this.config.apiUserId || '').trim();
			const apiPassword = String(this.config.apiPassword || '').trim();

			if (!apiUserId || !apiPassword) {
				throw new Error('apiUserId oder apiPassword ist nicht gesetzt.');
			}

			await this.emessageClient.login(apiUserId, apiPassword);

			await this.setState('info.connection', true, true);
			await this.setState('info.lastLogin', new Date().toISOString(), true);
			await this.setState('info.lastError', '', true);

			this.log.info('Login zur e*Message API erfolgreich.');
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			await this.setState('info.connection', false, true);
			await this.setState('info.lastError', message, true);
			this.log.error(`Test-Login fehlgeschlagen: ${message}`);
		}
	}

	private async handleTestSend(): Promise<void> {
		try {
			const apiUserId = String(this.config.apiUserId || '').trim();
			const apiPassword = String(this.config.apiPassword || '').trim();
			const senderAddress = String(this.config.senderAddress || '').trim();
			const testRecipientService = String(this.config.testRecipientService || '2wayS').trim() as
				| 'eCityruf'
				| 'eBos'
				| '2wayS';
			const testRecipientIdentifier = String(this.config.testRecipientIdentifier || '').trim();

			if (!apiUserId || !apiPassword) {
				throw new Error('apiUserId oder apiPassword ist nicht gesetzt.');
			}

			if (!senderAddress) {
				throw new Error('senderAddress ist nicht gesetzt.');
			}

			if (!testRecipientIdentifier) {
				throw new Error('testRecipientIdentifier ist nicht gesetzt.');
			}

			const messageState = await this.getStateAsync('actions.testMessage');
			const messageText = String(messageState?.val || 'AlarmManager Testnachricht');

			await this.emessageClient.login(apiUserId, apiPassword);

			const result = await this.emessageClient.sendMessage({
				test: true,
				senderAddress,
				message: messageText,
				recipients: [
					{
						serviceName: testRecipientService,
						identifier: testRecipientIdentifier,
					},
				],
			});

			await this.setState('info.connection', true, true);
			await this.setState('info.lastError', '', true);
			await this.setState('actions.lastSendResult', JSON.stringify(result, null, 2), true);

			this.log.info('Testnachricht erfolgreich gesendet.');
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			await this.setState('info.connection', false, true);
			await this.setState('info.lastError', message, true);
			this.log.error(`Testsendung fehlgeschlagen: ${message}`);
		}
	}

	private onUnload(callback: () => void): void {
		try {
			if (this.pollTimer) {
				this.clearInterval(this.pollTimer);
				this.pollTimer = undefined;
			}
			callback();
		} catch {
			callback();
		}
	}
}

if (require.main !== module) {
	module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new Alarmmanager(options);
} else {
	(() => new Alarmmanager())();
}
