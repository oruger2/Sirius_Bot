import type { Client } from "discord.js";

const event = {
  name: "clientReady",
  once: true,
  async execute(client: Client) {
    console.log(`✅ ${client.user?.tag} にログインしました！`);
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
      const baseActivity = process.env.PRESENCE_BASE ?? "○○";

      client.user.setActivity(
        `Servers:${guildCount} | Users:${totalUsers} | Ping:${pingMs}ms | Shards:${shardCount}`
      );

    };

    updatePresence();
    setInterval(updatePresence, 5000);
  }
};

export default event;
