import pool from "@/database/db";
import { type RowDataPacket } from "mysql2";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
} from "discord.js";
import { ERROR_ICON_URL, SUCCESS_ICON_URL } from "@/utils/embedIcons";

export type SettingField =
  | "joinMessage"
  | "leaveMessage"
  | "spamBlock"
  | "autoReaction"
  | "shortLinkBlock"
  | "inviteLinkBlock";

export interface GuildSettings {
  joinMessage: {
    enabled: boolean;
    channelId: string | null;
    message: string | null;
  };
  leaveMessage: {
    enabled: boolean;
    channelId: string | null;
    message: string | null;
  };
  spamBlock: {
    enabled: boolean;
    reportChannelId: string | null;
    ignoredChannelIds: string[];
    ignoredRoleIds: string[];
    detectionWindowSeconds: number;
    maxMessages: number;
    timeoutSeconds: number;
    deleteMessageSeconds: number;
  };
  autoReaction: {
    enabled: boolean;
    targetChannelIds: string[];
    emojis: string[];
  };
  shortLinkBlock: {
    enabled: boolean;
    channels: string[];
  };
  inviteLinkBlock: {
    enabled: boolean;
    allowedChannels: string[];
    allowedRoles: string[];
    blockedChannels: string[];
    blockedRoles: string[];
  };
}

const DEFAULT_GUILD_SETTINGS: GuildSettings = {
  joinMessage: {
    enabled: false,
    channelId: null,
    message: "ようこそ {user} さん！参加してくれてありがとうございます。",
  },
  leaveMessage: {
    enabled: false,
    channelId: null,
    message: "{user} さんが退出しました。お疲れさまです。",
  },
  spamBlock: {
    enabled: false,
    reportChannelId: null,
    ignoredChannelIds: [],
    ignoredRoleIds: [],
    detectionWindowSeconds: 5,
    maxMessages: 5,
    timeoutSeconds: 600,
    deleteMessageSeconds: 10,
  },
  autoReaction: {
    enabled: false,
    targetChannelIds: [],
    emojis: ["✅", "👍"],
  },
  shortLinkBlock: {
    enabled: false,
    channels: [],
  },
  inviteLinkBlock: {
    enabled: false,
    allowedChannels: [],
    allowedRoles: [],
    blockedChannels: [],
    blockedRoles: [],
  },
};

const SETTINGS_PAGES = [
  {
    title: "ウェルカム / 退出メッセージ",
    description:
      "参加/退出メッセージを有効化/無効化し、メッセージ本文を編集できます。",
  },
  {
    title: "モデレーション設定",
    description:
      "スパム・リンク・自動リアクションなどのモデレーション機能をボタンで切り替えます。",
  },
];

const SETTINGS_TABLE_NAME = "guild";

