import { EmbedBuilder, WebhookClient } from "discord.js";
import type { Client } from "discord.js";

const STATUS_WEBHOOK_URL =
  "https://discord.com/api/webhooks/1479439479319040194/nPgCxVd2mlIcRrSGeO1EVHcsx-ZpdbZn_coUxz1NqMWAHc86PJ5RDh_mjiIkRqEUYaGb";
const ERROR_WEBHOOK_URL =
  "https://discord.com/api/webhooks/1483741319892570112/ZdWBqfXwV-g0vdeOjg9lg3JUnNvsiOOPSY3ng6bCwAQjO70EhWErXYtp3sLPL8JEUMVg";

const statusWebhook = new WebhookClient({ url: STATUS_WEBHOOK_URL });
const errorWebhook = new WebhookClient({ url: ERROR_WEBHOOK_URL });

let initialReadyNotificationSent = false;

const buildBaseEmbed = (client: Client) => {
  const guildCount = client.guilds.cache.size;
  const totalUsers = client.guilds.cache.reduce(
    (sum, guild) => sum + (guild.memberCount ?? 0),
    0
  );
  const pingMs = Math.round(client.ws.ping);
  const shardCount = client.shard?.count ?? 1;

  return new EmbedBuilder()
    .setColor(0x57f287)
    .setAuthor({
      name: client.user?.tag ?? "Sirius Bot",
      iconURL: client.user?.displayAvatarURL()
    })
    .addFields(
      { name: "Servers", value: `${guildCount}`, inline: true },
      { name: "Users", value: `${totalUsers}`, inline: true },
      { name: "Shards", value: `${shardCount}`, inline: true }
    )
    .setTimestamp(new Date());
};

export const sendBotOnlineStatus = async (client: Client) => {
  const embed = buildBaseEmbed(client)
    .setTitle("Bot Online")
    .setDescription("Bot がオンラインになりました。");

  await statusWebhook.send({ embeds: [embed] });
  initialReadyNotificationSent = true;
};

export const sendShardOnlineStatus = async (client: Client, shardId: number) => {
  if (!initialReadyNotificationSent) {
    return;
  }

  const embed = buildBaseEmbed(client)
    .setTitle("Shard Online")
    .setDescription(`Shard \`${shardId}\` がオンラインに復帰しました。`)
    .addFields({ name: "Shard ID", value: `${shardId}`, inline: true });

  await statusWebhook.send({ embeds: [embed] });
};

type ErrorWebhookOptions = {
  title?: string;
  context?: string;
  error?: unknown;
  client?: Client | null;
};

const toErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    const stackOrMessage = error.stack ?? error.message;
    return stackOrMessage || "No stack trace";
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return "Unknown error";
  }
};

const truncate = (value: string, maxLength: number) => {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3)}...`;
};

export const sendErrorWebhook = async ({
  title = "Bot Error",
  context,
  error,
  client
}: ErrorWebhookOptions) => {
  try {
    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle(title)
      .setTimestamp(new Date());

    if (context) {
      embed.addFields({ name: "Context", value: truncate(context, 1024) });
    }

    if (error) {
      const rawMessage = toErrorMessage(error);
      const escapedMessage = rawMessage.replace(/```/g, "\\`\\`\\`");
      embed.addFields({
        name: "Error",
        value: `\`\`\`\n${truncate(escapedMessage, 990)}\n\`\`\``
      });
    }

    if (client?.user) {
      embed.setAuthor({
        name: client.user.tag,
        iconURL: client.user.displayAvatarURL()
      });
    }

    await errorWebhook.send({ embeds: [embed] });
  } catch (webhookError) {
    console.error("❌ Error webhook 送信失敗", webhookError);
  }
};
