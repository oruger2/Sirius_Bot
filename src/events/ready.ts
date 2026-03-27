import type { Client } from "discord.js";
import { sendBotOnlineStatus } from "@/utils/statusWebhook";

const event = {
  name: "clientReady",
  once: true,
  async execute(client: Client) {
    const shardId = client.shard?.ids?.[0] ?? 0;

    console.log(
      `✅ ${client.user?.tag} にログインしました！ (Shard ${shardId})`,
    );

    // ======================
    // 全シャード起動待ち
    // ======================
    const waitForShardsReady = async (): Promise<void> => {
      if (!client.shard) return;

      let ready = false;

      while (!ready) {
        try {
          const statuses = await client.shard.broadcastEval((c) => c.ws.status);

          // 0 = READY
          ready = statuses.every((s) => s === 0);
        } catch {
          ready = false;
        }

        if (!ready) {
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    };

    await waitForShardsReady();
    console.log("✅ 全シャード起動完了");

    // ======================
    // Webhook（shard0のみ）
    // ======================
    if (shardId === 0) {
      setTimeout(async () => {
        try {
          await sendBotOnlineStatus(client);
        } catch (e) {
          console.error("❌ Webhook送信失敗", e);
        }
      }, 5000);
    }

    // ======================
    // Presence更新
    // ======================
    const updatePresence = async () => {
      if (!client.user) return;

      try {
        let guildCount = client.guilds.cache.size;
        let totalUsers = client.guilds.cache.reduce(
          (sum, g) => sum + (g.memberCount ?? 0),
          0,
        );

        if (client.shard) {
          const results = await client.shard.broadcastEval((c) => ({
            guilds: c.guilds.cache.size,
            users: c.guilds.cache.reduce(
              (sum, g) => sum + (g.memberCount ?? 0),
              0,
            ),
          }));

          guildCount = results.reduce((a, b) => a + b.guilds, 0);
          totalUsers = results.reduce((a, b) => a + b.users, 0);
        }

        const ping = Math.round(client.ws.ping);
        const shardCount = client.shard?.count ?? 1;

        await client.user.setPresence({
          activities: [
            {
              name: `Servers:${guildCount} | Users:${totalUsers} | Ping:${ping}ms | Shards:${shardCount}`,
              type: 0,
            },
          ],
          status: "online",
        });
      } catch (e) {
        console.error("❌ Presence更新失敗", e);
      }
    };

    setTimeout(async () => {
      await updatePresence();
      setInterval(updatePresence, 30000);
    }, 10000);
  },
};

export default event;
