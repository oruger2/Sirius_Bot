import type { Message } from "discord.js";

export default function convertToCombinedText (message: Message) {
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
}
