import { EmbedBuilder, WebhookClient } from "discord.js";
import type { Client } from "discord.js";

const STATUS_WEBHOOK_URL =
  "https://discord.com/api/webhooks/1479439479319040194/nPgCxVd2mlIcRrSGeO1EVHcsx-ZpdbZn_coUxz1NqMWAHc86PJ5RDh_mjiIkRqEUYaGb";

const statusWebhook = new WebhookClient({ url: STATUS_WEBHOOK_URL });

export type ShardGuildDistribution = {
  id: number;
  guildCount: number;
};

const buildBaseEmbed = (client: Client) => {
  const guildCount = client.guilds.cache.size;
  const totalUsers = client.guilds.cache.reduce(
    (sum, guild) => sum + (guild.memberCount ?? 0),
    0,
  );
  const pingMs = Math.round(client.ws.ping);
  const shardCount = client.shard?.count ?? 1;

  return new EmbedBuilder()
    .setColor(0x57f287)
    .setAuthor({
      name: client.user?.tag ?? "Sirius Bot",
      iconURL: client.user?.displayAvatarURL(),
    })
    .addFields(
      { name: "Servers", value: `${guildCount}`, inline: true },
      { name: "Users", value: `${totalUsers}`, inline: true },
      { name: "Shards", value: `${shardCount}`, inline: true },
      { name: "Ping", value: `${pingMs}ms`, inline: true },
    )
    .setTimestamp(new Date());
};

export const sendBotOnlineStatus = async (client: Client) => {
  const embed = buildBaseEmbed(client)
    .setTitle("Bot Online")
    .setDescription("Bot がオンラインになりました。");

  await statusWebhook.send({ embeds: [embed] });
};

export const sendShardOnlineStatus = async (
  client: Client,
  shardId: number,
) => {
  const embed = buildBaseEmbed(client)
    .setTitle("Shard Online")
    .setDescription(`Shard \`${shardId}\` がオンラインになりました。`)
    .addFields({ name: "Shard ID", value: `${shardId}`, inline: true });

  await statusWebhook.send({ embeds: [embed] });
};

export const sendShardDistributionStatus = async (
  client: Client,
  reportingShardId: number,
  distribution: ShardGuildDistribution[],
) => {
  const sortedDistribution = [...distribution].sort((a, b) => a.id - b.id);
  const totalGuilds = sortedDistribution.reduce(
    (sum, shard) => sum + shard.guildCount,
    0,
  );

  const distributionFields =
    sortedDistribution.length > 0
      ? sortedDistribution.map((shard) => ({
          name: `Shard #${shard.id}`,
          value: `${shard.guildCount} servers`,
          inline: true,
        }))
      : [{ name: "Shard Distribution", value: "No data", inline: false }];

  const embed = buildBaseEmbed(client)
    .setTitle("Shard Distribution")
    .setDescription(
      `Shard \`${reportingShardId}\` から、現在のサーバー分担状況を通知します。`,
    )
    .addFields(
      { name: "Total Servers", value: `${totalGuilds}`, inline: true },
      ...distributionFields,
    );

  await statusWebhook.send({ embeds: [embed] });
};
