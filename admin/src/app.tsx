import React, { useEffect, useMemo, useState } from 'react';
import Connection from '@iobroker/adapter-react/Connection';
import SelectID from '@iobroker/adapter-react/Dialogs/SelectID';

declare const window: any;
declare const io: any;

type PagerService = '2wayS' | 'eCityruf' | 'eBos';
type TriggerCondition = 'true' | 'false' | '=' | '>' | '<';

type PagerEntry = {
	id: string;
	alias: string;
	service: PagerService;
	identifier: string;
	escalationLevel: number;
	enabled: boolean;
};

type ResponseCodeEntry = {
	id: string;
	label: string;
	code: number;
	endAlarm: boolean;
	triggerNextPager: boolean;
	setOutput: boolean;
	outputStateId: string;
	outputValue: string;
	writeAckValue: boolean;
	ackValue: number;
};

type TriggerStateEntry = {
	id: string;
	stateId: string;
	enabled: boolean;
	condition: TriggerCondition;
	compareValue: string;
	messageText: string;
};

type Config = {
	apiUserId: string;
	apiPassword: string;
	pollIntervalSec: number;
	queueDelaySec: number;
	defaultResponseTimeoutSec: number;
	ackResetDelaySec: number;
	outputResetDelaySec: number;
	telegramInstance: string;
	sendTelegramWithPager: boolean;
	testRecipientService: PagerService;
	testRecipientIdentifier: string;
	testMessage: string;
	pagers: PagerEntry[];
	responseCodes: ResponseCodeEntry[];
	triggerStates: TriggerStateEntry[];
};

type TabKey = 'general' | 'pagers' | 'responses' | 'triggers' | 'timing';

type TelegramInstanceOption = {
	value: string;
	label: string;
};

type ObjectPickerTarget = { type: 'trigger'; id: string } | { type: 'responseOutput'; id: string } | null;

const DEFAULT_CONFIG: Config = {
	apiUserId: '',
	apiPassword: '',
	pollIntervalSec: 30,
	queueDelaySec: 10,
	defaultResponseTimeoutSec: 120,
	ackResetDelaySec: 60,
	outputResetDelaySec: 10,
	telegramInstance: '',
	sendTelegramWithPager: false,
	testRecipientService: '2wayS',
	testRecipientIdentifier: '',
	testMessage: 'Dies ist eine Testnachricht vom AlarmManager',
	pagers: [],
	responseCodes: [
		{
			id: 'ack',
			label: 'Quittiert',
			code: 1,
			endAlarm: true,
			triggerNextPager: false,
			setOutput: false,
			outputStateId: '',
			outputValue: '',
			writeAckValue: true,
			ackValue: 1,
		},
		{
			id: 'forward',
			label: 'Weiterleiten',
			code: 2,
			endAlarm: false,
			triggerNextPager: true,
			setOutput: false,
			outputStateId: '',
			outputValue: '',
			writeAckValue: true,
			ackValue: 2,
		},
		{
			id: 'reject',
			label: 'Abgelehnt',
			code: 3,
			endAlarm: false,
			triggerNextPager: true,
			setOutput: false,
			outputStateId: '',
			outputValue: '',
			writeAckValue: true,
			ackValue: 3,
		},
	],
	triggerStates: [],
};

function createPager(): PagerEntry {
	return {
		id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
		alias: '',
		service: '2wayS',
		identifier: '',
		escalationLevel: 1,
		enabled: true,
	};
}

function createResponseCode(): ResponseCodeEntry {
	return {
		id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
		label: '',
		code: 0,
		endAlarm: false,
		triggerNextPager: false,
		setOutput: false,
		outputStateId: '',
		outputValue: '',
		writeAckValue: false,
		ackValue: 0,
	};
}

function createTriggerState(): TriggerStateEntry {
	return {
		id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
		stateId: '',
		enabled: true,
		condition: 'true',
		compareValue: '',
		messageText: '',
	};
}

function getQuery(name: string): string | null {
	const url = new URL(window.location.href);
	return url.searchParams.get(name);
}

