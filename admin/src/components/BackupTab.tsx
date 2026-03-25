import React from 'react';

export type BackupTabNative = {
	pollIntervalSec?: number;
	queueDelaySec?: number;
	defaultResponseTimeoutSec?: number;
	ackResetDelaySec?: number;
	outputResetDelaySec?: number;
	testRecipientService?: string;
	testRecipientIdentifier?: string;
	testMessage?: string;
	pagers?: any[];
	responseCodes?: any[];
	triggerStates?: any[];
	apiUserId?: string;
	apiPassword?: string;
};

export type AlarmmanagerBackupFile = {
	meta: {
		adapter: 'alarmmanager';
		version: number;
		createdAt: string;
	};
	data: {
		pollIntervalSec: number;
		queueDelaySec: number;
		defaultResponseTimeoutSec: number;
		ackResetDelaySec: number;
		outputResetDelaySec: number;
		testRecipientService: string;
		testRecipientIdentifier: string;
		testMessage: string;
		pagers: any[];
		responseCodes: any[];
		triggerStates: any[];
	};
};

type BackupTabProps = {
	native: BackupTabNative;
	onImport: (nativePatch: Partial<BackupTabNative>) => void;
};

function buildBackup(native: BackupTabNative): AlarmmanagerBackupFile {
	return {
		meta: {
			adapter: 'alarmmanager',
			version: 1,
			createdAt: new Date().toISOString(),
		},
		data: {
			pollIntervalSec: Number(native.pollIntervalSec ?? 30),
			queueDelaySec: Number(native.queueDelaySec ?? 10),
			defaultResponseTimeoutSec: Number(native.defaultResponseTimeoutSec ?? 120),
			ackResetDelaySec: Number(native.ackResetDelaySec ?? 60),
			outputResetDelaySec: Number(native.outputResetDelaySec ?? 0),
			testRecipientService: native.testRecipientService || '2wayS',
			testRecipientIdentifier: native.testRecipientIdentifier || '',
			testMessage: native.testMessage || '',
			pagers: Array.isArray(native.pagers) ? native.pagers : [],
			responseCodes: Array.isArray(native.responseCodes) ? native.responseCodes : [],
			triggerStates: Array.isArray(native.triggerStates) ? native.triggerStates : [],
		},
	};
}

function downloadJson(filename: string, data: unknown): void {
	const json = JSON.stringify(data, null, 2);
	const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
	const url = window.URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	link.click();
	window.URL.revokeObjectURL(url);
}

function parseBackup(text: string): Partial<BackupTabNative> {
	const parsed = JSON.parse(text) as AlarmmanagerBackupFile;

	if (!parsed || parsed.meta?.adapter !== 'alarmmanager' || !parsed.data) {
		throw new Error('Ungültige Backup-Datei');
	}

	return {
		pollIntervalSec: Number(parsed.data.pollIntervalSec ?? 30),
		queueDelaySec: Number(parsed.data.queueDelaySec ?? 10),
		defaultResponseTimeoutSec: Number(parsed.data.defaultResponseTimeoutSec ?? 120),
		ackResetDelaySec: Number(parsed.data.ackResetDelaySec ?? 60),
		outputResetDelaySec: Number(parsed.data.outputResetDelaySec ?? 0),
		testRecipientService: parsed.data.testRecipientService ?? '2wayS',
		testRecipientIdentifier: parsed.data.testRecipientIdentifier ?? '',
		testMessage: parsed.data.testMessage ?? '',
		pagers: Array.isArray(parsed.data.pagers) ? parsed.data.pagers : [],
		responseCodes: Array.isArray(parsed.data.responseCodes) ? parsed.data.responseCodes : [],
		triggerStates: Array.isArray(parsed.data.triggerStates) ? parsed.data.triggerStates : [],
	};
}

const sectionTitleStyle: React.CSSProperties = {
	fontSize: 20,
	fontWeight: 'bold',
	marginTop: 16,
	marginBottom: 16,
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

const hintStyle: React.CSSProperties = {
	fontSize: 12,
	color: '#666',
	marginTop: 6,
};

const BackupTab: React.FC<BackupTabProps> = ({ native, onImport }) => {
	const handleExport = (): void => {
		const backup = buildBackup(native);
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
		downloadJson(`alarmmanager-backup-${timestamp}.json`, backup);
	};

	const handleImportChange = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
		const file = event.target.files?.[0];
		event.target.value = '';

		if (!file) {
			return;
		}

		try {
			const text = await file.text();
			const importedNative = parseBackup(text);
			onImport(importedNative);
			window.alert(
				'Backup erfolgreich importiert. Bitte anschließend auf "Speichern" oder "Speichern und schließen" klicken.',
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			window.alert(`Backup-Import fehlgeschlagen: ${message}`);
		}
	};

	return (
		<>
			<div style={sectionTitleStyle}>Backup & Wiederherstellung</div>

			<div style={cardStyle}>
				<div style={{ marginBottom: 12 }}>
					Gesichert werden Pager, Antwortcodes, Trigger/Auslöser, Zeiten und Testversand-Einstellungen.
				</div>

				<div style={{ marginBottom: 20 }}>
					Zugangsdaten werden bewusst <strong>nicht</strong> exportiert.
				</div>

				<div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
					<button
						onClick={handleExport}
						style={smallButtonStyle}
					>
						Backup exportieren
					</button>

					<label style={{ display: 'inline-block' }}>
						<span
							style={{
								...smallButtonStyle,
								display: 'inline-block',
							}}
						>
							Backup importieren
						</span>
						<input
							hidden
							type="file"
							accept="application/json,.json"
							onChange={handleImportChange}
						/>
					</label>
				</div>

				<div style={hintStyle}>
					Nach dem Import bitte speichern, damit die übernommenen Werte dauerhaft im Adapter abgelegt werden.
				</div>
			</div>
		</>
	);
};

export default BackupTab;
