import React from 'react';

export default function App(): React.JSX.Element {
	return (
		<div
			style={{
				background: '#ffffff',
				color: '#000000',
				margin: 20,
				padding: 24,
				borderRadius: 8,
				fontFamily: 'Arial, sans-serif',
			}}
		>
			<h1 style={{ marginTop: 0 }}>AlarmManager</h1>
			<div
				style={{
					background: '#00c853',
					color: '#000',
					padding: 12,
					fontWeight: 'bold',
					marginBottom: 20,
				}}
			>
				MINIMAL REACT UI GELADEN
			</div>

			<div style={{ display: 'grid', gap: 12, maxWidth: 500 }}>
				<label>
					<div>API User ID</div>
					<input style={{ width: '100%', padding: 8 }} />
				</label>

				<label>
					<div>API Password</div>
					<input
						type="password"
						style={{ width: '100%', padding: 8 }}
					/>
				</label>

				<label>
					<div>Sender Address</div>
					<input style={{ width: '100%', padding: 8 }} />
				</label>

				<label>
					<div>Telegram Instance</div>
					<input style={{ width: '100%', padding: 8 }} />
				</label>
			</div>
		</div>
	);
}
