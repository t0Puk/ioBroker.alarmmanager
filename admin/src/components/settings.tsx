import React from 'react';
import { withStyles } from '@material-ui/core/styles';
import type { CreateCSSProperties } from '@material-ui/core/styles/withStyles';
import TextField from '@material-ui/core/TextField';
import Input from '@material-ui/core/Input';
import FormHelperText from '@material-ui/core/FormHelperText';
import FormControl from '@material-ui/core/FormControl';
import Select from '@material-ui/core/Select';
import MenuItem from '@material-ui/core/MenuItem';
import Typography from '@material-ui/core/Typography';
import Paper from '@material-ui/core/Paper';
import Divider from '@material-ui/core/Divider';
import I18n from '@iobroker/adapter-react/i18n';

const styles = (): Record<string, CreateCSSProperties> => ({
	root: {
		padding: 20,
	},
	section: {
		padding: 20,
		marginBottom: 20,
	},
	input: {
		marginTop: 0,
		minWidth: 320,
		width: '100%',
	},
	controlElement: {
		marginBottom: 15,
	},
	row: {
		display: 'flex',
		flexWrap: 'wrap',
		gap: 20,
	},
	column: {
		flex: '1 1 320px',
		minWidth: 320,
	},
	headline: {
		marginBottom: 10,
		fontWeight: 'bold',
	},
	subline: {
		marginBottom: 20,
		opacity: 0.8,
	},
});

interface SettingsProps {
	classes: Record<string, string>;
	native: Record<string, any>;
	onChange: (attr: string, value: any) => void;
}

class Settings extends React.Component<SettingsProps> {
	private renderInput(title: AdminWord, attr: string, type: string = 'text'): React.JSX.Element {
		return (
			<TextField
				label={I18n.t(title)}
				className={`${this.props.classes.input} ${this.props.classes.controlElement}`}
				value={this.props.native[attr] ?? ''}
				type={type}
				onChange={e => this.props.onChange(attr, e.target.value)}
				margin="normal"
				variant="standard"
			/>
		);
	}

	private renderNumberInput(title: AdminWord, attr: string): React.JSX.Element {
		return (
			<TextField
				label={I18n.t(title)}
				className={`${this.props.classes.input} ${this.props.classes.controlElement}`}
				value={this.props.native[attr] ?? ''}
				type="number"
				onChange={e => this.props.onChange(attr, Number(e.target.value))}
				margin="normal"
				variant="standard"
			/>
		);
	}

	private renderSelect(
		title: AdminWord,
		attr: string,
		options: { value: string; title: AdminWord }[],
	): React.JSX.Element {
		return (
			<FormControl className={`${this.props.classes.input} ${this.props.classes.controlElement}`}>
				<Select
					value={this.props.native[attr] || ''}
					onChange={e => this.props.onChange(attr, e.target.value)}
					input={
						<Input
							name={attr}
							id={`${attr}-helper`}
						/>
					}
				>
					{options.map(item => (
						<MenuItem
							key={`key-${item.value}`}
							value={item.value}
						>
							{I18n.t(item.title)}
						</MenuItem>
					))}
				</Select>
				<FormHelperText>{I18n.t(title)}</FormHelperText>
			</FormControl>
		);
	}

	render(): React.JSX.Element {
		return (
			<div className={this.props.classes.root}>
				<Paper className={this.props.classes.section}>
					<Typography
						variant="h5"
						className={this.props.classes.headline}
					>
						{I18n.t('eMessage API')}
					</Typography>
					<Typography
						variant="body2"
						className={this.props.classes.subline}
					>
						{I18n.t('Configure access to the e*Message API and general adapter behavior.')}
					</Typography>

					<div className={this.props.classes.row}>
						<div className={this.props.classes.column}>{this.renderInput('API User ID', 'apiUserId')}</div>
						<div className={this.props.classes.column}>
							{this.renderInput('API Password', 'apiPassword', 'password')}
						</div>
					</div>

					<div className={this.props.classes.row}>
						<div className={this.props.classes.column}>
							{this.renderInput('Sender Address', 'senderAddress')}
						</div>
						<div className={this.props.classes.column}>
							{this.renderInput('Telegram Instance', 'telegramInstance')}
						</div>
					</div>

					<div className={this.props.classes.row}>
						<div className={this.props.classes.column}>
							{this.renderNumberInput('Polling interval (seconds)', 'pollIntervalSec')}
						</div>
						<div className={this.props.classes.column}>
							{this.renderNumberInput('Queue delay (seconds)', 'queueDelaySec')}
						</div>
						<div className={this.props.classes.column}>
							{this.renderNumberInput('Default response timeout (seconds)', 'defaultResponseTimeoutSec')}
						</div>
					</div>
				</Paper>

				<Paper className={this.props.classes.section}>
					<Typography
						variant="h5"
						className={this.props.classes.headline}
					>
						{I18n.t('Test Recipient')}
					</Typography>
					<Typography
						variant="body2"
						className={this.props.classes.subline}
					>
						{I18n.t('These settings are used for the first login and send tests.')}
					</Typography>

					<div className={this.props.classes.row}>
						<div className={this.props.classes.column}>
							{this.renderSelect('Service', 'testRecipientService', [
								{ value: '2wayS', title: '2wayS' },
								{ value: 'eCityruf', title: 'eCityruf' },
								{ value: 'eBos', title: 'eBos' },
							])}
						</div>
						<div className={this.props.classes.column}>
							{this.renderInput('Recipient Identifier', 'testRecipientIdentifier')}
						</div>
					</div>
				</Paper>

				<Divider />

				<Paper className={this.props.classes.section}>
					<Typography
						variant="h6"
						className={this.props.classes.headline}
					>
						{I18n.t('Next step')}
					</Typography>
					<Typography variant="body2">
						{I18n.t(
							'In the next version this page will be extended with pager list, aliases, escalation levels and response code mapping.',
						)}
					</Typography>
				</Paper>
			</div>
		);
	}
}

export default withStyles(styles)(Settings);
