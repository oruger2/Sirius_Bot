-- CreateTable
CREATE TABLE `SurvivalRanking` (
    `userId` VARCHAR(191) NOT NULL,
    `username` VARCHAR(191) NOT NULL,
    `bestDays` INTEGER NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ServerSetting` (
    `id` VARCHAR(191) NOT NULL,
    `serverId` VARCHAR(191) NOT NULL,
    `spamBlockEnabled` BOOLEAN NOT NULL DEFAULT true,
    `inviteBlockEnabled` BOOLEAN NOT NULL DEFAULT true,
    `spamReportChannelId` VARCHAR(191) NULL,
    `inviteReportChannelId` VARCHAR(191) NULL,
    `ignoredRoles` VARCHAR(191) NOT NULL DEFAULT '',
    `ignoredChannels` VARCHAR(191) NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ServerSetting_serverId_key`(`serverId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
