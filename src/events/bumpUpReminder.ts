import type { Message } from "discord.js";

const REMINDER_DELAY_MS = 2 * 60 * 60 * 1000;
const DISBOARD_BOT_ID = "302050872383242240";
const DISSOKU_BOT_ID = "761562078095867916";

const toCombinedText = (message: Message) => {
	const embedText = message.embeds
		.flatMap((embed) => [
			embed.title,
			embed.description,
			embed.author?.name,
			...(embed.fields ?? []).flatMap((field) => [field.name, field.value]),
		])
		.filter((value): value is string => Boolean(value))
		.join("\n");

	return `${message.content}\n${embedText}`.toLowerCase();
};

const isDisboardBumpSuccess = (message: Message) => {
	const authorName = message.author.username.toLowerCase();
	const text = toCombinedText(message);

	const fromDisboard =
		message.author.id === DISBOARD_BOT_ID || authorName.includes("disboard");

	if (!fromDisboard) {
		return false;
	}

	return (
		text.includes("表示順をアップした") ||
		text.includes("bump done") ||
		text.includes("/bump")
	);
};

const isDissokuUpSuccess = (message: Message) => {
	const authorName = message.author.username.toLowerCase();
	const text = toCombinedText(message);

	const fromDissoku =
		message.author.id === DISSOKU_BOT_ID ||
		authorName.includes("ディス速") ||
		authorName.includes("dissoku");

	if (!fromDissoku) {
		return false;
	}

	return (
		text.includes("をアップした") ||
		text.includes("command: /up") ||
		text.includes("/up")
	);
};

const scheduleReminder = (message: Message, reminderText: string) => {
	const channel = message.channel;
	if (!channel.isSendable()) {
		return;
	}

	setTimeout(() => {
		void channel.send({
			content: reminderText,
			allowedMentions: { parse: [] },
		});
	}, REMINDER_DELAY_MS);
};

export default {
	name: "messageCreate",
	async execute(message: Message) {
		if (!message.inGuild() || !message.author.bot) {
			return;
		}

		if (isDisboardBumpSuccess(message)) {
			scheduleReminder(
				message,
				"2時間経過しました。DISBOARDの `/bump` を実行できます。",
			);
			return;
		}

		if (isDissokuUpSuccess(message)) {
			scheduleReminder(
				message,
				"2時間経過しました。ディス速の `/up` を実行できます。",
			);
		}
	},
};
