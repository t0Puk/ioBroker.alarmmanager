export interface EMessageRecipient {
	serviceName: 'eCityruf' | 'eBos' | '2wayS';
	identifier: string;
}

export interface EMessageSendPayload {
	test: boolean;
	senderAddress: string;
	message: string;
	recipients: EMessageRecipient[];
}

export interface EMessageLoginResponse {
	access_token: string;
	token_type?: string;
	expires_in?: number;
}

export class EMessageClient {
	private readonly baseUrl: string;
	private token: string | null = null;

	constructor(baseUrl: string) {
		this.baseUrl = baseUrl.replace(/\/+$/, '');
	}

	public async login(userId: string, password: string): Promise<string> {
		const response = await fetch(`${this.baseUrl}/auth/login`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				userId,
				password,
			}),
		});

		if (!response.ok) {
			const text = await response.text();
			throw new Error(`Login fehlgeschlagen (${response.status}): ${text}`);
		}

		const data = (await response.json()) as EMessageLoginResponse;

		if (!data.access_token) {
			throw new Error('Kein access_token erhalten');
		}

		this.token = data.access_token;
		return data.access_token;
	}

	public async sendMessage(payload: EMessageSendPayload): Promise<any> {
		if (!this.token) {
			throw new Error('Kein Token vorhanden. Bitte zuerst einloggen.');
		}

		const response = await fetch(`${this.baseUrl}/api/eSendMessages`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${this.token}`,
			},
			body: JSON.stringify(payload),
		});

		if (!response.ok) {
			const text = await response.text();
			throw new Error(`Sendefehler (${response.status}): ${text}`);
		}

		return response.json();
	}
}
