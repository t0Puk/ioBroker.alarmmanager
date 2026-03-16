import React from 'react';
import ReactDOM from 'react-dom';
import { MuiThemeProvider } from '@material-ui/core/styles';
import theme from '@iobroker/adapter-react/Theme';
import Utils from '@iobroker/adapter-react/Components/Utils';
import App from './app';

let themeName = Utils.getThemeName();

document.body.insertAdjacentHTML(
	'beforeend',
	'<div style="position:fixed;top:80px;left:20px;z-index:99999;background:#00c853;color:#000;padding:12px;font-size:22px;font-weight:bold;">INDEX.TSX GELADEN</div>',
);

console.log('AlarmManager admin index.tsx loaded');

function build(): void {
	ReactDOM.render(
		<MuiThemeProvider theme={theme(themeName)}>
			<App
				adapterName="alarmmanager"
				onThemeChange={_theme => {
					themeName = _theme;
					build();
				}}
			/>
		</MuiThemeProvider>,
		document.getElementById('root'),
	);
}

build();
