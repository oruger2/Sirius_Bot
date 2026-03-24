import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  Client,
  Collection,
  GatewayIntentBits,
  Partials,
  REST,
  Routes
} from "discord.js";
import * as dotenv from "dotenv";
import { initErrorReporting } from "./utils/errorWebhook.ts";
import express from "express";
import type { Request, Response } from "express";
import os from "os";

function getLocalIP() {
  const interfaces = os.networkInterfaces();

  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] || []) {
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  return "IP取得失敗";
}

console.log("🌐 Server IP:", getLocalIP());

dotenv.config();

const app = express();
const token = process.env.DISCORD_BOT_TOKEN;

if (!token) {
  throw new Error("❌ DISCORD_BOT_TOKEN が設定されていません");
}

const rest = new REST({ version: "10" }).setToken(token);

initErrorReporting();

/* ======================
   コマンド型
====================== */

type CommandModule = {
  data: { name: string; toJSON: () => unknown };
  execute: (...args: any[]) => Promise<unknown> | unknown;
};

/* ======================
   Client拡張
====================== */

class ExtendedClient extends Client {
  commands: Collection<string, CommandModule> = new Collection();
}

const client = new ExtendedClient({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction
  ]
});

const applicationId = process.env.DISCORD_CLIENT_ID ?? "";

if (!applicationId) {
  throw new Error("❌ DISCORD_CLIENT_ID が設定されていません");
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isTargetModule = (file: string) => file.endsWith(".ts");

const listDirectoryIfExists = async (targetPath: string) => {
  try {
    return await fsp.readdir(targetPath);
  } catch (error: unknown) {
    const isMissingDirectory =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "ENOENT";

    if (isMissingDirectory) {
      console.warn(`⚠️ ディレクトリが見つかりません: ${targetPath}`);
      return [];
    }

    throw error;
  }
};

async function init() {
  const commandPath = path.join(__dirname, "commands");

  const commandFiles = (await listDirectoryIfExists(commandPath)).filter(isTargetModule);

  for (const file of commandFiles) {
    const filePath = path.join(commandPath, file);
    const commandModule = await import(pathToFileURL(filePath).href);
    const command = (commandModule?.default ?? commandModule) as CommandModule;

    if (!command?.data?.name || !command?.execute) {
      console.warn(`⚠️ ${file} は data または execute が不足`);
      continue;
    }

    if (client.commands.has(command.data.name)) {
      console.warn(`⚠️ コマンド重複: ${command.data.name}`);
      continue;
    }

    client.commands.set(command.data.name, command);
  }

  console.log(`✅ コマンド読み込み: ${client.commands.size}`);

  /* ======================
     イベント読み込み
  ====================== */

  const eventPath = path.join(__dirname, "events");

  const eventFiles = (await listDirectoryIfExists(eventPath))
    .filter(isTargetModule)
    .filter((file: string) => !file.startsWith("blacklist."));

  // Guard against modules that register listeners on import.
  const preflightMaxListeners = Math.max(10, eventFiles.length);
  client.setMaxListeners(preflightMaxListeners);

  const loadedEvents: Array<{
    name: string;
    once?: boolean;
    execute: (...args: any[]) => Promise<unknown> | unknown;
  }> = [];

  const eventNameCounts = new Map<string, number>();

  for (const file of eventFiles) {
    if (file.startsWith("blacklist.")) {
      continue;
    }

    const filePath = path.join(eventPath, file);
    const eventModule = await import(pathToFileURL(filePath).href);
    const event = (eventModule?.default ?? eventModule) as {
      name: string;
      once?: boolean;
      execute: (...args: any[]) => Promise<unknown> | unknown;
    };

    if (!event?.name || !event?.execute) {
      console.warn(`⚠️ ${file} は event構造が不正`);
      continue;
    }

    loadedEvents.push(event);
    eventNameCounts.set(event.name, (eventNameCounts.get(event.name) ?? 0) + 1);
  }

  const maxListenerCount = Math.max(10, ...eventNameCounts.values());
  const finalMaxListeners = Math.max(preflightMaxListeners, maxListenerCount);

  if (finalMaxListeners > 10) {
    client.setMaxListeners(finalMaxListeners);
  }

  for (const event of loadedEvents) {
    const handler = async (...args: any[]) => {
      try {
        await event.execute(...args, client);
      } catch (error) {
        console.error(`❌ Event Error: ${event.name}`, error);
      }
    };

    if (event.once) {
      client.once(event.name, handler);
    } else {
      client.on(event.name, handler);
    }
  }

  console.log(`✅ イベント読み込み: ${loadedEvents.length}`);
app.get('/api/guilds', (req: Request, res: Response) => {
  const guildIds = client.guilds.cache.map(guild => guild.id);
  res.json(guildIds);
});

app.get('/api/shards', async (req: Request, res: Response) => {
  try {
    if (!client.shard) {
      return res.status(500).json({ error: "Sharding is not enabled" });
    }

    const shardData = await client.shard.broadcastEval(c => {
      return {
        id: c.shard?.ids[0], 
        status: c.ws.status,
        ping: c.ws.ping,
        guildCount: c.guilds.cache.size,
        guildIds: c.guilds.cache.map(g => g.id)
      };
    });

    res.json(shardData);
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error occurred";
    res.status(500).json({ error: errorMessage });
  }
});

app.get('/api/shards/:id', async (req: Request<{ id: string }>, res: Response) => {
  const targetId = Number.parseInt(req.params.id, 10);
  if (Number.isNaN(targetId)) {
    return res.status(400).json({ error: "Invalid shard id" });
  }
  
  try {
    if (!client.shard) {
      return res.status(500).json({ error: "Sharding is not enabled" });
    }

    const results = await client.shard.broadcastEval((c, { targetId }) => {
      if (c.shard?.ids.includes(targetId)) {
        return {
          id: targetId,
          ping: c.ws.ping,
          guilds: c.guilds.cache.map(g => g.id)
        };
      }
      return null;
    }, { context: { targetId } });
  
    const data = results.find(r => r !== null);
    
    if (!data) {
      return res.status(404).json({ error: "Shard not found" });
    }
    
    res.json(data);
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error occurred";
    res.status(500).json({ error: errorMessage });
  }
});

app.get('/api/commands', async (req, res) => {
    try {
        // 1. Discordから登録済みコマンドをGET（内部的なバケツリレー）
        const commands = await rest.get(
            Routes.applicationCommands(applicationId)
        );

        res.status(200).json(commands);

    } catch (error) {
        console.error('Fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch commands from Discord' });
    }
});

app.listen(3000, () => {
  console.log('API started');
});

  client.on("error", (error) => {
    console.error("❌ Client error", error);
  });

  await client.login(token);

  const slashCommands = client.commands.map((command) => command.data.toJSON());

  await rest.put(Routes.applicationCommands(applicationId), {
    body: slashCommands
  });

  console.log(`✅ コマンド登録完了: ${slashCommands.length}`);
}

init().catch((err: unknown) => {
  console.error("❌ Bot初期化失敗", err);
});