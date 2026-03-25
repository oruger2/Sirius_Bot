import type { Client } from "discord.js";
import { sendBotOnlineStatus } from "../utils/statusWebhook.ts";

const event = {
  name: "clientReady",
  once: true,
  async execute(client: Client) {
    const shardId = client.shard?.ids[0] ?? 0;

    console.log(
      `✅ ${client.user?.tag} にログインしました！ (Shard ${Number(shardId)})`
    );

    // ======================
    // shard0以外は何もしない
    // ======================
    if (shardId !== 0) return;

    // ======================
    // 全シャード起動待ち
    // ======================
    const waitForShardsReady = async (): Promise<void> => {
      if (!client.shard) return;

      let ready = false;

      while (!ready) {
        try {
          const statuses = await client.shard.broadcastEval(
            (c) => c.ws.status
          );

          // 0 = READY
          ready = statuses.every((status) => status === 0);
        } catch {
          // 起動途中エラーは無視
          ready = false;
        }

        if (!ready) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
    };

    // 👇 引数なしで呼ぶ（ここ重要）
    await waitForShardsReady();

    console.log("✅ 全シャード起動完了");

    // ======================
    // Webhook通知
    // ======================
    await sendBotOnlineStatus(client).catch((error) => {
      console.error("❌ Webhook送信失敗", error);
    });

    // ======================
    // Presence更新関数
    // ======================
    const updatePresence = async (): Promise<void> => {
      if (!client.user) return;

      try {
        let guildCount = 0;
        let totalUsers = 0;

        if (client.shard) {
          const results = await client.shard.broadcastEval((c) => ({
            guilds: c.guilds.cache.size,
            users: c.guilds.cache.reduce(
              (sum, g) => sum + (g.memberCount ?? 0),
              0
            )
          }));

          guildCount = results.reduce((sum, r) => sum + r.guilds, 0);
          totalUsers = results.reduce((sum, r) => sum + r.users, 0);
        } else {
          guildCount = client.guilds.cache.size;
          totalUsers = client.guilds.cache.reduce(
            (sum, g) => sum + (g.memberCount ?? 0),
            0
          );
        }

        const pingMs = Math.round(client.ws.ping);
        const shardCount = client.shard?.count ?? 1;

        await client.user.setActivity(
          `Servers:${guildCount} | Users:${totalUsers} | Ping:${pingMs}ms | Shards:${shardCount}`
        );
      } catch (error) {
        console.error("❌ Presence更新失敗", error);
      }
    };

    // ======================
    // 初回 + 定期更新
    // ======================
    await updatePresence();
    setInterval(updatePresence, 30000); // 30秒
  }
};

export default event;