import type { Message } from "discord.js";

export default function scheduleReminder(
	channel: Message["channel"],
	content: string,
	delay: number,
) {
	if (delay < 0) throw new RangeError("Delay must be a non-negative number");
	if (!channel.isTextBased() || !channel.isSendable()) {
		throw new Error("Channel is not sendable");
	}

	setTimeout(() => {
		channel.send(content);
	}, delay);
}
