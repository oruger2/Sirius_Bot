import * as util from "node:util";
import { EmbedBuilder, WebhookClient } from "discord.js";

const ERROR_WEBHOOK_URL = process.env.ERROR_WEBHOOK_URL?.trim();
const errorWebhook = ERROR_WEBHOOK_URL
	? new WebhookClient({ url: ERROR_WEBHOOK_URL })
	: null;

const MAX_FIELD_LENGTH = 1024;
const MAX_DESCRIPTION_LENGTH = 4096;

let initialized = false;
let sendQueue: Promise<void> = Promise.resolve();
let rawConsoleError: (...args: unknown[]) => void = console.error.bind(console);

const toSafeString = (value: unknown) => {
	if (typeof value === "string") {
		return value;
	}

	if (value instanceof Error) {
		return value.stack ?? value.message;
	}

	return util.inspect(value, { depth: 4, breakLength: 120 });
};

const normalizeText = (text: string, maxLength: number) => {
	if (text.length <= maxLength) {
		return text;
	}

	return `${text.slice(0, maxLength - 3)}...`;
};

const buildEmbed = (title: string, details: string, stack?: string) => {
	const description = normalizeText(details, MAX_DESCRIPTION_LENGTH);
	const embed = new EmbedBuilder()
		.setColor(0xed4245)
		.setTitle(title)
		.setDescription(description)
		.setTimestamp(new Date());

	if (stack) {
		embed.addFields({
			name: "Stack",
			value: normalizeText(stack, MAX_FIELD_LENGTH),
		});
	}

	return embed;
};

const enqueueSend = async (embed: EmbedBuilder) => {
	if (!errorWebhook) return;
	sendQueue = sendQueue
		.then(async () => {
			await errorWebhook.send({ embeds: [embed] });
		})
		.catch((error) => {
			rawConsoleError("❌ Error webhook send failed", error);
		});

	await sendQueue;
};

const reportError = async (title: string, detail: string, stack?: string) => {
	const embed = buildEmbed(title, detail, stack);
	await enqueueSend(embed);
};

const reportConsoleError = async (args: unknown[]) => {
	const detail = args.map(toSafeString).join(" ");
	const stack = args.find((arg) => arg instanceof Error) as Error | undefined;
	await reportError("Console Error", detail, stack?.stack);
};

const reportUnhandled = async (
	type: "uncaughtException" | "unhandledRejection",
	error: unknown,
) => {
	const detail = toSafeString(error);
	const stack = error instanceof Error ? error.stack : undefined;
	await reportError(type, detail, stack);
};

export const initErrorReporting = () => {
	if (initialized) {
		return;
	}

	initialized = true;
	rawConsoleError = console.error.bind(console);

	console.error = (...args: unknown[]) => {
		rawConsoleError(...args);
		void reportConsoleError(args);
	};

	process.on("uncaughtException", (error) => {
		rawConsoleError("❌ uncaughtException", error);
		void reportUnhandled("uncaughtException", error);
	});

	process.on("unhandledRejection", (reason) => {
		rawConsoleError("❌ unhandledRejection", reason);
		void reportUnhandled("unhandledRejection", reason);
	});
};
