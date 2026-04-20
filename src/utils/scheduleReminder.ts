import type { TextChannel } from "discord.js";

export default function scheduleReminder(
	channel: TextChannel,
	content: string,
	delay: number,
) {
	if (delay < 0) throw new RangeError("Delay must be a non-negative number");
	if (channel.isSendable()) throw new Error("Channel is not sendable");

	setTimeout(() => {
		channel.send(content);
	}, delay);
}