const parseMentionId = (value: string): string | null => {
  const trimmed = value.trim();
  const channelMatch = trimmed.match(/^<#(\d+)>$/);
  if (channelMatch) return channelMatch[1];
  const roleMatch = trimmed.match(/^<@&(\d+)>$/);
  if (roleMatch) return roleMatch[1];
  if (/^\d+$/.test(trimmed)) return trimmed;
  return null;
};

const parseIdsFromInput = (value: string): string[] => {
  return value
    .split(/[\s,]+/)
    .map((item) => parseMentionId(item))
    .filter((id): id is string => Boolean(id));
};

const safeParseSetting = <T>(raw: unknown, fallback: T): T => {
  if (typeof raw !== "string") {
    return fallback;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const parseSettingsRow = (row: RowDataPacket): GuildSettings => {
  return {
    joinMessage: safeParseSetting(row.setting_JoinMessage, DEFAULT_GUILD_SETTINGS.joinMessage),
    leaveMessage: safeParseSetting(row.setting_LeaveMessage, DEFAULT_GUILD_SETTINGS.leaveMessage),
    spamBlock: safeParseSetting(row.setting_SpamBlock, DEFAULT_GUILD_SETTINGS.spamBlock),
    autoReaction: safeParseSetting(row.setting_AutoReaction, DEFAULT_GUILD_SETTINGS.autoReaction),
    shortLinkBlock: safeParseSetting(row.setting_ShortLinkBlock, DEFAULT_GUILD_SETTINGS.shortLinkBlock),
    inviteLinkBlock: safeParseSetting(row.setting_InviteLinkBlock, DEFAULT_GUILD_SETTINGS.inviteLinkBlock),
  };
};

const getGuildSettings = async (guildId: string): Promise<GuildSettings> => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT setting_JoinMessage, setting_LeaveMessage, setting_SpamBlock, setting_AutoReaction, setting_ShortLinkBlock, setting_InviteLinkBlock FROM ${SETTINGS_TABLE_NAME} WHERE guild_id = ? LIMIT 1`,
    [guildId],
  );

  if (!rows[0]) {
    return JSON.parse(JSON.stringify(DEFAULT_GUILD_SETTINGS));
  }

  return parseSettingsRow(rows[0]);
};

const saveGuildSettings = async (
  guildId: string,
  settings: GuildSettings,
): Promise<void> => {
  await pool.query(
    `INSERT INTO ${SETTINGS_TABLE_NAME} (
      guild_id,
      setting_JoinMessage,
      setting_LeaveMessage,
      setting_SpamBlock,
      setting_AutoReaction,
      setting_ShortLinkBlock,
      setting_InviteLinkBlock
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      setting_JoinMessage = VALUES(setting_JoinMessage),
      setting_LeaveMessage = VALUES(setting_LeaveMessage),
      setting_SpamBlock = VALUES(setting_SpamBlock),
      setting_AutoReaction = VALUES(setting_AutoReaction),
      setting_ShortLinkBlock = VALUES(setting_ShortLinkBlock),
      setting_InviteLinkBlock = VALUES(setting_InviteLinkBlock)
    `,
    [
      guildId,
      JSON.stringify(settings.joinMessage),
      JSON.stringify(settings.leaveMessage),
      JSON.stringify(settings.spamBlock),
      JSON.stringify(settings.autoReaction),
      JSON.stringify(settings.shortLinkBlock),
      JSON.stringify(settings.inviteLinkBlock),
    ],
  );
};

const formatBoolean = (value: boolean) => (value ? "有効" : "無効");

type AnySettingInteraction =
  | ChatInputCommandInteraction
  | ButtonInteraction
  | ModalSubmitInteraction;

const sendEphemeralError = async (
  interaction: AnySettingInteraction,
  content: string,
) => {
  if (interaction.replied || interaction.deferred) {
    await interaction.followUp({ content, ephemeral: true });
    return;
  }

  await interaction.reply({ content, ephemeral: true });
};

const buildSettingsEmbed = (
  settings: GuildSettings,
  page: number,
  guildName: string,
): EmbedBuilder => {
  const pageInfo = SETTINGS_PAGES[page];
  const embed = new EmbedBuilder()
    .setAuthor({ name: "サーバー設定", iconURL: SUCCESS_ICON_URL })
    .setTitle(pageInfo.title)
    .setDescription(pageInfo.description)
    .setColor(0x5865f2)
    .setFooter({ text: `ページ ${page + 1}/${SETTINGS_PAGES.length}` })
    .setTimestamp(new Date())
    .addFields(
      ...(page === 0
        ? [
            {
              name: "Joinメッセージ",
              value:
                `状態: **${formatBoolean(settings.joinMessage.enabled)}**\n` +
                `チャンネル: ${formatChannelMention(settings.joinMessage.channelId)}\n` +
                `メッセージ: ${settings.joinMessage.message || "未設定"}`,
              inline: false,
            },
            {
              name: "Leaveメッセージ",
              value:
                `状態: **${formatBoolean(settings.leaveMessage.enabled)}**\n` +
                `チャンネル: ${formatChannelMention(settings.leaveMessage.channelId)}\n` +
                `メッセージ: ${settings.leaveMessage.message || "未設定"}`,
              inline: false,
            },
          ]
        : [
            {
              name: "スパムブロック",
              value:
                `状態: **${formatBoolean(settings.spamBlock.enabled)}**\n` +
                `判定: ${settings.spamBlock.detectionWindowSeconds}秒以内に${settings.spamBlock.maxMessages}回送信で${Math.floor(settings.spamBlock.timeoutSeconds / 60)}分タイムアウト` +
                `（${settings.spamBlock.deleteMessageSeconds}秒以内のメッセージ削除）\n` +
                `レポート先: ${formatChannelMention(settings.spamBlock.reportChannelId)}\n` +
                `除外チャンネル: ${formatChannelMentions(settings.spamBlock.ignoredChannelIds)}\n` +
                `除外ロール: ${formatRoleMentions(settings.spamBlock.ignoredRoleIds)}`,
              inline: false,
            },
            {
              name: "自動リアクション",
              value:
                `状態: **${formatBoolean(settings.autoReaction.enabled)}**\n` +
                `対象チャンネル: ${formatChannelMentions(settings.autoReaction.targetChannelIds)}\n` +
                `絵文字: ${formatEmojis(settings.autoReaction.emojis)}`,
              inline: false,
            },
          ]),
    );

  embed.setAuthor({ name: `${guildName} の設定`, iconURL: SUCCESS_ICON_URL });
  return embed;
};

const getButtonStyle = (enabled: boolean) =>
  enabled ? ButtonStyle.Success : ButtonStyle.Secondary;

const formatChannelMention = (id: string | null): string =>
  id ? `<#${id}>` : "なし";

const formatChannelMentions = (ids: string[]): string =>
  ids.length ? ids.map((id) => `<#${id}>`).join(", ") : "なし";

const formatRoleMentions = (ids: string[]): string =>
  ids.length ? ids.map((id) => `<@&${id}>`).join(", ") : "なし";

const formatEmojis = (values: string[]): string =>
  values.length ? values.join(" ") : "なし";

const buildSettingsComponents = (
  settings: GuildSettings,
  page: number,
  guildId: string,
): ActionRowBuilder<ButtonBuilder>[] => {
  const buttons: ButtonBuilder[] = [];

  if (page === 0) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`setting:toggle:${guildId}:joinMessage`)
        .setLabel(`Join ${settings.joinMessage.enabled ? "ON" : "OFF"}`)
        .setStyle(getButtonStyle(settings.joinMessage.enabled)),
      new ButtonBuilder()
        .setCustomId(`setting:edit:${guildId}:joinMessage`)
        .setLabel("Join 設定")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`setting:toggle:${guildId}:leaveMessage`)
        .setLabel(`Leave ${settings.leaveMessage.enabled ? "ON" : "OFF"}`)
        .setStyle(getButtonStyle(settings.leaveMessage.enabled)),
      new ButtonBuilder()
        .setCustomId(`setting:edit:${guildId}:leaveMessage`)
        .setLabel("Leave 設定")
        .setStyle(ButtonStyle.Primary),
    );
  } else {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`setting:toggle:${guildId}:spamBlock`)
        .setLabel(`SpamBlock ${settings.spamBlock.enabled ? "ON" : "OFF"}`)
        .setStyle(getButtonStyle(settings.spamBlock.enabled)),
      new ButtonBuilder()
        .setCustomId(`setting:edit:${guildId}:spamBlock`)
        .setLabel("SpamBlock 設定")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`setting:toggle:${guildId}:autoReaction`)
        .setLabel(`AutoReact ${settings.autoReaction.enabled ? "ON" : "OFF"}`)
        .setStyle(getButtonStyle(settings.autoReaction.enabled)),
      new ButtonBuilder()
        .setCustomId(`setting:edit:${guildId}:autoReaction`)
        .setLabel("AutoReact 設定")
        .setStyle(ButtonStyle.Primary),
    );
  }

  const navButtons = [
    new ButtonBuilder()
      .setCustomId(`setting:page:${guildId}:${Math.max(page - 1, 0)}`)
      .setLabel("前へ")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId(`setting:page:${guildId}:${Math.min(page + 1, SETTINGS_PAGES.length - 1)}`)
      .setLabel("次へ")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === SETTINGS_PAGES.length - 1),
  ];

  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons),
    new ActionRowBuilder<ButtonBuilder>().addComponents(...navButtons),
  ];
};

