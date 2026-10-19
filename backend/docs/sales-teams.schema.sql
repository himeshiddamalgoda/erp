-- MySQL8.4 after 006-sales-teams. Reference only: run migrations on existing data.
-- Legacy provenance columns deliberately nullable; all new service writes fully populate them.
-- Reuses existing users/customers/quotations/sales_orders/audit/idempotency.

CREATE TABLE `sales_teams` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `code` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `manager_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime(3) NOT NULL,
  `updated_at` datetime(3) NOT NULL,
  `version` int unsigned NOT NULL DEFAULT '1',
  `description` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_by` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updated_by` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `archived_at` datetime(3) DEFAULT NULL,
  `archived_by` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `archive_reason` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`),
  KEY `sales_teams_created_by_foreign_idx` (`created_by`),
  KEY `sales_teams_updated_by_foreign_idx` (`updated_by`),
  KEY `sales_teams_archived_by_foreign_idx` (`archived_by`),
  KEY `team_active_name_idx` (`is_active`,`name`,`id`),
  KEY `team_manager_active_idx` (`manager_id`,`is_active`,`id`),
  KEY `team_created_idx` (`created_at`,`id`),
  CONSTRAINT `sales_teams_archived_by_foreign_idx` FOREIGN KEY (`archived_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `sales_teams_created_by_foreign_idx` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `sales_teams_ibfk_1` FOREIGN KEY (`manager_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `sales_teams_updated_by_foreign_idx` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `team_archive_metadata_check` CHECK ((((`is_active` = 1) and (`archived_at` is null) and (`archived_by` is null) and (`archive_reason` is null)) or ((`is_active` = 0) and (((`archived_at` is null) and (`archived_by` is null) and (`archive_reason` is null)) or ((`archived_at` is not null) and (`archived_by` is not null) and (char_length(trim(`archive_reason`)) > 0))))))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `sales_team_members` (
  `team_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `joined_at` datetime(3) DEFAULT NULL,
  `last_activated_at` datetime(3) DEFAULT NULL,
  `removed_at` datetime(3) DEFAULT NULL,
  `added_by` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `last_activated_by` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `removed_by` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime(3) DEFAULT NULL,
  `updated_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`team_id`,`user_id`),
  KEY `sales_team_members_added_by_foreign_idx` (`added_by`),
  KEY `sales_team_members_last_activated_by_foreign_idx` (`last_activated_by`),
  KEY `sales_team_members_removed_by_foreign_idx` (`removed_by`),
  KEY `team_member_user_active_idx` (`user_id`,`is_active`,`team_id`),
  CONSTRAINT `sales_team_members_added_by_foreign_idx` FOREIGN KEY (`added_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `sales_team_members_ibfk_1` FOREIGN KEY (`team_id`) REFERENCES `sales_teams` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `sales_team_members_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `sales_team_members_last_activated_by_foreign_idx` FOREIGN KEY (`last_activated_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `sales_team_members_removed_by_foreign_idx` FOREIGN KEY (`removed_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `team_code_sequences` (
  `sequence_key` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `next_value` bigint unsigned NOT NULL,
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`sequence_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Added assignment-query index
CREATE INDEX `customer_team_owner_active_idx` ON `customers` (`sales_team_id`, `owner_id`, `is_active`);
-- Added assignment-query index
CREATE INDEX `quote_team_owner_status_idx` ON `quotations` (`sales_team_id`, `owner_id`, `status`, `deleted_at`);
-- Added assignment-query index
CREATE INDEX `order_team_owner_status_idx` ON `sales_orders` (`sales_team_id`, `owner_id`, `status`, `deleted_at`);
