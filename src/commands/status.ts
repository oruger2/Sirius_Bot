import {
	type ChatInputCommandInteraction,
	EmbedBuilder,
	SlashCommandBuilder,
} from "discord.js";
import os from "os";
import process from "process";

export const data = new SlashCommandBuilder()
	.setName("status")
	.setDescription("Botの詳細ステータスを表示");

export async function execute(interaction: ChatInputCommandInteraction) {
	await interaction.deferReply();

	const client = interaction.client;

	// =========================
	// ✅ CPU
	// =========================
	const cpus = os.cpus();
	const cpuUsage =
		cpus.reduce((acc, cpu) => {
			const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
			return acc + (1 - cpu.times.idle / total);
		}, 0) / cpus.length;

	const cpuPercent = (cpuUsage * 100).toFixed(2);

	// =========================
	// ✅ RAM（サーバー）
	// =========================
	const totalMem = os.totalmem();
	const freeMem = os.freemem();
	const usedMem = totalMem - freeMem;

	const usedMemMB = (usedMem / 1024 / 1024).toFixed(0);
	const totalMemMB = (totalMem / 1024 / 1024).toFixed(0);
	const memPercent = ((usedMem / totalMem) * 100).toFixed(2);

	// =========================
	// ✅ Bot稼働時間
	// =========================
	const botUptime = formatTime(process.uptime());

	// =========================
	// ✅ サーバー稼働時間
	// =========================
	const serverUptime = formatTime(os.uptime());

	// =========================
	// ✅ Ping
	// =========================
	const ping = Math.round(client.ws.ping);

	// =========================
	// ✅ シャード対応
	// =========================
	let totalGuilds = client.guilds.cache.size;
	let totalUsers = client.guilds.cache.reduce(
		(sum, g) => sum + (g.memberCount ?? 0),
		0,
	);

	if (client.shard) {
		try {
			const results = await client.shard.broadcastEval((c) => ({
				guilds: c.guilds.cache.size,
				users: c.guilds.cache.reduce((sum, g) => sum + (g.memberCount ?? 0), 0),
			}));

			totalGuilds = results.reduce((a, b) => a + b.guilds, 0);
			totalUsers = results.reduce((a, b) => a + b.users, 0);
		} catch {
			// 起動中は無視
		}
	}

	// =========================
	// ✅ Embed（author形式）
	// =========================
	const embed = new EmbedBuilder()
		.setAuthor({
			name: client.user?.tag ?? "Bot",
			iconURL: client.user?.displayAvatarURL(),
		})
		.setDescription("📊 **Bot System Status**")
		.addFields(
			{
				name: "🖥️ システム",
				value: `CPU: **${cpuPercent}%**\nRAM: **${memPercent}%** (${usedMemMB}/${totalMemMB}MB)`,
				inline: false,
			},
			{
				name: "📡 ネットワーク",
				value: `Ping: **${ping}ms**\nShard: **${client.shard?.count ?? 1}**`,
				inline: false,
			},
			{
				name: "🌐 Discord",
				value: `Servers: **${totalGuilds}**\nUsers: **${totalUsers}**`,
				inline: false,
			},
			{
				name: "⏱️ 稼働時間",
				value: `Bot: **${botUptime}**\nServer: **${serverUptime}**`,
				inline: false,
			},
		)
		.setColor(0x00ffcc)
		.setFooter({ text: "Sirius System Monitor" })
		.setTimestamp();

	await interaction.editReply({ embeds: [embed] });
}

// =========================
// ⏱️ 時間フォーマット
// =========================
function formatTime(sec: number) {
	const d = Math.floor(sec / 86400);
	const h = Math.floor((sec % 86400) / 3600);
	const m = Math.floor((sec % 3600) / 60);
	const s = Math.floor(sec % 60);

	return `${d}d ${h}h ${m}m ${s}s`;
}
