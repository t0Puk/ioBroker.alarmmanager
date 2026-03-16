import React, { useEffect, useState } from 'react';

declare const window: any;

export default function App(): React.JSX.Element {
	const [config, setConfig] = useState<any>({});

	useEffect(() => {
		window.socket.emit('getObject', 'system.adapter.alarmmanager.0', (obj: any) => {
			if (obj?.native) {
				setConfig(obj.native);
			}
		});
	}, []);

	function update(key: string, value: any): void {
		const newConfig = { ...config, [key]: value };
		setConfig(newConfig);

		window.socket.emit('getObject', 'system.adapter.alarmmanager.0', (obj: any) => {
			obj.native = newConfig;
			window.socket.emit('setObject', obj._id, obj);
		});
	}

	return (
		<div style={{ background: '#fff', margin: 20, padding: 24, borderRadius: 8 }}>
			<h1>AlarmManager</h1>

			<label>
				<div>API User ID</div>
				<input
					value={config.apiUserId || ''}
					onChange={e => update('apiUserId', e.target.value)}
				/>
			</label>

			<label>
				<div>API Password</div>
				<input
					type="password"
					value={config.apiPassword || ''}
					onChange={e => update('apiPassword', e.target.value)}
				/>
			</label>

			<label>
				<div>Sender Address</div>
				<input
					value={config.senderAddress || ''}
					onChange={e => update('senderAddress', e.target.value)}
				/>
			</label>

			<label>
				<div>Telegram Instance</div>
				<input
					value={config.telegramInstance || ''}
					onChange={e => update('telegramInstance', e.target.value)}
				/>
			</label>
		</div>
	);
}
