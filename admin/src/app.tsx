import React, { useEffect, useMemo, useState } from 'react';
import Connection from '@iobroker/adapter-react/Connection';

type Config = {
	apiUserId: string;
	apiPassword: string;
	senderAddress: string;
	pollIntervalSec: number;
	queueDelaySec: number;
	defaultResponseTimeoutSec: number;
	telegramInstance: string;
	testRecipientService: string;
	testRecipientIdentifier: string;
};

const DEFAULT_CONFIG: Config = {
	apiUserId: '',
	apiPassword: '',
	senderAddress: '',
	pollIntervalSec: 30,
	queueDelaySec: 10,
	defaultResponseTimeoutSec: 120,
	telegramInstance: '',
	testRecipientService: '2wayS',
	testRecipientIdentifier: '',
};

export default function App(): React.JSX.Element {
	const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);
	const [status, setStatus] = useState<string>('UI geladen');
	const [isSaving, setIsSaving] = useState<boolean>(false);

	const socket = useMemo(
		() =>
			new Connection({
				name: 'alarmmanager',
			}),
		[],
	);

	useEffect(() => {
		let active = true;

		(async (): Promise<void> => {
			try {
				setStatus('Lade Konfiguration ...');

				const obj = await socket.getObject('system.adapter.alarmmanager.0');

				if (!active) {
					return;
				}

				if (obj?.native) {
					setConfig({
						apiUserId: obj.native.apiUserId ?? '',
						apiPassword: obj.native.apiPassword ?? '',
						senderAddress: obj.native.senderAddress ?? '',
						pollIntervalSec: Number(obj.native.pollIntervalSec ?? 30),
						queueDelaySec: Number(obj.native.queueDelaySec ?? 10),
						defaultResponseTimeoutSec: Number(obj.native.defaultResponseTimeoutSec ?? 120),
						telegramInstance: obj.native.telegramInstance ?? '',
						testRecipientService: obj.native.testRecipientService ?? '2wayS',
						testRecipientIdentifier: obj.native.testRecipientIdentifier ?? '',
					});
					setStatus('Konfiguration geladen');
				} else {
					setStatus('Adapter-Objekt nicht gefunden');
				}
			} catch (error) {
				if (active) {
					setStatus(`Fehler beim Laden: ${String(error)}`);
				}
			}
		})();

		return () => {
			active = false;
		};
	}, [socket]);

	function update<K extends keyof Config>(key: K, value: Config[K]): void {
		setConfig(prev => ({ ...prev, [key]: value }));
	}

	async function save(): Promise<void> {
		try {
			setIsSaving(true);
			setStatus('Speichere Konfiguration ...');

			const obj = await socket.getObject('system.adapter.alarmmanager.0');

			if (!obj) {
				setStatus('Speichern fehlgeschlagen: Objekt nicht gefunden');
				setIsSaving(false);
				return;
			}

			obj.native = {
				...obj.native,
				...config,
			};

			await socket.setObject(obj._id, obj);

			setStatus('Konfiguration gespeichert');
			setIsSaving(false);
		} catch (error) {
			setIsSaving(false);
			setStatus(`Speichern fehlgeschlagen: ${String(error)}`);
		}
	}

	const pageStyle: React.CSSProperties = {
		background: '#ffffff',
		color: '#000000',
		margin: 20,
		padding: 24,
		borderRadius: 8,
		fontFamily: 'Arial, sans-serif',
		maxWidth: 1100,
	};

	const rowStyle: React.CSSProperties = {
		display: 'grid',
		gridTemplateColumns: '1fr 1fr',
		gap: 20,
		marginBottom: 16,
	};

	const labelStyle: React.CSSProperties = {
		display: 'block',
		marginBottom: 6,
		fontWeight: 600,
	};

	const inputStyle: React.CSSProperties = {
		width: '100%',
		padding: 10,
		fontSize: 15,
		boxSizing: 'border-box',
		border: '1px solid #bbb',
		borderRadius: 4,
	};

	const sectionTitleStyle: React.CSSProperties = {
		fontSize: 22,
		fontWeight: 'bold',
		marginTop: 24,
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

	return (
		<div style={pageStyle}>
			<h1 style={{ marginTop: 0 }}>AlarmManager</h1>

			<div style={statusStyle}>{status}</div>

			<div style={sectionTitleStyle}>e*Message API</div>

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
					<label style={labelStyle}>Sender Address</label>
					<input
						style={inputStyle}
						value={config.senderAddress}
						onChange={e => update('senderAddress', e.target.value)}
					/>
				</div>

				<div>
					<label style={labelStyle}>Telegram Instance</label>
					<input
						style={inputStyle}
						value={config.telegramInstance}
						onChange={e => update('telegramInstance', e.target.value)}
					/>
				</div>
			</div>

			<div style={sectionTitleStyle}>Timing</div>

			<div style={rowStyle}>
				<div>
					<label style={labelStyle}>Polling Interval (sec)</label>
					<input
						type="number"
						style={inputStyle}
						value={config.pollIntervalSec}
						onChange={e => update('pollIntervalSec', Number(e.target.value))}
					/>
				</div>

				<div>
					<label style={labelStyle}>Queue Delay (sec)</label>
					<input
						type="number"
						style={inputStyle}
						value={config.queueDelaySec}
						onChange={e => update('queueDelaySec', Number(e.target.value))}
					/>
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
				</div>
				<div />
			</div>

			<div style={sectionTitleStyle}>Test Recipient</div>

			<div style={rowStyle}>
				<div>
					<label style={labelStyle}>Service</label>
					<select
						style={inputStyle}
						value={config.testRecipientService}
						onChange={e => update('testRecipientService', e.target.value)}
					>
						<option value="2wayS">2wayS</option>
						<option value="eCityruf">eCityruf</option>
						<option value="eBos">eBos</option>
					</select>
				</div>

				<div>
					<label style={labelStyle}>Recipient Identifier</label>
					<input
						style={inputStyle}
						value={config.testRecipientIdentifier}
						onChange={e => update('testRecipientIdentifier', e.target.value)}
					/>
				</div>
			</div>

			<div style={{ marginTop: 30 }}>
				<button
					onClick={save}
					disabled={isSaving}
					style={{
						padding: '12px 20px',
						fontSize: 16,
						cursor: isSaving ? 'default' : 'pointer',
						borderRadius: 4,
						border: '1px solid #888',
					}}
				>
					{isSaving ? 'Speichert ...' : 'Speichern'}
				</button>
			</div>
		</div>
	);
}
