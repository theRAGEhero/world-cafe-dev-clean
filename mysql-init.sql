-- Additional MySQL initialization for World Café Platform
-- This script runs after the main schema to ensure proper setup

-- Grant all privileges to the world_cafe_user
GRANT ALL PRIVILEGES ON world_cafe_platform.* TO 'world_cafe_user'@'%';
GRANT ALL PRIVILEGES ON world_cafe_platform.* TO 'world_cafe_user'@'localhost';

-- Ensure the user can connect from any host
CREATE USER IF NOT EXISTS 'world_cafe_user'@'%' IDENTIFIED BY 'WorldCafe2024!';
GRANT ALL PRIVILEGES ON world_cafe_platform.* TO 'world_cafe_user'@'%';

-- Flush privileges to apply changes
FLUSH PRIVILEGES;

-- Verify the database and tables were created correctly
USE world_cafe_platform;

-- Show that all tables exist
SELECT 'Database setup completed successfully' as status;
SELECT COUNT(*) as migration_count FROM migrations;
SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
WHERE TABLE_SCHEMA = 'world_cafe_platform' 
ORDER BY TABLE_NAME;