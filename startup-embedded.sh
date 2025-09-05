#!/bin/bash
set -e

echo "Initializing MySQL..."
if [ ! -d "/var/lib/mysql/mysql" ]; then
    mysql_install_db --user=mysql --datadir=/var/lib/mysql
fi

echo "Starting MySQL with TCP enabled..."
mysqld --user=mysql \
    --datadir=/var/lib/mysql \
    --socket=/run/mysqld/mysqld.sock \
    --pid-file=/run/mysqld/mysqld.pid \
    --bind-address=0.0.0.0 \
    --port=3306 \
    --skip-networking=false &

echo "Waiting for MySQL to be ready..."
for i in {1..60}; do
    if mysqladmin --socket=/run/mysqld/mysqld.sock ping >/dev/null 2>&1; then
        echo "MySQL socket ready"
        break
    fi
    echo "Waiting for MySQL socket... attempt $i"
    sleep 1
done

# Wait for TCP port
for i in {1..30}; do
    if mysqladmin -h 127.0.0.1 -P 3306 ping >/dev/null 2>&1; then
        echo "MySQL TCP ready"
        break
    fi
    echo "Waiting for MySQL TCP... attempt $i"
    sleep 2
done

echo "Setting up database..."
mysql --socket=/run/mysqld/mysqld.sock -u root -e "
CREATE DATABASE IF NOT EXISTS world_cafe_platform;
CREATE USER IF NOT EXISTS 'world_cafe_user'@'localhost' IDENTIFIED BY 'WorldCafe2024!';
CREATE USER IF NOT EXISTS 'world_cafe_user'@'127.0.0.1' IDENTIFIED BY 'WorldCafe2024!';
CREATE USER IF NOT EXISTS 'world_cafe_user'@'%' IDENTIFIED BY 'WorldCafe2024!';
GRANT ALL PRIVILEGES ON world_cafe_platform.* TO 'world_cafe_user'@'localhost';
GRANT ALL PRIVILEGES ON world_cafe_platform.* TO 'world_cafe_user'@'127.0.0.1';
GRANT ALL PRIVILEGES ON world_cafe_platform.* TO 'world_cafe_user'@'%';
FLUSH PRIVILEGES;"

echo "Importing data..."
mysql --socket=/run/mysqld/mysqld.sock -u root world_cafe_platform < /app/database_export.sql

echo "Starting World Café Platform..."
cd /app
exec node backend/server.js