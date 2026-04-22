import type { EarthquakeNotifyConfig } from "@/types/earthquake";
import { createDefaultEarthquakeNotifyConfig } from "@/types/earthquake";
import { readJsonData, writeJsonData } from "@/utils/jsonFileStore";

const CONFIG_FILE_NAME = "earthquakeNotify.json";

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null;

const normalizeChannels = (value: unknown): Record<string, string> => {
	if (!isRecord(value)) {
		return {};
	}

	const entries = Object.entries(value).filter(
		(entry): entry is [string, string] => typeof entry[1] === "string",
	);

	return Object.fromEntries(entries);
};

const normalizeConfig = (raw: unknown): EarthquakeNotifyConfig => {
	if (!isRecord(raw)) {
		return createDefaultEarthquakeNotifyConfig();
	}

	return {
		channels: normalizeChannels(raw.channels),
		lastEventKey: typeof raw.lastEventKey === "string" ? raw.lastEventKey : null,
	};
};

export const readEarthquakeConfig = async (): Promise<EarthquakeNotifyConfig> => {
	const fallback = createDefaultEarthquakeNotifyConfig();
	const raw = await readJsonData<unknown>(CONFIG_FILE_NAME, fallback);
	return normalizeConfig(raw);
};

export const writeEarthquakeConfig = async (config: EarthquakeNotifyConfig) => {
	await writeJsonData(CONFIG_FILE_NAME, config);
};
