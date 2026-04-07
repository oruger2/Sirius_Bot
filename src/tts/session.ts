export type GuildTtsSession = {
	textChannelId: string;
	voiceChannelId: string;
};

const sessionsByGuild = new Map<string, GuildTtsSession>();

export const setGuildTtsSession = (
	guildId: string,
	session: GuildTtsSession,
) => {
	sessionsByGuild.set(guildId, session);
};

export const getGuildTtsSession = (guildId: string) =>
	sessionsByGuild.get(guildId) ?? null;

export const clearGuildTtsSession = (guildId: string) => {
	sessionsByGuild.delete(guildId);
};
