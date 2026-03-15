import type { native } from '../../io-package.json';

type AlarmmanagerNativeConfig = typeof native;

declare global {
	namespace ioBroker {
		interface AdapterConfig extends AlarmmanagerNativeConfig {}
	}
}

export {};
