import React from 'react';
import ReactDOM from 'react-dom';
import { MuiThemeProvider } from '@material-ui/core/styles';

import App from './app';
import Utils from '@iobroker/adapter-react/Components/Utils';
import theme from '@iobroker/adapter-react/Theme';

let themeName = Utils.getThemeName();

function build(): void {
	ReactDOM.render(
		<MuiThemeProvider theme={theme(themeName)}>
			<App
				adapterName="alarmmanager"
				socket={(window as any).socket}
				onThemeChange={(themeNameNew: string) => {
					themeName = themeNameNew;
					build();
				}}
			/>
		</MuiThemeProvider>,
		document.getElementById('root'),
	);
}

build();
