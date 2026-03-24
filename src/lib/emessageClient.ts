import axios, { AxiosError, AxiosInstance } from 'axios';

export type EMessageServiceName = '2wayS' | 'eCityruf' | 'eBos';

export interface EMessageRecipient {
	serviceName: EMessageServiceName;
	identifier: string;
}

export interface EMessageSendResult {
	trackingId?: string;
	raw: any;
}

export interface EMessageStatusEntry {
	answer?: string;
	answerNo?: string | number;
	devices?: Array<{
		deviceName?: string;
		deviceSerial?: string;
	}>;
}

export interface EMessageRecipientStatus {
	externalRecipient?: string;
	identifier?: string;
	service?: string;
	numberOfRecipients?: string;
	status?: EMessageStatusEntry[];
}

export interface EMessageStatusResult {
	messageContent?: string;
	recipients: EMessageRecipientStatus[];
	raw: any;
}

interface EMessageClientOptions {
	username: string;
	password: string;
}

function formatAxiosError(error: unknown): string {
	if (axios.isAxiosError(error)) {
		const axiosError = error as AxiosError<any>;
		const method = axiosError.config?.method?.toUpperCase() || 'UNKNOWN';
		const baseURL = axiosError.config?.baseURL || '';
		const url = axiosError.config?.url || '';
		const fullUrl = `${baseURL}${url}`;
		const status = axiosError.response?.status;
		const responseData = axiosError.response?.data;

		return [
			'HTTP-Fehler bei e*Message',
			`Methode: ${method}`,
			`URL: ${fullUrl}`,
			`Status: ${status ?? 'unbekannt'}`,
			`Antwort: ${JSON.stringify(responseData)}`,
		].join(' | ');
	}

	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
}

export class EMessageClient {
	private readonly username: string;
	private readonly password: string;
	private jwt: string | null = null;

	private readonly authHttp: AxiosInstance;
	private readonly rsHttp: AxiosInstance;

	public constructor(options: EMessageClientOptions) {
		this.username = options.username;
		this.password = options.password;

		this.authHttp = axios.create({
			baseURL: 'https://api.emessage.de/auth',
			timeout: 15000,
		});

		this.rsHttp = axios.create({
			baseURL: 'https://api.emessage.de/rs',
			timeout: 15000,
		});
	}

	public async login(): Promise<string> {
		try {
			const response = await this.authHttp.post(
				'/login',
				{
					username: this.username,
					password: this.password,
				},
				{
					headers: {
						Authorization: 'Basic Og==',
						'Content-Type': 'application/json',
					},
				},
			);

			const jwt = response?.data?.data?.jwt;
			if (!jwt) {
				throw new Error(`Kein JWT von e*Message erhalten. Antwort: ${JSON.stringify(response?.data)}`);
			}

			this.jwt = jwt;
			return jwt;
		} catch (error) {
			throw new Error(formatAxiosError(error));
		}
	}

	private async ensureJwt(): Promise<string> {
		if (this.jwt) {
			return this.jwt;
		}

		return this.login();
	}

	public async sendMessage(messageText: string, recipients: EMessageRecipient[]): Promise<EMessageSendResult> {
		try {
			const jwt = await this.ensureJwt();

			const response = await this.rsHttp.post(
				'/eSendMessages',
				{
					messageText,
					recipients,
				},
				{
					headers: {
						Authorization: `Bearer ${jwt}`,
						'Content-Type': 'application/json',
					},
				},
			);

			return {
				trackingId: response?.data?.data?.trackingId,
				raw: response?.data,
			};
		} catch (error) {
			throw new Error(formatAxiosError(error));
		}
	}

	public async getMessageStatus(trackingId: string): Promise<EMessageStatusResult> {
		if (!trackingId) {
			throw new Error('trackingId fehlt');
		}

		try {
			const jwt = await this.ensureJwt();

			const response = await this.rsHttp.get(`/eGetMessages/External/${encodeURIComponent(trackingId)}`, {
				headers: {
					Authorization: `Bearer ${jwt}`,
				},
			});

			return {
				messageContent: response?.data?.data?.messageContent,
				recipients: Array.isArray(response?.data?.data?.recipients) ? response.data.data.recipients : [],
				raw: response?.data,
			};
		} catch (error) {
			throw new Error(formatAxiosError(error));
		}
	}
}