function sanitizeSelectIdDialog(doc: Document): void {
	const textMap: Record<string, string> = {
		RA_OK: 'OK',
		RA_CANCEL: 'Abbrechen',
		ra_OK: 'OK',
		ra_CANCEL: 'Abbrechen',
		'RA_Please select object ID...': 'Bitte Objekt-ID auswählen ...',
		'ra_Please select object ID...': 'Bitte Objekt-ID auswählen ...',
		RA_SelectID: 'ID auswählen',
		ra_SelectID: 'ID auswählen',
		RA_filter_id: 'ID',
		ra_filter_id: 'ID',
		RA_filter_name: 'Name',
		ra_filter_name: 'Name',
		RA_filter_role: 'Rolle',
		ra_filter_role: 'Rolle',
		RA_filter_room: 'Raum',
		ra_filter_room: 'Raum',
		RA_filter_func: 'Funktion',
		ra_filter_func: 'Funktion',
		RA_Value: 'Wert',
		ra_Value: 'Wert',
	};

	const replaceText = (value: string): string => {
		let result = value;
		Object.entries(textMap).forEach(([search, replace]) => {
			result = result.split(search).join(replace);
		});
		return result;
	};

	const replaceNodeText = (node: Node): void => {
		if (node.nodeType === Node.TEXT_NODE) {
			const oldText = node.textContent ?? '';
			const newText = replaceText(oldText);
			if (oldText !== newText) {
				node.textContent = newText;
			}
			return;
		}

		if (node.nodeType !== Node.ELEMENT_NODE) {
			return;
		}

		const el = node as HTMLElement;

		if (el instanceof HTMLInputElement) {
			if (el.placeholder) {
				el.placeholder = replaceText(el.placeholder);
			}
			if (typeof el.value === 'string' && el.value) {
				const newValue = replaceText(el.value);
				if (newValue !== el.value) {
					el.value = newValue;
				}
			}
		}

		if (el instanceof HTMLButtonElement) {
			const valueAttr = el.getAttribute('value');
			if (valueAttr) {
				el.setAttribute('value', replaceText(valueAttr));
			}
		}

		if (el.title) {
			el.title = replaceText(el.title);
		}

		const ariaLabel = el.getAttribute('aria-label');
		if (ariaLabel) {
			el.setAttribute('aria-label', replaceText(ariaLabel));
		}

		Array.from(el.childNodes).forEach(child => replaceNodeText(child));
	};

	if (doc.body) {
		replaceNodeText(doc.body);
	}

	// Direkt auf die sichtbaren Button-Labels unten rechts gehen
	doc.querySelectorAll('span.MuiButton-label').forEach(node => {
		const text = (node.textContent ?? '').trim();
		if (text === 'RA_OK' || text === 'ra_OK') {
			node.textContent = 'OK';
		}
		if (text === 'RA_CANCEL' || text === 'ra_CANCEL') {
			node.textContent = 'Abbrechen';
		}
	});

	// Überschrift oben im Dialog
	doc.querySelectorAll('div, span, h1, h2, h3').forEach(node => {
		const text = (node.textContent ?? '').trim();
		if (text === 'RA_Please select object ID...' || text === 'ra_Please select object ID...') {
			node.textContent = 'Bitte Objekt-ID auswählen ...';
		}
	});

	// Tabellenköpfe
	doc.querySelectorAll('th, td, div, span').forEach(node => {
		const text = (node.textContent ?? '').trim();
		if (text === 'RA_filter_id' || text === 'ra_filter_id') {
			node.textContent = 'ID';
		} else if (text === 'RA_filter_name' || text === 'ra_filter_name') {
			node.textContent = 'Name';
		} else if (text === 'RA_filter_role' || text === 'ra_filter_role') {
			node.textContent = 'Rolle';
		} else if (text === 'RA_filter_room' || text === 'ra_filter_room') {
			node.textContent = 'Raum';
		} else if (text === 'RA_filter_func' || text === 'ra_filter_func') {
			node.textContent = 'Funktion';
		} else if (text === 'RA_Value' || text === 'ra_Value') {
			node.textContent = 'Wert';
		}
	});

	// Falls der Dialog in iframes steckt
	doc.querySelectorAll('iframe').forEach(frame => {
		try {
			const frameDoc = frame.contentDocument;
			if (frameDoc?.body) {
				sanitizeSelectIdDialog(frameDoc);
			}
		} catch {
			// ignorieren
		}
	});
}

function startSelectIdSanitizer(): () => void {
	const apply = (): void => {
		try {
			sanitizeSelectIdDialog(document);
		} catch {
			// ignorieren
		}
	};

	apply();

	const observer = new MutationObserver(() => {
		apply();
	});

	if (document.body) {
		observer.observe(document.body, {
			childList: true,
			subtree: true,
			characterData: true,
		});
	}

	const interval = window.setInterval(() => {
		apply();
	}, 200);

	return () => {
		observer.disconnect();
		window.clearInterval(interval);
	};
}

