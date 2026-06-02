import {
	EmbedBuilder,
	Events,
	GuildMember,
	type Message,
	PermissionsBitField,
} from "discord.js";

const userMessages = new Map<
    string,
    { timestamp: number; message: Message }[]
>();

export default {
    name: Events.MessageCreate,

    async execute(message: Message): Promise<void> {
        if (!message.guild || message.author.bot) return;

        const userId = message.author.id;
        const now = Date.now();

        const logs = userMessages.get(userId) ?? [];

        const recentLogs = logs.filter(
            (log) => now - log.timestamp < 5000,
        );

        recentLogs.push({
            timestamp: now,
            message,
        });

        userMessages.set(userId, recentLogs);

        if (recentLogs.length >= 5) {
            const member = message.member;
            if (!member) return;

            if (
                !member.moderatable ||
                member.permissions.has(
                    PermissionsBitField.Flags.Administrator,
                )
            ) {
                return;
            }

            try {
                // スパムメッセージ削除
                for (const log of recentLogs) {
                    await log.message.delete().catch(() => {});
                }

                // 10分タイムアウト
                await member.timeout(
                    10 * 60 * 1000,
                    "スパム行為",
                );

                const embed = new EmbedBuilder()
                    .setTitle("🚫 スパム検知")
                    .setDescription(
                        `${member} スパム行為は禁止です。\n10分間タイムアウトしました。`,
                    )
                    .setColor("Red")
                    .setTimestamp();

                if (message.channel.isSendable()) await message.channel.send({
                    content: `${member}`,
                    embeds: [embed],
                });

                userMessages.delete(userId);
            } catch (error) {
                console.error(
                    `スパム処理失敗 (${userId})`,
                    error,
                );
            }
        }
    },
};