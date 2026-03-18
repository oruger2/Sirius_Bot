import type { Client } from "discord.js";
import { sendShardOnlineStatus } from "../utils/statusWebhook.ts";

const event = {
  name: "shardReady",
  async execute(shardId: number, unavailableGuilds: Set<string> | undefined, client: Client) {
    void unavailableGuilds;

    await sendShardOnlineStatus(client, shardId).catch((error) => {
      console.error(`❌ Shard ${shardId} online webhook 送信失敗`, error);
    });
  }
};

export default event;
