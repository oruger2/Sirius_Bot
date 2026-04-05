import type { WolfGameSession } from "./session";

type WolfgameRegistryStore = {
	sessionsByGuild: Map<string, WolfGameSession>;
	sessionsByGameId: Map<string, WolfGameSession>;
};

const registryBridge = globalThis as {
	__wolfgameRegistryStore?: WolfgameRegistryStore;
};

if (!registryBridge.__wolfgameRegistryStore) {
	registryBridge.__wolfgameRegistryStore = {
		sessionsByGuild: new Map<string, WolfGameSession>(),
		sessionsByGameId: new Map<string, WolfGameSession>(),
	};
}

export const sessionsByGuild =
	registryBridge.__wolfgameRegistryStore.sessionsByGuild;
export const sessionsByGameId =
	registryBridge.__wolfgameRegistryStore.sessionsByGameId;
