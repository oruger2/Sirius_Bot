-- AlterTable: ハニーポット機能用の設定フィールドを追加
ALTER TABLE `ServerSetting`
    ADD COLUMN `honeypotChannelId` VARCHAR(191) NULL,
    ADD COLUMN `honeypotEnabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `honeypotIgnoreRole` TEXT NULL,
    ADD COLUMN `honeypotReportId` VARCHAR(191) NULL;
