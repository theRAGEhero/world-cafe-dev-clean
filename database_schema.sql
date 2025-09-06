-- World Café Platform Database Schema
-- This file creates all required tables without sensitive user data

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";

-- Table structure for table `global_settings`
CREATE TABLE `global_settings` (
  `setting_key` varchar(255) NOT NULL,
  `setting_value` text DEFAULT NULL,
  `encrypted` tinyint(1) DEFAULT 0,
  `description` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Initialize platform settings
INSERT INTO `global_settings` (`setting_key`, `setting_value`, `encrypted`, `description`) VALUES
('platform_initialized', 'true', 0, 'Whether the platform has been initialized'),
('admin_password', 'changeme123!', 0, 'Admin panel password - change this in production');

-- Table structure for table `migrations`
CREATE TABLE `migrations` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `filename` varchar(255) NOT NULL,
  `executed_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `filename` (`filename`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Mark all migrations as executed
INSERT INTO `migrations` (`filename`) VALUES
('001_add_email_column.sql'),
('002_fix_participants_id_type.sql'),
('003_add_tables_facilitator_columns.sql'),
('004_fix_recordings_table.sql'),
('005_add_sessions_language_column.sql'),
('006_add_session_analysis_table.sql'),
('007_add_global_settings_table.sql'),
('008_add_table_level_analysis.sql'),
('009_add_session_table_passwords.sql');

-- Table structure for table `sessions`
CREATE TABLE `sessions` (
  `id` varchar(36) NOT NULL,
  `title` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `table_count` int NOT NULL DEFAULT 10,
  `status` enum('active','paused','closed','completed','archived','deleted') DEFAULT 'active',
  `session_duration` int DEFAULT 120,
  `rotation_enabled` tinyint(1) DEFAULT 0,
  `recording_enabled` tinyint(1) DEFAULT 1,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `closed_at` timestamp NULL DEFAULT NULL,
  `closed_by` varchar(100) DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  `deleted_by` varchar(100) DEFAULT NULL,
  `admin_notes` text DEFAULT NULL,
  `language` varchar(10) DEFAULT 'en-US',
  `admin_password_hash` varchar(255) DEFAULT NULL,
  `admin_password` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_sessions_status` (`status`),
  KEY `idx_sessions_deleted_at` (`deleted_at`),
  KEY `idx_sessions_admin_password` (`admin_password`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table structure for table `participants`
CREATE TABLE `participants` (
  `id` varchar(36) NOT NULL,
  `session_id` varchar(36) NOT NULL,
  `table_id` int DEFAULT NULL,
  `name` varchar(255) NOT NULL,
  `email` varchar(255) DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `is_facilitator` tinyint(1) DEFAULT 0,
  `joined_at` timestamp NULL DEFAULT current_timestamp(),
  `left_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `session_id` (`session_id`),
  KEY `table_id` (`table_id`),
  CONSTRAINT `participants_ibfk_1` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table structure for table `tables`
CREATE TABLE `tables` (
  `id` int NOT NULL AUTO_INCREMENT,
  `session_id` varchar(36) NOT NULL,
  `table_number` int NOT NULL,
  `name` varchar(255) DEFAULT 'Table',
  `status` enum('waiting','active','inactive','full') DEFAULT 'waiting',
  `max_size` int DEFAULT 6,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `facilitator_id` varchar(36) DEFAULT NULL,
  `current_topic` varchar(500) DEFAULT NULL,
  `qr_code_url` varchar(500) DEFAULT NULL,
  `password_hash` varchar(255) DEFAULT NULL,
  `password` varchar(50) DEFAULT NULL,
  `is_password_protected` tinyint(1) DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_session_table` (`session_id`,`table_number`),
  KEY `tables_facilitator_fk` (`facilitator_id`),
  KEY `idx_tables_password` (`password`),
  KEY `idx_tables_protected` (`is_password_protected`),
  CONSTRAINT `tables_ibfk_1` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `tables_facilitator_fk` FOREIGN KEY (`facilitator_id`) REFERENCES `participants` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Add foreign key constraint from participants to tables (circular dependency resolved)
ALTER TABLE `participants` ADD CONSTRAINT `participants_ibfk_2` FOREIGN KEY (`table_id`) REFERENCES `tables` (`id`) ON DELETE SET NULL;

-- Table structure for table `recordings`
CREATE TABLE `recordings` (
  `id` varchar(36) NOT NULL,
  `session_id` varchar(36) NOT NULL,
  `table_id` int(11) NOT NULL,
  `filename` varchar(255) NOT NULL,
  `duration_seconds` decimal(10,2) DEFAULT 0.00,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `participant_id` varchar(36) DEFAULT NULL,
  `file_path` varchar(500) NOT NULL,
  `file_size` bigint(20) DEFAULT NULL,
  `mime_type` varchar(100) DEFAULT NULL,
  `status` enum('uploaded','processing','completed','failed') DEFAULT 'uploaded',
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `processed_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `session_id` (`session_id`),
  KEY `table_id` (`table_id`),
  KEY `recordings_ibfk_3` (`participant_id`),
  CONSTRAINT `recordings_ibfk_1` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `recordings_ibfk_2` FOREIGN KEY (`table_id`) REFERENCES `tables` (`id`) ON DELETE CASCADE,
  CONSTRAINT `recordings_ibfk_3` FOREIGN KEY (`participant_id`) REFERENCES `participants` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table structure for table `transcriptions`
CREATE TABLE `transcriptions` (
  `id` varchar(36) NOT NULL,
  `session_id` varchar(36) NOT NULL,
  `table_id` int(11) NOT NULL,
  `transcript_text` longtext DEFAULT NULL,
  `confidence_score` decimal(5,4) DEFAULT 0.0000,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `recording_id` varchar(36) DEFAULT NULL,
  `language` varchar(10) DEFAULT 'en',
  `word_count` int(11) DEFAULT 0,
  `speaker_segments` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`speaker_segments`)),
  `timestamps` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`timestamps`)),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `session_id` (`session_id`),
  KEY `table_id` (`table_id`),
  KEY `recording_id` (`recording_id`),
  CONSTRAINT `transcriptions_ibfk_1` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `transcriptions_ibfk_2` FOREIGN KEY (`table_id`) REFERENCES `tables` (`id`) ON DELETE CASCADE,
  CONSTRAINT `transcriptions_ibfk_3` FOREIGN KEY (`recording_id`) REFERENCES `recordings` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table structure for table `qr_codes`
CREATE TABLE `qr_codes` (
  `id` varchar(36) NOT NULL,
  `entity_type` varchar(50) NOT NULL,
  `entity_id` varchar(100) NOT NULL,
  `qr_data` text NOT NULL,
  `is_active` tinyint(1) DEFAULT 1,
  `expires_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `image_path` varchar(500) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table structure for table `session_analyses`
CREATE TABLE `session_analyses` (
  `id` varchar(36) NOT NULL DEFAULT (uuid()),
  `session_id` varchar(36) NOT NULL,
  `table_id` int(11) DEFAULT NULL,
  `analysis_scope` enum('session','table') DEFAULT 'session',
  `analysis_type` enum('summary','themes','sentiment','conflicts','agreements') NOT NULL,
  `analysis_data` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`analysis_data`)),
  `metadata` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`metadata`)),
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_analysis_scope` (`session_id`,`table_id`,`analysis_type`,`analysis_scope`),
  KEY `idx_session_analyses_session_id` (`session_id`),
  KEY `idx_session_analyses_type` (`analysis_type`),
  KEY `idx_table_analysis` (`table_id`,`analysis_scope`),
  KEY `idx_session_scope` (`session_id`,`analysis_scope`),
  CONSTRAINT `session_analyses_ibfk_1` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `session_analyses_table_fk` FOREIGN KEY (`table_id`) REFERENCES `tables` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table structure for table `session_history`
CREATE TABLE `session_history` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `session_id` varchar(36) NOT NULL,
  `action` enum('created','closed','reopened','deleted','restored') NOT NULL,
  `admin_user` varchar(100) DEFAULT 'admin',
  `reason` text DEFAULT NULL,
  `previous_status` varchar(50) DEFAULT NULL,
  `new_status` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `session_id` (`session_id`),
  CONSTRAINT `session_history_ibfk_1` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

COMMIT;