export default function App(): React.JSX.Element {
	const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);
	const [status, setStatus] = useState<string>('UI geladen');
	const [isSaving, setIsSaving] = useState<boolean>(false);
	const [isTestingCredentials, setIsTestingCredentials] = useState<boolean>(false);
	const [isSendingTestMessage, setIsSendingTestMessage] = useState<boolean>(false);
	const [activeTab, setActiveTab] = useState<TabKey>('general');
	const [telegramInstances, setTelegramInstances] = useState<TelegramInstanceOption[]>([]);
	const [showObjectPicker, setShowObjectPicker] = useState<boolean>(false);
	const [objectPickerTarget, setObjectPickerTarget] = useState<ObjectPickerTarget>(null);
	const [currentSelectedId, setCurrentSelectedId] = useState<string>('');

	const instanceId = useMemo(() => {
		const instance = getQuery('instance');
		return instance ? `system.adapter.${instance}` : 'system.adapter.alarmmanager.0';
	}, []);

	const socket = useMemo(() => {
		if (window.socket && typeof window.socket.emit === 'function') {
			return window.socket;
		}
		return io.connect('/', {
			path: '/socket.io',
			transports: ['websocket', 'polling'],
		});
	}, []);

	const adminConnection = useMemo(
		() =>
			new Connection({
				name: 'alarmmanager',
			}),
		[],
	);

	useEffect(() => {
		let active = true;

		setStatus(`Lade Konfiguration (${instanceId}) ...`);

		socket.emit('getObject', instanceId, (err: any, obj: any) => {
			if (!active) {
				return;
			}

			if (err) {
				setStatus(`Fehler beim Laden: ${String(err)}`);
				return;
			}

			if (obj?.native) {
				setConfig({
					apiUserId: obj.native.apiUserId ?? '',
					apiPassword: obj.native.apiPassword ?? '',
					pollIntervalSec: Number(obj.native.pollIntervalSec ?? 30),
					queueDelaySec: Number(obj.native.queueDelaySec ?? 10),
					defaultResponseTimeoutSec: Number(obj.native.defaultResponseTimeoutSec ?? 120),
					ackResetDelaySec: Number(obj.native.ackResetDelaySec ?? 60),
					outputResetDelaySec: Number(obj.native.outputResetDelaySec ?? 10),
					telegramInstance: obj.native.telegramInstance ?? '',
					sendTelegramWithPager: Boolean(obj.native.sendTelegramWithPager ?? false),
					testRecipientService: obj.native.testRecipientService ?? '2wayS',
					testRecipientIdentifier: obj.native.testRecipientIdentifier ?? '',
					testMessage: obj.native.testMessage ?? 'Dies ist eine Testnachricht vom AlarmManager',
					pagers: Array.isArray(obj.native.pagers) ? obj.native.pagers : [],
					responseCodes:
						Array.isArray(obj.native.responseCodes) && obj.native.responseCodes.length
							? obj.native.responseCodes.map((item: any) => ({
									id: item.id ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`,
									label: item.label ?? '',
									code: Number(item.code ?? 0),
									endAlarm: Boolean(item.endAlarm ?? false),
									triggerNextPager: Boolean(item.triggerNextPager ?? false),
									setOutput: Boolean(item.setOutput ?? false),
									outputStateId: item.outputStateId ?? '',
									outputValue: item.outputValue ?? '',
									writeAckValue: Boolean(item.writeAckValue ?? false),
									ackValue: Number(item.ackValue ?? 0),
								}))
							: DEFAULT_CONFIG.responseCodes,
					triggerStates: Array.isArray(obj.native.triggerStates)
						? obj.native.triggerStates.map((item: any) => ({
								id: item.id ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`,
								stateId: item.stateId ?? '',
								enabled: Boolean(item.enabled ?? true),
								condition: item.condition ?? 'true',
								compareValue: item.compareValue ?? '',
								messageText: item.messageText ?? '',
							}))
						: [],
				});
				setStatus(`Konfiguration geladen (${instanceId})`);
			} else {
				setStatus(`Adapter-Objekt nicht gefunden (${instanceId})`);
			}
		});

		return () => {
			active = false;
		};
	}, [instanceId, socket]);

	useEffect(() => {
		let active = true;

		socket.emit(
			'getObjectView',
			'system',
			'instance',
			{
				startkey: 'system.adapter.telegram.',
				endkey: 'system.adapter.telegram.\u9999',
			},
			(err: any, doc: any) => {
				if (!active) {
					return;
				}

				if (err || !doc?.rows) {
					return;
				}

				const list: TelegramInstanceOption[] = doc.rows
					.map((row: any) => row.value)
					.filter((obj: any) => obj?.common?.name === 'telegram')
					.map((obj: any) => ({
						value: obj._id.replace('system.adapter.', ''),
						label: obj._id.replace('system.adapter.', ''),
					}))
					.sort((a: TelegramInstanceOption, b: TelegramInstanceOption) => a.label.localeCompare(b.label));

				setTelegramInstances(list);
			},
		);

		return () => {
			active = false;
		};
	}, [socket]);

	useEffect(() => {
		if (!showObjectPicker) {
			return;
		}

		const stop = startSelectIdSanitizer();
		return () => stop();
	}, [showObjectPicker]);

	function update<K extends keyof Config>(key: K, value: Config[K]): void {
		setConfig(prev => ({ ...prev, [key]: value }));
	}

	function updatePager(id: string, key: keyof PagerEntry, value: any): void {
		setConfig(prev => ({
			...prev,
			pagers: prev.pagers.map(pager => (pager.id === id ? { ...pager, [key]: value } : pager)),
		}));
	}

	function addPager(): void {
		setConfig(prev => ({
			...prev,
			pagers: [...prev.pagers, createPager()],
		}));
	}

	function deletePager(id: string): void {
		setConfig(prev => ({
			...prev,
			pagers: prev.pagers.filter(pager => pager.id !== id),
		}));
	}

	function sortPagers(list: PagerEntry[]): PagerEntry[] {
		return [...list].sort((a, b) => a.escalationLevel - b.escalationLevel);
	}

	function updateResponseCode(id: string, key: keyof ResponseCodeEntry, value: any): void {
		setConfig(prev => ({
			...prev,
			responseCodes: prev.responseCodes.map(item => (item.id === id ? { ...item, [key]: value } : item)),
		}));
	}

	function addResponseCode(): void {
		setConfig(prev => ({
			...prev,
			responseCodes: [...prev.responseCodes, createResponseCode()],
		}));
	}

	function deleteResponseCode(id: string): void {
		setConfig(prev => ({
			...prev,
			responseCodes: prev.responseCodes.filter(item => item.id !== id),
		}));
	}

	function sortResponseCodes(list: ResponseCodeEntry[]): ResponseCodeEntry[] {
		return [...list].sort((a, b) => a.code - b.code);
	}

	function updateTriggerState(id: string, key: keyof TriggerStateEntry, value: any): void {
		setConfig(prev => ({
			...prev,
			triggerStates: prev.triggerStates.map(item => (item.id === id ? { ...item, [key]: value } : item)),
		}));
	}

	function addTriggerState(): void {
		setConfig(prev => ({
			...prev,
			triggerStates: [...prev.triggerStates, createTriggerState()],
		}));
	}

	function deleteTriggerState(id: string): void {
		setConfig(prev => ({
			...prev,
			triggerStates: prev.triggerStates.filter(item => item.id !== id),
		}));
	}

	function openObjectPicker(target: ObjectPickerTarget, selectedId = ''): void {
		setObjectPickerTarget(target);
		setCurrentSelectedId(selectedId);
		setShowObjectPicker(true);
	}

	function applySelectedObjectId(selected: string | string[] | undefined): void {
		const value = Array.isArray(selected) ? selected[0] : selected;

		if (!value || !objectPickerTarget) {
			setShowObjectPicker(false);
			setObjectPickerTarget(null);
			setCurrentSelectedId('');
			return;
		}

		if (objectPickerTarget.type === 'trigger') {
			updateTriggerState(objectPickerTarget.id, 'stateId', value);
		} else if (objectPickerTarget.type === 'responseOutput') {
			updateResponseCode(objectPickerTarget.id, 'outputStateId', value);
		}

		setShowObjectPicker(false);
		setObjectPickerTarget(null);
		setCurrentSelectedId('');
	}

	function save(closeAfterSave = false): void {
		setIsSaving(true);
		setStatus(`Speichere Konfiguration (${instanceId}) ...`);

		socket.emit('getObject', instanceId, (err: any, obj: any) => {
			if (err) {
				setStatus(`Speichern fehlgeschlagen: ${String(err)}`);
				setIsSaving(false);
				return;
			}

			if (!obj) {
				setStatus(`Speichern fehlgeschlagen: Objekt nicht gefunden (${instanceId})`);
				setIsSaving(false);
				return;
			}

			obj.native = {
				...obj.native,
				...config,
				ackResetDelaySec: Number(config.ackResetDelaySec || 0),
				outputResetDelaySec: Number(config.outputResetDelaySec || 0),
				pollIntervalSec: Number(config.pollIntervalSec || 0),
				queueDelaySec: Number(config.queueDelaySec || 0),
				defaultResponseTimeoutSec: Number(config.defaultResponseTimeoutSec || 0),
				pagers: sortPagers(config.pagers),
				responseCodes: sortResponseCodes(config.responseCodes),
			};

			socket.emit('setObject', obj._id, obj, (saveErr: any) => {
				setIsSaving(false);

				if (saveErr) {
					setStatus(`Speichern fehlgeschlagen: ${String(saveErr)}`);
				} else {
					setStatus(`Konfiguration gespeichert (${obj._id})`);
					if (closeAfterSave) {
						closeWindow();
					}
				}
			});
		});
	}

	function testCredentialsAndSave(): void {
		setIsTestingCredentials(true);
		setStatus('Prüfe Zugangsdaten und speichere ...');

		socket.emit('getObject', instanceId, (err: any, obj: any) => {
			if (err || !obj) {
				setIsTestingCredentials(false);
				setStatus(`Zugangsdaten-Test fehlgeschlagen: ${String(err || 'Objekt nicht gefunden')}`);
				return;
			}

			obj.native = {
				...obj.native,
				...config,
				ackResetDelaySec: Number(config.ackResetDelaySec || 0),
				outputResetDelaySec: Number(config.outputResetDelaySec || 0),
				pollIntervalSec: Number(config.pollIntervalSec || 0),
				queueDelaySec: Number(config.queueDelaySec || 0),
				defaultResponseTimeoutSec: Number(config.defaultResponseTimeoutSec || 0),
				pagers: sortPagers(config.pagers),
				responseCodes: sortResponseCodes(config.responseCodes),
			};

			socket.emit('setObject', obj._id, obj, (saveErr: any) => {
				if (saveErr) {
					setIsTestingCredentials(false);
					setStatus(`Zugangsdaten-Test fehlgeschlagen: ${String(saveErr)}`);
					return;
				}

				const cmdInstance = instanceId.replace('system.adapter.', '');
				socket.emit(
					'sendTo',
					cmdInstance,
					'testCredentials',
					{},
					(response: { success?: boolean; error?: string } | undefined) => {
						setIsTestingCredentials(false);

						if (response?.success) {
							setStatus('Zugangsdaten erfolgreich geprüft und gespeichert');
						} else {
							setStatus(
								`Zugangsdaten-Test fehlgeschlagen: ${
									response?.error || 'Keine Antwort vom Adapter beim Test der Zugangsdaten erhalten'
								}`,
							);
						}
					},
				);
			});
		});
	}

	function sendTestMessage(): void {
		setIsSendingTestMessage(true);
		setStatus(`Sende Testnachricht über ${instanceId.replace('system.adapter.', '')} ...`);

		const cmdInstance = instanceId.replace('system.adapter.', '');

		socket.emit(
			'sendTo',
			cmdInstance,
			'sendTestMessage',
			{},
			(response: { success?: boolean; result?: any; error?: string } | undefined) => {
				setIsSendingTestMessage(false);

				setConfig(prev => ({
					...prev,
					testRecipientIdentifier: '',
				}));

				if (response?.success) {
					const trackingId = response.result?.trackingId;
					if (trackingId) {
						setStatus(`Testnachricht erfolgreich gesendet (Tracking-ID: ${trackingId})`);
					} else {
						setStatus('Testnachricht erfolgreich gesendet');
					}
				} else {
					setStatus(`Testversand fehlgeschlagen: ${response?.error || 'Keine Antwort vom Adapter erhalten'}`);
				}
			},
		);
	}

	function closeWindow(): void {
		if (window.parent && typeof window.parent.postMessage === 'function') {
			window.parent.postMessage('close', '*');
		}
		if (typeof window.close === 'function') {
			window.close();
		}
	}

	const pageStyle: React.CSSProperties = {
		background: '#f3f3f3',
		color: '#000000',
		minHeight: '100vh',
		fontFamily: 'Arial, sans-serif',
		paddingBottom: 90,
	};

	const contentStyle: React.CSSProperties = {
		padding: '16px 16px 0 16px',
	};

	const rowStyle: React.CSSProperties = {
		display: 'grid',
		gridTemplateColumns: '1fr 1fr',
		gap: 16,
		marginBottom: 16,
	};

	const labelStyle: React.CSSProperties = {
		display: 'block',
		marginBottom: 6,
		fontWeight: 500,
		fontSize: 14,
	};

	const hintStyle: React.CSSProperties = {
		fontSize: 12,
		color: '#666',
		marginTop: 6,
	};

	const inputStyle: React.CSSProperties = {
		width: '100%',
		padding: 10,
		fontSize: 15,
		boxSizing: 'border-box',
		border: 'none',
		borderBottom: '1px solid #bdbdbd',
		background: 'transparent',
		outline: 'none',
	};

	const sectionTitleStyle: React.CSSProperties = {
		fontSize: 20,
		fontWeight: 'bold',
		marginTop: 16,
		marginBottom: 16,
	};

	const statusStyle: React.CSSProperties = {
		background: '#00c853',
		color: '#000',
		padding: 12,
		fontWeight: 'bold',
		marginBottom: 20,
		borderRadius: 4,
		wordBreak: 'break-word',
	};

	const cardStyle: React.CSSProperties = {
		background: '#f8f8f8',
		border: '1px solid #d0d0d0',
		borderRadius: 4,
		padding: 16,
		marginBottom: 16,
	};

	const smallButtonStyle: React.CSSProperties = {
		padding: '10px 16px',
		fontSize: 14,
		cursor: 'pointer',
		borderRadius: 3,
		border: '1px solid #999',
		background: '#fff',
		whiteSpace: 'nowrap',
	};

	const tabBarStyle: React.CSSProperties = {
		display: 'flex',
		gap: 24,
		padding: '0 16px',
		borderBottom: '1px solid #d0d0d0',
		background: '#fff',
		flexWrap: 'wrap',
	};

	const tabButtonStyle = (tab: TabKey): React.CSSProperties => ({
		padding: '14px 0 12px 0',
		fontSize: 14,
		cursor: 'pointer',
		border: 'none',
		borderBottom: activeTab === tab ? '2px solid #2196f3' : '2px solid transparent',
		background: 'transparent',
		color: activeTab === tab ? '#2196f3' : '#444',
		textTransform: 'uppercase',
	});

	const footerStyle: React.CSSProperties = {
		position: 'fixed',
		left: 0,
		right: 0,
		bottom: 0,
		background: '#3fa2d4',
		padding: '10px 16px',
		display: 'flex',
		justifyContent: 'space-between',
		alignItems: 'center',
		boxSizing: 'border-box',
	};

	const footerButtonStyle: React.CSSProperties = {
		padding: '10px 18px',
		fontSize: 14,
		cursor: 'pointer',
		borderRadius: 3,
		border: '1px solid #888',
		background: '#fff',
		marginRight: 10,
	};

	function renderGeneralTab(): React.JSX.Element {
		return (
			<>
				<div style={sectionTitleStyle}>Allgemeine Einstellungen</div>

				<div style={rowStyle}>
					<div>
						<label style={labelStyle}>API User ID</label>
						<input
							style={inputStyle}
							value={config.apiUserId}
							onChange={e => update('apiUserId', e.target.value)}
						/>
					</div>

					<div>
						<label style={labelStyle}>API Password</label>
						<input
							type="password"
							style={inputStyle}
							value={config.apiPassword}
							onChange={e => update('apiPassword', e.target.value)}
						/>
					</div>
				</div>

				<div style={rowStyle}>
					<div>
						<label style={labelStyle}>Telegram Instanz</label>
						<select
							style={inputStyle}
							value={config.telegramInstance}
							onChange={e => update('telegramInstance', e.target.value)}
						>
							<option value="">Keine auswählen</option>
							{telegramInstances.map(item => (
								<option
									key={item.value}
									value={item.value}
								>
									{item.label}
								</option>
							))}
						</select>
					</div>

					<div>
						<label style={labelStyle}>Mit Telegram parallel senden</label>
						<select
							style={inputStyle}
							value={config.sendTelegramWithPager ? 'true' : 'false'}
							onChange={e => update('sendTelegramWithPager', e.target.value === 'true')}
						>
							<option value="false">Nein</option>
							<option value="true">Ja</option>
						</select>
					</div>
				</div>

				<div style={{ marginTop: 20 }}>
					<button
						onClick={testCredentialsAndSave}
						disabled={isTestingCredentials}
						style={smallButtonStyle}
					>
						{isTestingCredentials ? 'Prüft ...' : 'Zugangsdaten testen und speichern'}
					</button>
				</div>
			</>
		);
	}

	function renderPagersTab(): React.JSX.Element {
		return (
			<>
				<div style={sectionTitleStyle}>Pager / Empfänger</div>

				<div style={{ marginBottom: 10, fontWeight: 'bold' }}>Eskalations-Reihenfolge:</div>

				<div style={{ marginBottom: 20 }}>
					{sortPagers(config.pagers)
						.map(p => `${p.alias || p.identifier || 'unbenannt'} (Stufe ${p.escalationLevel})`)
						.join(' → ') || 'keine Pager konfiguriert'}
				</div>

				<div style={{ marginBottom: 16 }}>
					<button
						onClick={addPager}
						style={smallButtonStyle}
					>
						+ Pager hinzufügen
					</button>
				</div>

				{sortPagers(config.pagers).map((pager, index) => (
					<div
						key={pager.id}
						style={cardStyle}
					>
						<h3 style={{ marginTop: 0 }}>
							Pager {index + 1} (Stufe {pager.escalationLevel})
						</h3>

						<div style={rowStyle}>
							<div>
								<label style={labelStyle}>Alias / Name</label>
								<input
									style={inputStyle}
									value={pager.alias}
									onChange={e => updatePager(pager.id, 'alias', e.target.value)}
								/>
							</div>

							<div>
								<label style={labelStyle}>Service</label>
								<select
									style={inputStyle}
									value={pager.service}
									onChange={e => updatePager(pager.id, 'service', e.target.value as PagerService)}
								>
									<option value="2wayS">2wayS</option>
									<option value="eCityruf">eCityruf</option>
									<option value="eBos">eBos</option>
								</select>
							</div>
						</div>

						<div style={rowStyle}>
							<div>
								<label style={labelStyle}>Identifier / Pager-ID</label>
								<input
									style={inputStyle}
									value={pager.identifier}
									onChange={e => updatePager(pager.id, 'identifier', e.target.value)}
								/>
							</div>

							<div>
								<label style={labelStyle}>Eskalationsstufe</label>
								<input
									type="number"
									style={inputStyle}
									value={pager.escalationLevel}
									onChange={e => updatePager(pager.id, 'escalationLevel', Number(e.target.value))}
								/>
							</div>
						</div>

						<div style={rowStyle}>
							<div>
								<label style={labelStyle}>Aktiv</label>
								<select
									style={inputStyle}
									value={pager.enabled ? 'true' : 'false'}
									onChange={e => updatePager(pager.id, 'enabled', e.target.value === 'true')}
								>
									<option value="true">Ja</option>
									<option value="false">Nein</option>
								</select>
							</div>

							<div style={{ display: 'flex', alignItems: 'end' }}>
								<button
									onClick={() => deletePager(pager.id)}
									style={smallButtonStyle}
								>
									Pager löschen
								</button>
							</div>
						</div>
					</div>
				))}
			</>
		);
	}

	function renderResponsesTab(): React.JSX.Element {
		return (
			<>
				<div style={sectionTitleStyle}>Antwortcodes</div>

				<div style={{ marginBottom: 16 }}>
					<button
						onClick={addResponseCode}
						style={smallButtonStyle}
					>
						+ Antwortcode hinzufügen
					</button>
				</div>

				{sortResponseCodes(config.responseCodes).map((item, index) => (
					<div
						key={item.id}
						style={cardStyle}
					>
						<h3 style={{ marginTop: 0 }}>Antwortcode {index + 1}</h3>

						<div style={rowStyle}>
							<div>
								<label style={labelStyle}>Bezeichnung</label>
								<input
									style={inputStyle}
									value={item.label}
									onChange={e => updateResponseCode(item.id, 'label', e.target.value)}
								/>
							</div>

							<div>
								<label style={labelStyle}>Code</label>
								<input
									type="number"
									style={inputStyle}
									value={item.code}
									onChange={e => updateResponseCode(item.id, 'code', Number(e.target.value))}
								/>
							</div>
						</div>

						<div style={rowStyle}>
							<div>
								<label style={labelStyle}>Aktion bei diesem Antwortcode</label>
								<div style={{ paddingTop: 6 }}>
									<div style={{ marginBottom: 8 }}>
										<label>
											<input
												type="checkbox"
												checked={item.endAlarm}
												onChange={e =>
													updateResponseCode(item.id, 'endAlarm', e.target.checked)
												}
												style={{ marginRight: 8 }}
											/>
											Sendevorgang beenden
										</label>
									</div>
									<div style={{ marginBottom: 8 }}>
										<label>
											<input
												type="checkbox"
												checked={item.triggerNextPager}
												onChange={e =>
													updateResponseCode(item.id, 'triggerNextPager', e.target.checked)
												}
												style={{ marginRight: 8 }}
											/>
											Nächsten Pager auslösen
										</label>
									</div>
									<div style={{ marginBottom: 8 }}>
										<label>
											<input
												type="checkbox"
												checked={item.setOutput}
												onChange={e =>
													updateResponseCode(item.id, 'setOutput', e.target.checked)
												}
												style={{ marginRight: 8 }}
											/>
											Ausgang / Folgeaktion auslösen
										</label>
									</div>
									<div style={{ marginBottom: 8 }}>
										<label>
											<input
												type="checkbox"
												checked={item.writeAckValue}
												onChange={e =>
													updateResponseCode(item.id, 'writeAckValue', e.target.checked)
												}
												style={{ marginRight: 8 }}
											/>
											Quittierwert in Datenpunkt schreiben
										</label>
									</div>
								</div>
							</div>

							<div>
								<label style={labelStyle}>Quittierwert</label>
								<input
									type="number"
									style={inputStyle}
									value={item.ackValue}
									onChange={e => updateResponseCode(item.id, 'ackValue', Number(e.target.value))}
								/>
								<div style={hintStyle}>
									Dieser Wert wird bei einer Antwort in den Datenpunkt geschrieben.
								</div>
							</div>
						</div>

						<div style={rowStyle}>
							<div>
								<label style={labelStyle}>Zieldatenpunkt</label>
								<div style={{ display: 'flex', gap: 8, alignItems: 'end' }}>
									<input
										style={inputStyle}
										value={item.outputStateId}
										onChange={e => updateResponseCode(item.id, 'outputStateId', e.target.value)}
									/>
									<button
										onClick={() =>
											openObjectPicker(
												{ type: 'responseOutput', id: item.id },
												item.outputStateId,
											)
										}
										style={smallButtonStyle}
									>
										Auswählen
									</button>
								</div>
								<div style={hintStyle}>
									Dieser Datenpunkt wird beschrieben, wenn „Ausgang / Folgeaktion auslösen“ aktiv ist.
								</div>
							</div>

							<div>
								<label style={labelStyle}>Wert</label>
								<input
									style={inputStyle}
									value={item.outputValue}
									onChange={e => updateResponseCode(item.id, 'outputValue', e.target.value)}
								/>
								<div style={hintStyle}>Erlaubt sind z. B. true, false, 1, 12 oder Text.</div>
							</div>
						</div>

						<div>
							<button
								onClick={() => deleteResponseCode(item.id)}
								style={smallButtonStyle}
							>
								Antwortcode löschen
							</button>
						</div>
					</div>
				))}
			</>
		);
	}

	function renderTriggersTab(): React.JSX.Element {
		return (
			<>
				<div style={sectionTitleStyle}>Auslöser / States</div>

				<div style={{ marginBottom: 16 }}>
					<button
						onClick={addTriggerState}
						style={smallButtonStyle}
					>
						+ State-Auslöser hinzufügen
					</button>
				</div>

				{config.triggerStates.map((item, index) => (
					<div
						key={item.id}
						style={cardStyle}
					>
						<h3 style={{ marginTop: 0 }}>Auslöser {index + 1}</h3>

						<div style={rowStyle}>
							<div>
								<label style={labelStyle}>State-ID</label>
								<div style={{ display: 'flex', gap: 8, alignItems: 'end' }}>
									<input
										style={inputStyle}
										value={item.stateId}
										onChange={e => updateTriggerState(item.id, 'stateId', e.target.value)}
									/>
									<button
										onClick={() => openObjectPicker({ type: 'trigger', id: item.id }, item.stateId)}
										style={smallButtonStyle}
									>
										Auswählen
									</button>
								</div>
							</div>

							<div>
								<label style={labelStyle}>Aktiv</label>
								<select
									style={inputStyle}
									value={item.enabled ? 'true' : 'false'}
									onChange={e => updateTriggerState(item.id, 'enabled', e.target.value === 'true')}
								>
									<option value="true">Ja</option>
									<option value="false">Nein</option>
								</select>
							</div>
						</div>

						<div style={rowStyle}>
							<div>
								<label style={labelStyle}>Bedingung</label>
								<select
									style={inputStyle}
									value={item.condition}
									onChange={e =>
										updateTriggerState(item.id, 'condition', e.target.value as TriggerCondition)
									}
								>
									<option value="true">true</option>
									<option value="false">false</option>
									<option value="=">Wert =</option>
									<option value=">">Wert &gt;</option>
									<option value="<">Wert &lt;</option>
								</select>
							</div>

							<div>
								<label style={labelStyle}>Vergleichswert</label>
								<input
									style={inputStyle}
									value={item.compareValue}
									onChange={e => updateTriggerState(item.id, 'compareValue', e.target.value)}
									disabled={item.condition === 'true' || item.condition === 'false'}
								/>
							</div>
						</div>

						<div style={{ marginBottom: 16 }}>
							<label style={labelStyle}>Nachrichtentext</label>
							<textarea
								style={{ ...inputStyle, minHeight: 90, border: '1px solid #bdbdbd' }}
								value={item.messageText}
								onChange={e => updateTriggerState(item.id, 'messageText', e.target.value)}
							/>
						</div>

						<div>
							<button
								onClick={() => deleteTriggerState(item.id)}
								style={smallButtonStyle}
							>
								Auslöser löschen
							</button>
						</div>
					</div>
				))}
			</>
		);
	}

	function renderTimingTab(): React.JSX.Element {
		return (
			<>
				<div style={sectionTitleStyle}>Test & Zeiten</div>

				<div style={cardStyle}>
					<h3 style={{ marginTop: 0 }}>Zeiten</h3>

					<div style={rowStyle}>
						<div>
							<label style={labelStyle}>Polling Interval (sec)</label>
							<input
								type="number"
								style={inputStyle}
								value={config.pollIntervalSec}
								onChange={e => update('pollIntervalSec', Number(e.target.value))}
							/>
							<div style={hintStyle}>
								Intervall für die Statusabfrage bei Diensten mit Rückmeldung, z. B. 2wayS oder eBos.
							</div>
						</div>

						<div>
							<label style={labelStyle}>Queue Delay (sec)</label>
							<input
								type="number"
								style={inputStyle}
								value={config.queueDelaySec}
								onChange={e => update('queueDelaySec', Number(e.target.value))}
							/>
							<div style={hintStyle}>
								Kurze Verzögerung zwischen internen Verarbeitungsschritten oder mehreren Auslösungen.
							</div>
						</div>
					</div>

					<div style={rowStyle}>
						<div>
							<label style={labelStyle}>Default Response Timeout (sec)</label>
							<input
								type="number"
								style={inputStyle}
								value={config.defaultResponseTimeoutSec}
								onChange={e => update('defaultResponseTimeoutSec', Number(e.target.value))}
							/>
							<div style={hintStyle}>
								So lange wird auf eine Rückmeldung gewartet, bevor der nächste Pager ausgelöst wird.
							</div>
						</div>

						<div>
							<label style={labelStyle}>Quittierwert Rücksetzen nach X Sekunden</label>
							<input
								type="number"
								style={inputStyle}
								value={config.ackResetDelaySec}
								onChange={e => update('ackResetDelaySec', Number(e.target.value))}
							/>
							<div style={hintStyle}>Der Quittierwert wird nach dieser Zeit wieder auf 0 gesetzt.</div>
						</div>
					</div>

					<div style={rowStyle}>
						<div>
							<label style={labelStyle}>Ausgang / Folgeaktion zurücksetzen nach X Sekunden</label>
							<input
								type="number"
								style={inputStyle}
								value={config.outputResetDelaySec}
								onChange={e => update('outputResetDelaySec', Number(e.target.value))}
							/>
							<div style={hintStyle}>
								Wenn ein Antwortcode „Ausgang / Folgeaktion auslösen“ verwendet, wird der Zieldatenpunkt
								nach dieser Zeit automatisch zurückgesetzt. Boolean wird auf false, Zahlen auf 0 und
								Text auf leer gesetzt.
							</div>
						</div>

						<div />
					</div>
				</div>

				<div style={cardStyle}>
					<h3 style={{ marginTop: 0 }}>Testversand</h3>

					<div style={rowStyle}>
						<div>
							<label style={labelStyle}>Service</label>
							<select
								style={inputStyle}
								value={config.testRecipientService}
								onChange={e => update('testRecipientService', e.target.value as PagerService)}
							>
								<option value="2wayS">2wayS</option>
								<option value="eCityruf">eCityruf</option>
								<option value="eBos">eBos</option>
							</select>
						</div>

						<div>
							<label style={labelStyle}>Pager-ID</label>
							<input
								style={inputStyle}
								value={config.testRecipientIdentifier}
								onChange={e => update('testRecipientIdentifier', e.target.value)}
							/>
						</div>
					</div>

					<div style={{ marginBottom: 16 }}>
						<label style={labelStyle}>Testnachricht</label>
						<textarea
							style={{ ...inputStyle, minHeight: 100, border: '1px solid #bdbdbd' }}
							value={config.testMessage}
							onChange={e => update('testMessage', e.target.value)}
						/>
					</div>

					<div>
						<button
							onClick={sendTestMessage}
							disabled={isSendingTestMessage}
							style={smallButtonStyle}
						>
							{isSendingTestMessage ? 'Sendet ...' : 'Test senden'}
						</button>
					</div>
				</div>
			</>
		);
	}

	return (
		<div style={pageStyle}>
			<div style={contentStyle}>
				<h1 style={{ marginTop: 0 }}>AlarmManager</h1>
				<div style={statusStyle}>{status}</div>
			</div>

			<div style={tabBarStyle}>
				<button
					style={tabButtonStyle('general')}
					onClick={() => setActiveTab('general')}
				>
					Allgemeine Einstellungen
				</button>
				<button
					style={tabButtonStyle('pagers')}
					onClick={() => setActiveTab('pagers')}
				>
					Pager
				</button>
				<button
					style={tabButtonStyle('responses')}
					onClick={() => setActiveTab('responses')}
				>
					Antwortcodes
				</button>
				<button
					style={tabButtonStyle('triggers')}
					onClick={() => setActiveTab('triggers')}
				>
					Auslöser / States
				</button>
				<button
					style={tabButtonStyle('timing')}
					onClick={() => setActiveTab('timing')}
				>
					Test & Zeiten
				</button>
			</div>

			<div style={contentStyle}>
				{activeTab === 'general' && renderGeneralTab()}
				{activeTab === 'pagers' && renderPagersTab()}
				{activeTab === 'responses' && renderResponsesTab()}
				{activeTab === 'triggers' && renderTriggersTab()}
				{activeTab === 'timing' && renderTimingTab()}
			</div>

			{showObjectPicker ? (
				<SelectID
					socket={adminConnection}
					themeType="light"
					imagePrefix="../.."
					selected={currentSelectedId}
					types={['state']}
					onClose={() => {
						setShowObjectPicker(false);
						setObjectPickerTarget(null);
						setCurrentSelectedId('');
					}}
					onOk={(selected: string | string[] | undefined) => applySelectedObjectId(selected)}
				/>
			) : null}

			<div style={footerStyle}>
				<div>
					<button
						onClick={() => save(false)}
						disabled={isSaving}
						style={footerButtonStyle}
					>
						{isSaving ? 'Speichert ...' : 'Speichern'}
					</button>
					<button
						onClick={() => save(true)}
						disabled={isSaving}
						style={footerButtonStyle}
					>
						Speichern und schließen
					</button>
				</div>

				<div>
					<button
						onClick={closeWindow}
						style={footerButtonStyle}
					>
						Schließen
					</button>
				</div>
			</div>
		</div>
	);
}
