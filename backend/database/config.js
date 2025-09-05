require('dotenv').config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'world_cafe_platform',
  port: process.env.DB_PORT || 3306,
  
  // Connection pool settings
  acquireTimeout: 60000,
  timeout: 60000,
  reconnect: true,
  
  // Pool configuration
  connectionLimit: 10,
  queueLimit: 0,
  multipleStatements: false,
  
  // SSL configuration (if needed)
  ssl: process.env.DB_SSL === 'true' ? {
    rejectUnauthorized: false
  } : false
};

module.exports = dbConfig;