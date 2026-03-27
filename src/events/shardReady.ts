import type { Client } from "discord.js";
import {
  sendShardDistributionStatus,
  sendShardOnlineStatus,
} from "@/utils/statusWebhook";
import { setTimeout as sleep } from "node:timers/promises";

type ShardGuildDistribution = {
  id: number;
  guildCount: number;
};

const DISTRIBUTION_RETRY_DELAY_MS = 1_500;
const DISTRIBUTION_MAX_RETRIES = 10;

const isShardingInProcessError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false;
  }

  const code = (error as { code?: string }).code;
  return (
    code === "ShardingInProcess" ||
    error.message.includes("Shards are still being spawned")
  );
};

const fetchShardDistribution = async (
  client: Client,
): Promise<ShardGuildDistribution[]> => {
  if (!client.shard) {
    return [{ id: 0, guildCount: client.guilds.cache.size }];
  }

  for (let attempt = 0; attempt <= DISTRIBUTION_MAX_RETRIES; attempt += 1) {
    try {
      const distribution = await client.shard.broadcastEval((c) => ({
        id: c.shard?.ids[0] ?? 0,
        guildCount: c.guilds.cache.size,
      }));

      return distribution
        .filter(
          (shard): shard is ShardGuildDistribution =>
            typeof shard?.id === "number" &&
            typeof shard?.guildCount === "number",
        )
        .sort((a, b) => a.id - b.id);
    } catch (error: unknown) {
      const canRetry =
        isShardingInProcessError(error) && attempt < DISTRIBUTION_MAX_RETRIES;

      if (!canRetry) {
        throw error;
      }

      await sleep(DISTRIBUTION_RETRY_DELAY_MS);
    }
  }

  return [];
};

const event = {
  name: "shardReady",
  async execute(
    shardId: number,
    unavailableGuilds: Set<string> | undefined,
    client: Client,
  ) {
    void unavailableGuilds;

    await sendShardOnlineStatus(client, shardId).catch((error) => {
      console.error(`❌ Shard ${shardId} online webhook 送信失敗`, error);
    });

    const distribution = await fetchShardDistribution(client).catch((error) => {
      console.error("❌ shard distribution 取得失敗", error);
      return [] as ShardGuildDistribution[];
    });

    if (distribution.length === 0) {
      return;
    }

    await sendShardDistributionStatus(client, shardId, distribution).catch(
      (error) => {
        console.error(
          `❌ Shard ${shardId} distribution webhook 送信失敗`,
          error,
        );
      },
    );
  },
};

export default event;
