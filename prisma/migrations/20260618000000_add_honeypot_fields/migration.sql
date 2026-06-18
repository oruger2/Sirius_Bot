-- AlterTable: ハニーポット機能の設定フィールドを追加
-- ダッシュボード/Bot が参照する ServerSetting のハニーポット設定を DB に保存できるようにする

ALTER TABLE `ServerSetting`
    ADD COLUMN `honeypotChannelId` VARCHAR(191) NULL,
    ADD COLUMN `honeypotEnabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `honeypotIgnoreRole` TEXT NULL,
    ADD COLUMN `honeypotReportId` VARCHAR(191) NULL;