const parseSettingCustomId = (
  customId: string,
): {
  action: string;
  guildId: string;
  target: string;
  extra?: string;
} | null => {
  const segments = customId.split(":");
  if (segments.length < 4 || segments[0] !== "setting") {
    return null;
  }

  return {
    action: segments[1],
    guildId: segments[2],
    target: segments[3],
    extra: segments[4],
  };
};

const updateSettingField = (
  settings: GuildSettings,
  field: SettingField,
  value: boolean,
): GuildSettings => {
  const next = JSON.parse(JSON.stringify(settings)) as GuildSettings;
  if (field === "joinMessage") {
    next.joinMessage.enabled = value;
  } else if (field === "leaveMessage") {
    next.leaveMessage.enabled = value;
  } else if (field === "spamBlock") {
    next.spamBlock.enabled = value;
  } else if (field === "autoReaction") {
    next.autoReaction.enabled = value;
  } else if (field === "shortLinkBlock") {
    next.shortLinkBlock.enabled = value;
  } else if (field === "inviteLinkBlock") {
    next.inviteLinkBlock.enabled = value;
  }
  return next;
};

export default {
  data: new SlashCommandBuilder()
    .setName("setting")
    .setDescription("サーバー設定をボタンとモーダルで行います。"),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild()) {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setAuthor({ name: "エラー", iconURL: ERROR_ICON_URL })
            .setDescription("サーバー内で実行してください。")
            .setColor(0xed4245)
            .setTimestamp(),
        ],
        flags: 64,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const guildId = interaction.guildId as string;
    const guildName = interaction.guild?.name ?? "サーバー";

    let settings: GuildSettings;
    try {
      settings = await getGuildSettings(guildId);
    } catch (error) {
      console.error("setting command DB error:", error);
      await sendEphemeralError(
        interaction,
        "データベースへの接続に失敗しました。後でもう一度お試しください。",
      );
      return;
    }

    const embed = buildSettingsEmbed(settings, 0, guildName);
    const components = buildSettingsComponents(settings, 0, guildId);

    await interaction.editReply({ embeds: [embed], components });
  },
};

