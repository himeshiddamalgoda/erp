-- MySQL 8.4 DDL exported after migration 005-customers.
-- Reference only: use npm run migrate against existing installations.
-- Reuses existing users, sales_teams, quotation and sales order tables.
-- Generated slot columns are database-managed and excluded from ORM write attributes.

CREATE TABLE `customers` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `code` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `country` char(2) COLLATE utf8mb4_unicode_ci NOT NULL,
  `currency` char(3) COLLATE utf8mb4_unicode_ci NOT NULL,
  `payment_terms` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `sales_team_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `owner_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime(3) NOT NULL,
  `updated_at` datetime(3) NOT NULL,
  `version` int unsigned NOT NULL DEFAULT '1',
  `display_name` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(254) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `website` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `registration_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `internal_notes` text COLLATE utf8mb4_unicode_ci,
  `archived_at` datetime(3) DEFAULT NULL,
  `archived_by` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `archive_reason` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_by` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `updated_by` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`),
  KEY `customer_created_by_fk` (`created_by`),
  KEY `customer_updated_by_fk` (`updated_by`),
  KEY `customer_archived_by_fk` (`archived_by`),
  KEY `customer_team_active_name_idx` (`sales_team_id`,`is_active`,`name`,`id`),
  KEY `customer_owner_active_idx` (`owner_id`,`is_active`,`id`),
  KEY `customer_country_active_idx` (`country`,`is_active`,`id`),
  KEY `customer_created_idx` (`created_at`,`id`),
  CONSTRAINT `customer_archived_by_fk` FOREIGN KEY (`archived_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `customer_created_by_fk` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `customer_updated_by_fk` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `customers_ibfk_1` FOREIGN KEY (`sales_team_id`) REFERENCES `sales_teams` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `customers_ibfk_2` FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `customer_archive_consistency` CHECK ((((`is_active` = 1) and (`archived_at` is null) and (`archived_by` is null) and (`archive_reason` is null)) or ((`is_active` = 0) and (`archived_at` is not null) and (`archived_by` is not null) and (char_length(trim(`archive_reason`)) > 0)))),
  CONSTRAINT `customer_required_defaults` CHECK (((`version` > 0) and (`currency` in (_utf8mb4'USD',_utf8mb4'LKR',_utf8mb4'GBP',_utf8mb4'EUR')) and (char_length(trim(`payment_terms`)) > 0)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `customer_contacts` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `customer_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(254) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_primary` tinyint(1) NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `job_title` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime(3) NOT NULL,
  `updated_at` datetime(3) NOT NULL,
  `active_primary_slot` tinyint GENERATED ALWAYS AS ((case when ((`is_active` = 1) and (`is_primary` = 1)) then 1 else NULL end)) STORED,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_customer_active_primary` (`customer_id`,`active_primary_slot`),
  KEY `customer_contact_active_idx` (`customer_id`,`is_active`),
  CONSTRAINT `customer_contacts_ibfk_1` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `customer_contact_flags` CHECK (((`is_active` in (0,1)) and (`is_primary` in (0,1)) and ((`is_active` = 1) or (`is_primary` = 0))))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `customer_addresses` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `customer_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `address_type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `line1` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `line2` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `city` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `postal_code` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `country` char(2) COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_default` tinyint(1) NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `label` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `region` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime(3) NOT NULL,
  `updated_at` datetime(3) NOT NULL,
  `active_default_slot` tinyint GENERATED ALWAYS AS ((case when ((`is_active` = 1) and (`is_default` = 1)) then 1 else NULL end)) STORED,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_customer_default_address` (`customer_id`,`address_type`,`active_default_slot`),
  KEY `customer_address_active_idx` (`customer_id`,`address_type`,`is_active`),
  CONSTRAINT `customer_addresses_ibfk_1` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `address_type_check` CHECK ((`address_type` in (_utf8mb4'billing',_utf8mb4'shipping'))),
  CONSTRAINT `customer_address_flags` CHECK (((`is_active` in (0,1)) and (`is_default` in (0,1)) and ((`is_active` = 1) or (`is_default` = 0)) and (`address_type` in (_utf8mb4'billing',_utf8mb4'shipping'))))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `customer_code_sequences` (
  `sequence_key` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `next_value` bigint unsigned NOT NULL,
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`sequence_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `audit_events` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `entity_type` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `entity_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `actor_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `action` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `from_status` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `to_status` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reason` text COLLATE utf8mb4_unicode_ci,
  `metadata` json DEFAULT NULL,
  `request_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `actor_id` (`actor_id`),
  KEY `audit_events_entity_type_entity_id_created_at_id` (`entity_type`,`entity_id`,`created_at`,`id`),
  CONSTRAINT `audit_events_ibfk_1` FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `idempotency_keys` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `actor_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `operation` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `idempotency_key` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `request_hash` char(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `response_status` smallint unsigned DEFAULT NULL,
  `response_body` json DEFAULT NULL,
  `resource_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `state` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime(3) NOT NULL,
  `expires_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idempotency_keys_actor_id_operation_idempotency_key` (`actor_id`,`operation`,`idempotency_key`),
  CONSTRAINT `idempotency_keys_ibfk_1` FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `idempotency_state_check` CHECK ((`state` in (_utf8mb4'pending',_utf8mb4'completed')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

