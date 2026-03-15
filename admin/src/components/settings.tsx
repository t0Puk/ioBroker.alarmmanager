import React from 'react';
import { withStyles } from '@material-ui/core/styles';
import type { CreateCSSProperties } from '@material-ui/core/styles/withStyles';
import TextField from '@material-ui/core/TextField';
import I18n from '@iobroker/adapter-react/i18n';

const styles = (): Record<string, CreateCSSProperties> => ({
	input: {
		marginTop: 10,
		minWidth: 400,
	},
});

interface SettingsProps {
	classes: Record<string, string>;
	native: Record<string, any>;
	onChange: (attr: string, value: any) => void;
}

class Settings extends React.Component<SettingsProps> {
	renderInput(title: string, attr: string, type: string = 'text') {
		return (
			<TextField
				label={title}
				className={this.props.classes.input}
				value={this.props.native[attr] || ''}
				type={type}
				onChange={e => this.props.onChange(attr, e.target.value)}
				fullWidth
			/>
		);
	}

	render() {
		return (
			<div>
				<h2>e*Message API</h2>

				{this.renderInput('API User ID', 'apiUserId')}
				{this.renderInput('API Password', 'apiPassword', 'password')}
				{this.renderInput('Sender Address', 'senderAddress')}
				{this.renderInput('Telegram Instance', 'telegramInstance')}

				<h2>Timing</h2>

				{this.renderInput('Polling Interval (sec)', 'pollIntervalSec', 'number')}
				{this.renderInput('Queue Delay (sec)', 'queueDelaySec', 'number')}
				{this.renderInput('Response Timeout (sec)', 'defaultResponseTimeoutSec', 'number')}

				<h2>Test Message</h2>

				{this.renderInput('Test Recipient Service', 'testRecipientService')}
				{this.renderInput('Test Recipient Identifier', 'testRecipientIdentifier')}
			</div>
		);
	}
}

export default withStyles(styles)(Settings);
