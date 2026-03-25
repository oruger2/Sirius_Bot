import type { Client } from "discord.js";
import { sendBotOnlineStatus } from "../utils/statusWebhook.ts";

const event = {
  name: "clientReady",
  once: true,
  async execute(client: Client) {
    const shardId = client.shard?.ids[0] ?? 0;
    console.log(`✅ ${client.user?.tag} にログインしました！`);
    if (shardId === 0) {
      await sendBotOnlineStatus(client).catch((error) => {
        console.error("❌ Bot online webhook 送信失敗", error);
      });
    }

    const updatePresence = () => {
      if (!client.user) {
        return;
      }
      const guildCount = client.guilds.cache.size;
      const totalUsers = client.guilds.cache.reduce(
        (sum, guild) => sum + (guild.memberCount ?? 0),
        0
      );
      const pingMs = Math.round(client.ws.ping);
      const shardCount = client.shard?.count ?? 1;

      client.user.setActivity(
        `Servers:${guildCount} | Users:${totalUsers} | Ping:${pingMs}ms | Shards:${shardCount}`
      );

    };

    updatePresence();
    setInterval(updatePresence, 5000);
  }
};

export default event;
