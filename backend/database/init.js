const fs = require('fs').promises;
const path = require('path');
const db = require('./connection');

class DatabaseInitializer {
  constructor() {
    this.schemaPath = path.join(__dirname, '../../database/schema.sql');
  }

  async initialize() {
    try {
      console.log('Initializing database connection...');
      await db.connect();

      console.log('Reading database schema...');
      const schemaSQL = await fs.readFile(this.schemaPath, 'utf8');

      console.log('Executing database schema...');
      await db.executeSQLFile(schemaSQL);

      console.log('Running pending migrations...');
      await this.runMigrations();

      console.log('Database initialization completed successfully!');
      return true;
    } catch (error) {
      console.error('Database initialization failed:', error);
      return false;
    }
  }

  async runMigrations() {
    try {
      const migrationsPath = path.join(__dirname, 'migrations');
      const migrationFiles = await fs.readdir(migrationsPath);
      
      for (const file of migrationFiles.sort()) {
        if (file.endsWith('.sql')) {
          const migrationExists = await db.query(
            'SELECT 1 FROM migrations WHERE filename = ?',
            [file]
          );
          
          if (migrationExists.length === 0) {
            console.log(`Running migration: ${file}`);
            const migrationSQL = await fs.readFile(
              path.join(migrationsPath, file),
              'utf8'
            );
            
            await db.executeSQLFile(migrationSQL);
            await db.query(
              'INSERT INTO migrations (filename, executed_at) VALUES (?, NOW())',
              [file]
            );
            
            console.log(`✅ Migration ${file} completed`);
          }
        }
      }
    } catch (error) {
      console.error('Migration failed:', error);
      throw error;
    }
  }

  async checkConnection() {
    try {
      const isHealthy = await db.isHealthy();
      if (isHealthy) {
        console.log('✅ Database connection is healthy');
      } else {
        console.log('❌ Database connection failed');
      }
      return isHealthy;
    } catch (error) {
      console.error('Database health check failed:', error);
      return false;
    }
  }

  async createDemoData() {
    try {
      console.log('Creating demo data...');
      
      // Create a demo session
      const { Session, Table, Participant, QRCode } = require('./models');
      
      const session = await Session.create({
        title: 'Demo World Café Session',
        description: 'A demonstration session for testing the platform',
        tableCount: 5,
        maxParticipants: 25
      });

      console.log('Demo session created:', session.id);

      // Create tables for the session
      await Table.createTablesForSession(session.id, 5);
      console.log('Demo tables created');

      // Create QR codes
      const baseUrl = process.env.BASE_URL || 'http://localhost:3002';
      await QRCode.generateSessionQRs(session.id, 5, baseUrl);
      console.log('Demo QR codes generated');

      console.log('Demo data created successfully!');
      return session.id;
    } catch (error) {
      console.error('Failed to create demo data:', error);
      throw error;
    }
  }

  async reset() {
    try {
      console.log('Resetting database...');
      
      // Drop all tables in reverse order of dependencies
      const dropQueries = [
        'DROP TABLE IF EXISTS activity_log',
        'DROP TABLE IF EXISTS session_settings', 
        'DROP TABLE IF EXISTS qr_codes',
        'DROP TABLE IF EXISTS analysis_results',
        'DROP TABLE IF EXISTS transcriptions',
        'DROP TABLE IF EXISTS recordings',
        'DROP TABLE IF EXISTS participants',
        'DROP TABLE IF EXISTS tables',
        'DROP TABLE IF EXISTS sessions'
      ];

      for (const query of dropQueries) {
        await db.query(query);
      }

      console.log('Database reset completed');
      
      // Reinitialize
      return await this.initialize();
    } catch (error) {
      console.error('Database reset failed:', error);
      return false;
    }
  }

  async migrate() {
    try {
      console.log('Running database migrations...');
      
      // Check if migrations table exists
      try {
        await db.query('SELECT 1 FROM migrations LIMIT 1');
      } catch (error) {
        // Create migrations table
        await db.query(`
          CREATE TABLE migrations (
            id INT AUTO_INCREMENT PRIMARY KEY,
            filename VARCHAR(255) NOT NULL,
            executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_filename (filename)
          )
        `);
      }

      // Check for migration files
      const migrationsDir = path.join(__dirname, 'migrations');
      try {
        const migrationFiles = await fs.readdir(migrationsDir);
        migrationFiles.sort();

        for (const file of migrationFiles) {
          if (file.endsWith('.sql')) {
            // Check if already executed
            const existing = await db.queryOne(
              'SELECT * FROM migrations WHERE filename = ?', 
              [file]
            );

            if (!existing) {
              console.log(`Running migration: ${file}`);
              const migrationSQL = await fs.readFile(
                path.join(migrationsDir, file), 
                'utf8'
              );
              
              await db.executeSQLFile(migrationSQL);
              
              await db.query(
                'INSERT INTO migrations (filename) VALUES (?)', 
                [file]
              );
              
              console.log(`✅ Migration ${file} completed`);
            }
          }
        }
      } catch (error) {
        if (error.code === 'ENOENT') {
          console.log('No migrations directory found, skipping migrations');
        } else {
          throw error;
        }
      }

      console.log('Database migrations completed!');
      return true;
    } catch (error) {
      console.error('Migration failed:', error);
      return false;
    }
  }

  async getStatus() {
    try {
      const isHealthy = await db.isHealthy();
      
      if (!isHealthy) {
        return {
          status: 'disconnected',
          tables: 0,
          error: 'Database connection failed'
        };
      }

      // Count tables
      const tables = await db.query("SHOW TABLES");
      
      // Get some basic stats
      const sessionCount = await db.queryOne('SELECT COUNT(*) as count FROM sessions') || { count: 0 };
      
      return {
        status: 'connected',
        tables: tables.length,
        sessions: sessionCount.count,
        healthy: true
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message,
        healthy: false
      };
    }
  }
}

// CLI interface
if (require.main === module) {
  const initializer = new DatabaseInitializer();
  const command = process.argv[2];

  async function runCommand() {
    switch (command) {
      case 'init':
        await initializer.initialize();
        break;
      case 'reset':
        await initializer.reset();
        break;
      case 'demo':
        await initializer.initialize();
        await initializer.createDemoData();
        break;
      case 'migrate':
        await initializer.migrate();
        break;
      case 'status':
        const status = await initializer.getStatus();
        console.log('Database Status:', JSON.stringify(status, null, 2));
        break;
      case 'check':
        await initializer.checkConnection();
        break;
      default:
        console.log('Usage: node init.js [init|reset|demo|migrate|status|check]');
        console.log('  init   - Initialize database with schema');
        console.log('  reset  - Drop all tables and reinitialize');
        console.log('  demo   - Initialize with demo data');
        console.log('  migrate- Run database migrations');
        console.log('  status - Show database status');
        console.log('  check  - Check database connection');
    }
    
    await db.close();
  }

  runCommand().catch(console.error);
}

module.exports = DatabaseInitializer;