export const handleSettingButtonInteraction = async (
  interaction: ButtonInteraction,
): Promise<void> => {
  const parsed = parseSettingCustomId(interaction.customId);
  if (!parsed) return;

  if (interaction.guildId !== parsed.guildId) {
    await interaction.reply({
      content: "この設定ボタンはこのサーバーでは有効ではありません。",
      ephemeral: true,
    });
    return;
  }

  const guildId = parsed.guildId;
  let settings: GuildSettings;
  try {
    settings = await getGuildSettings(guildId);
  } catch (error) {
    console.error("setting button DB error:", error);
    await sendEphemeralError(
      interaction,
      "データベースへの接続に失敗しました。後でもう一度お試しください。",
    );
    return;
  }

  if (parsed.action === "page") {
    const page = Number(parsed.target);
    if (Number.isNaN(page) || page < 0 || page >= SETTINGS_PAGES.length) {
      await interaction.reply({
        content: "無効なページです。",
        ephemeral: true,
      });
      return;
    }

    const embed = buildSettingsEmbed(settings, page, interaction.guild?.name ?? "サーバー");
    const components = buildSettingsComponents(settings, page, guildId);
    await interaction.update({ embeds: [embed], components });
    return;
  }

  if (parsed.action === "toggle") {
    const field = parsed.target as SettingField;
    const nextSettings = updateSettingField(
      settings,
      field,
      !(
        field === "joinMessage"
          ? settings.joinMessage.enabled
          : field === "leaveMessage"
          ? settings.leaveMessage.enabled
          : field === "spamBlock"
          ? settings.spamBlock.enabled
          : field === "autoReaction"
          ? settings.autoReaction.enabled
          : field === "shortLinkBlock"
          ? settings.shortLinkBlock.enabled
          : settings.inviteLinkBlock.enabled
      ),
    );

    await saveGuildSettings(guildId, nextSettings);
    const page = interaction.customId.includes("joinMessage") ||
      interaction.customId.includes("leaveMessage")
      ? 0
      : 1;
    const embed = buildSettingsEmbed(nextSettings, page, interaction.guild?.name ?? "サーバー");
    const components = buildSettingsComponents(nextSettings, page, guildId);
    await interaction.update({ embeds: [embed], components });
    return;
  }

  if (parsed.action === "edit") {
    const field = parsed.target as SettingField;

    if (field === "joinMessage" || field === "leaveMessage") {
      const modal = new ModalBuilder()
        .setCustomId(`setting:modal:${guildId}:${field}`)
        .setTitle(field === "joinMessage" ? "Joinメッセージ設定" : "Leaveメッセージ設定")
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("setting-channel")
              .setLabel("チャンネル(mention または ID)")
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setPlaceholder("#新規参加 または 123456789012345678")
              .setValue(
                field === "joinMessage"
                  ? settings.joinMessage.channelId ?? ""
                  : settings.leaveMessage.channelId ?? "",
              ),
          ),
        )
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("setting-message")
              .setLabel("メッセージ内容")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
              .setMaxLength(1024)
              .setPlaceholder(
                field === "joinMessage"
                  ? "[user]さんようこそ！"
                  : "[user]さんが退出しました。",
              )
              .setValue(
                field === "joinMessage"
                  ? settings.joinMessage.message ?? ""
                  : settings.leaveMessage.message ?? "",
              ),
          ),
        );

      await interaction.showModal(modal);
      return;
    }

    if (field === "spamBlock") {
      const modal = new ModalBuilder()
        .setCustomId(`setting:modal:${guildId}:spamBlock`)
        .setTitle("SpamBlock 設定")
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("setting-report-channel")
              .setLabel("レポート先チャンネル")
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setPlaceholder("#report")
              .setValue(settings.spamBlock.reportChannelId ?? ""),
          ),
        )
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("setting-ignored-channels")
              .setLabel("除外チャンネル (mention または ID)")
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setPlaceholder("#channel1 #channel2")
              .setValue(settings.spamBlock.ignoredChannelIds.join(" ")),
          ),
        )
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("setting-ignored-roles")
              .setLabel("除外ロール (mention または ID)")
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setPlaceholder("@管理者 @role")
              .setValue(settings.spamBlock.ignoredRoleIds.join(" ")),
          ),
        )
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("setting-window")
              .setLabel("判定ウィンドウ (秒)")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setPlaceholder("5")
              .setValue(String(settings.spamBlock.detectionWindowSeconds)),
          ),
        )
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("setting-timeout")
              .setLabel("タイムアウト秒数 / 削除秒数")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setPlaceholder("600 10")
              .setValue(`${settings.spamBlock.timeoutSeconds} ${settings.spamBlock.deleteMessageSeconds}`),
          ),
        );

      await interaction.showModal(modal);
      return;
    }

    if (field === "autoReaction") {
      const modal = new ModalBuilder()
        .setCustomId(`setting:modal:${guildId}:autoReaction`)
        .setTitle("AutoReact 設定")
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("setting-target-channels")
              .setLabel("対象チャンネル (mention または ID)")
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setPlaceholder("#更新情報")
              .setValue(settings.autoReaction.targetChannelIds.join(" ")),
          ),
        )
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("setting-emojis")
              .setLabel("絵文字(スペース区切り)")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setPlaceholder("✅ 👍")
              .setValue(settings.autoReaction.emojis.join(" ")),
          ),
        );

      await interaction.showModal(modal);
      return;
    }

    await interaction.reply({
      content: "この項目は本文編集に対応していません。",
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({
    content: "このボタンは設定用ではありません。",
    ephemeral: true,
  });
};

export const handleSettingModalInteraction = async (
  interaction: ModalSubmitInteraction,
): Promise<void> => {
  if (!interaction.customId.startsWith("setting:modal:")) return;

  const segments = interaction.customId.split(":");
  if (segments.length < 4) return;

  const guildId = segments[2];
  const field = segments[3] as SettingField;
  if (interaction.guildId !== guildId) {
    await interaction.reply({
      content: "この設定モーダルはこのサーバーでは有効ではありません。",
      ephemeral: true,
    });
    return;
  }

  let settings: GuildSettings;
  try {
    settings = await getGuildSettings(guildId);
  } catch (error) {
    console.error("setting modal DB error:", error);
    await sendEphemeralError(
      interaction,
      "データベースへの接続に失敗しました。後でもう一度お試しください。",
    );
    return;
  }

  const nextSettings = JSON.parse(JSON.stringify(settings)) as GuildSettings;

  if (field === "joinMessage" || field === "leaveMessage") {
    const channelInput = interaction.fields.getTextInputValue("setting-channel").trim();
    const messageValue = interaction.fields.getTextInputValue("setting-message");
    const channelId = parseMentionId(channelInput);

    if (field === "joinMessage") {
      nextSettings.joinMessage.channelId = channelId;
      nextSettings.joinMessage.message = messageValue;
    } else {
      nextSettings.leaveMessage.channelId = channelId;
      nextSettings.leaveMessage.message = messageValue;
    }
  } else if (field === "spamBlock") {
    nextSettings.spamBlock.reportChannelId = parseMentionId(
      interaction.fields.getTextInputValue("setting-report-channel").trim(),
    );
    nextSettings.spamBlock.ignoredChannelIds = parseIdsFromInput(
      interaction.fields.getTextInputValue("setting-ignored-channels"),
    );
    nextSettings.spamBlock.ignoredRoleIds = parseIdsFromInput(
      interaction.fields.getTextInputValue("setting-ignored-roles"),
    );

    const windowValue = Number(
      interaction.fields.getTextInputValue("setting-window").trim(),
    );
    nextSettings.spamBlock.detectionWindowSeconds =
      Number.isNaN(windowValue) || windowValue <= 0
        ? settings.spamBlock.detectionWindowSeconds
        : windowValue;

    const timeoutParts = interaction
      .fields
      .getTextInputValue("setting-timeout")
      .trim()
      .split(/\s+/);
    const timeoutSeconds = Number(timeoutParts[0]);
    const deleteSeconds = Number(timeoutParts[1]);

    nextSettings.spamBlock.timeoutSeconds =
      Number.isNaN(timeoutSeconds) || timeoutSeconds <= 0
        ? settings.spamBlock.timeoutSeconds
        : timeoutSeconds;
    nextSettings.spamBlock.deleteMessageSeconds =
      Number.isNaN(deleteSeconds) || deleteSeconds <= 0
        ? settings.spamBlock.deleteMessageSeconds
        : deleteSeconds;
  } else if (field === "autoReaction") {
    nextSettings.autoReaction.targetChannelIds = parseIdsFromInput(
      interaction.fields.getTextInputValue("setting-target-channels"),
    );
    nextSettings.autoReaction.emojis = interaction
      .fields
      .getTextInputValue("setting-emojis")
      .trim()
      .split(/\s+/)
      .filter((emoji) => emoji.length > 0);
  } else {
    await interaction.reply({
      content: "このメニューは本文編集に対応していません。",
      ephemeral: true,
    });
    return;
  }

  await saveGuildSettings(guildId, nextSettings);
  const embed = buildSettingsEmbed(nextSettings, 0, interaction.guild?.name ?? "サーバー");
  const components = buildSettingsComponents(nextSettings, 0, guildId);

  await interaction.reply({
    embeds: [embed],
    components,
    ephemeral: true,
  });
};
