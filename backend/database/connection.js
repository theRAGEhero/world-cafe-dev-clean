const mysql = require('mysql2/promise');
const dbConfig = require('./config');

class DatabaseConnection {
  constructor() {
    this.pool = null;
    this.isConnected = false;
  }

  async connect() {
    try {
      this.pool = mysql.createPool(dbConfig);
      
      // Test the connection
      const connection = await this.pool.getConnection();
      console.log('Connected to MySQL database');
      connection.release();
      
      this.isConnected = true;
      return true;
    } catch (error) {
      console.error('Database connection failed:', error);
      this.isConnected = false;
      return false;
    }
  }

  async query(sql, params = []) {
    if (!this.pool) {
      throw new Error('Database not connected');
    }

    try {
      const [results] = await this.pool.execute(sql, params);
      return results;
    } catch (error) {
      console.error('Database query error:', error);
      throw error;
    }
  }

  async queryOne(sql, params = []) {
    const results = await this.query(sql, params);
    return results.length > 0 ? results[0] : null;
  }

  async transaction(callback) {
    const connection = await this.pool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      const transactionQuery = async (sql, params = []) => {
        const [results] = await connection.execute(sql, params);
        return results;
      };
      
      const result = await callback(transactionQuery);
      
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      this.isConnected = false;
      console.log('Database connection closed');
    }
  }

  // Helper method to execute raw SQL for migrations/setup
  async executeSQLFile(sqlContent) {
    const statements = sqlContent
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

    for (const statement of statements) {
      try {
        await this.query(statement);
      } catch (error) {
        console.error('Error executing statement:', statement);
        throw error;
      }
    }
  }

  // Health check
  async isHealthy() {
    try {
      await this.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }
}

// Create singleton instance
const db = new DatabaseConnection();

module.exports = db;