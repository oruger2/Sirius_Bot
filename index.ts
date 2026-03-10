import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Client, Collection, GatewayIntentBits, Partials } from "discord.js";
import * as dotenv from "dotenv";

dotenv.config();

/* ======================
   コマンド型
====================== */

type CommandModule = {
  data: { name: string };
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isTargetModule = (file: string) => file.endsWith(".js") || file.endsWith(".ts");

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
        await event.execute(...args);
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

  const token = process.env.DISCORD_BOT_TOKEN;

  if (!token) {
    throw new Error("❌ DISCORD_BOT_TOKEN が設定されていません");
  }

  await client.login(token);
}

init().catch((err: unknown) => {
  console.error("❌ Bot初期化失敗", err);
  process.exit(1);
});
