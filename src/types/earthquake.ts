export type EarthquakeNotifyConfig = {
	channels: Record<string, string>;
	lastEventKey: string | null;
};

export const createDefaultEarthquakeNotifyConfig =
	(): EarthquakeNotifyConfig => ({
		channels: {},
		lastEventKey: null,
	});
