-- AlterTable: スパムブロック・招待リンクブロック用の個別除外フィールドを追加
-- 旧フィールド ignoredRoles / ignoredChannels は互換性のために残す

ALTER TABLE `ServerSetting`
    ADD COLUMN `spamIgnoredRoles` TEXT NOT NULL DEFAULT '',
    ADD COLUMN `spamIgnoredChannels` TEXT NOT NULL DEFAULT '',
    ADD COLUMN `inviteIgnoredRoles` TEXT NOT NULL DEFAULT '',
    ADD COLUMN `inviteIgnoredChannels` TEXT NOT NULL DEFAULT '';

-- AlterTable: 旧フィールドの型を TEXT に変更（長いIDリストに対応）
ALTER TABLE `ServerSetting`
    MODIFY COLUMN `ignoredRoles` TEXT NOT NULL DEFAULT '',
    MODIFY COLUMN `ignoredChannels` TEXT NOT NULL DEFAULT '';
