-- Additional MySQL initialization for World Café Platform
-- This script runs after the main schema to ensure proper setup

-- Switch to the database
USE world_cafe_platform;

-- Verify the database and tables were created correctly
SELECT 'Database setup completed successfully' as status;
SELECT COUNT(*) as migration_count FROM migrations;
SELECT COUNT(*) as table_count FROM INFORMATION_SCHEMA.TABLES 
WHERE TABLE_SCHEMA = 'world_cafe_platform';