import React from 'react';
import { withStyles } from '@material-ui/core/styles';
import type { CreateCSSProperties } from '@material-ui/core/styles/withStyles';
import TextField from '@material-ui/core/TextField';
import MenuItem from '@material-ui/core/MenuItem';

const styles = (): Record<string, CreateCSSProperties> => ({
	root: {
		background: '#ffffff',
		color: '#000000',
		padding: 24,
		margin: 16,
		borderRadius: 8,
		minHeight: 400,
	},
	title: {
		fontSize: 28,
		fontWeight: 'bold',
		marginBottom: 16,
		color: '#000000',
	},
	subTitle: {
		fontSize: 20,
		fontWeight: 'bold',
		marginTop: 24,
		marginBottom: 12,
		color: '#000000',
	},
	input: {
		display: 'block',
		marginBottom: 16,
		minWidth: 400,
		background: '#ffffff',
	},
	debugBox: {
		background: '#ffdddd',
		color: '#990000',
		padding: 12,
		marginBottom: 16,
		border: '1px solid #cc0000',
		fontWeight: 'bold',
	},
});

interface SettingsProps {
	classes: Record<string, string>;
	native: Record<string, any>;
	onChange: (attr: string, value: any) => void;
}

class Settings extends React.Component<SettingsProps> {
	private renderInput(label: string, attr: string, type: string = 'text'): React.JSX.Element {
		return (
			<TextField
				label={label}
				className={this.props.classes.input}
				variant="outlined"
				value={this.props.native[attr] ?? ''}
				type={type}
				onChange={e => this.props.onChange(attr, e.target.value)}
			/>
		);
	}

	render(): React.JSX.Element {
		return (
			<div className={this.props.classes.root}>
				<div className={this.props.classes.debugBox}>AlarmManager Admin UI geladen</div>

				<div className={this.props.classes.title}>AlarmManager</div>

				<div className={this.props.classes.subTitle}>e*Message API</div>

				{this.renderInput('API User ID', 'apiUserId')}
				{this.renderInput('API Password', 'apiPassword', 'password')}
				{this.renderInput('Sender Address', 'senderAddress')}
				{this.renderInput('Telegram Instance', 'telegramInstance')}

				<div className={this.props.classes.subTitle}>Timing</div>

				{this.renderInput('Polling Interval (sec)', 'pollIntervalSec', 'number')}
				{this.renderInput('Queue Delay (sec)', 'queueDelaySec', 'number')}
				{this.renderInput('Response Timeout (sec)', 'defaultResponseTimeoutSec', 'number')}

				<div className={this.props.classes.subTitle}>Test Recipient</div>

				<TextField
					select
					label="Service"
					variant="outlined"
					className={this.props.classes.input}
					value={this.props.native.testRecipientService ?? '2wayS'}
					onChange={e => this.props.onChange('testRecipientService', e.target.value)}
				>
					<MenuItem value="2wayS">2wayS</MenuItem>
					<MenuItem value="eCityruf">eCityruf</MenuItem>
					<MenuItem value="eBos">eBos</MenuItem>
				</TextField>

				{this.renderInput('Recipient Identifier', 'testRecipientIdentifier')}
			</div>
		);
	}
}

export default withStyles(styles)(Settings);
