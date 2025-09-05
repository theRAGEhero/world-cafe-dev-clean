const fs = require('fs');
const path = require('path');
const db = require('./database/connection');

async function runMigrations() {
    try {
        console.log('🔧 Starting database migrations...');
        
        // Check database connection
        if (!await db.isHealthy()) {
            throw new Error('Database connection failed');
        }
        
        // Get all migration files
        const migrationsDir = path.join(__dirname, '../database/migrations');
        
        if (!fs.existsSync(migrationsDir)) {
            console.log('📁 Creating migrations directory...');
            fs.mkdirSync(migrationsDir, { recursive: true });
        }
        
        const migrationFiles = fs.readdirSync(migrationsDir)
            .filter(file => file.endsWith('.sql'))
            .sort();
        
        if (migrationFiles.length === 0) {
            console.log('✅ No migrations to run');
            return;
        }
        
        // Create migrations table if it doesn't exist
        await db.query(`
            CREATE TABLE IF NOT EXISTS migrations (
                id INT AUTO_INCREMENT PRIMARY KEY,
                filename VARCHAR(255) NOT NULL UNIQUE,
                executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Get already executed migrations
        const executedMigrations = await db.query('SELECT filename FROM migrations');
        const executedFilenames = executedMigrations.map(m => m.filename);
        
        // Run pending migrations
        for (const filename of migrationFiles) {
            if (executedFilenames.includes(filename)) {
                console.log(`⏭️  Skipping ${filename} (already executed)`);
                continue;
            }
            
            console.log(`🚀 Running migration: ${filename}`);
            
            const migrationPath = path.join(migrationsDir, filename);
            const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
            
            // Split by semicolon and execute each statement
            const statements = migrationSQL
                .split(';')
                .map(stmt => stmt.trim())
                .filter(stmt => stmt.length > 0);
            
            for (const statement of statements) {
                try {
                    await db.query(statement);
                } catch (error) {
                    // Ignore "column already exists" or "duplicate column" errors
                    if (!error.message.includes('already exists') && 
                        !error.message.includes('Duplicate column') &&
                        !error.sqlMessage?.includes('Duplicate column')) {
                        console.error(`Error executing statement: ${statement}`);
                        throw error;
                    } else {
                        console.log(`Skipping: ${error.message}`);
                    }
                }
            }
            
            // Record migration as executed
            await db.query('INSERT INTO migrations (filename) VALUES (?)', [filename]);
            console.log(`✅ Migration ${filename} completed successfully`);
        }
        
        console.log('🎉 All migrations completed successfully!');
        
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        throw error;
    }
}

async function checkTableStructure() {
    try {
        console.log('🔍 Checking participants table structure...');
        
        // Ensure database is connected
        if (!await db.isHealthy()) {
            await db.connect();
        }
        
        // Check participants table
        const participantColumns = await db.query(`
            SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
            FROM information_schema.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() 
              AND TABLE_NAME = 'participants'
            ORDER BY ORDINAL_POSITION
        `);
        
        console.log('📋 Participants table columns:');
        participantColumns.forEach(col => {
            console.log(`  - ${col.COLUMN_NAME}: ${col.DATA_TYPE} ${col.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL'}`);
        });
        
        // Check tables table
        const tableColumns = await db.query(`
            SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
            FROM information_schema.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() 
              AND TABLE_NAME = 'tables'
            ORDER BY ORDINAL_POSITION
        `);
        
        console.log('📋 Tables table columns:');
        tableColumns.forEach(col => {
            console.log(`  - ${col.COLUMN_NAME}: ${col.DATA_TYPE} ${col.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL'}`);
        });
        
        // Check recordings table
        const recordingColumns = await db.query(`
            SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
            FROM information_schema.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() 
              AND TABLE_NAME = 'recordings'
            ORDER BY ORDINAL_POSITION
        `);
        
        console.log('📋 Recordings table columns:');
        recordingColumns.forEach(col => {
            console.log(`  - ${col.COLUMN_NAME}: ${col.DATA_TYPE} ${col.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL'}`);
        });
        
        // Check sessions table
        const sessionColumns = await db.query(`
            SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
            FROM information_schema.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() 
              AND TABLE_NAME = 'sessions'
            ORDER BY ORDINAL_POSITION
        `);
        
        console.log('📋 Sessions table columns:');
        sessionColumns.forEach(col => {
            console.log(`  - ${col.COLUMN_NAME}: ${col.DATA_TYPE} ${col.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL'}`);
        });
        
        // Check participants table requirements
        const hasEmail = participantColumns.some(col => col.COLUMN_NAME === 'email');
        const hasPhone = participantColumns.some(col => col.COLUMN_NAME === 'phone');
        const idColumn = participantColumns.find(col => col.COLUMN_NAME === 'id');
        const hasCorrectIdType = idColumn && idColumn.DATA_TYPE === 'varchar';
        
        // Check tables table requirements
        const hasFacilitatorId = tableColumns.some(col => col.COLUMN_NAME === 'facilitator_id');
        const hasCurrentTopic = tableColumns.some(col => col.COLUMN_NAME === 'current_topic');
        const hasQrCodeUrl = tableColumns.some(col => col.COLUMN_NAME === 'qr_code_url');
        
        // Check recordings table requirements
        const hasProcessedAt = recordingColumns.some(col => col.COLUMN_NAME === 'processed_at');
        
        // Check sessions table requirements
        const hasLanguage = sessionColumns.some(col => col.COLUMN_NAME === 'language');
        
        // Check session_analyses table
        let sessionAnalysesExists = false;
        try {
            await db.query(`
                SELECT COLUMN_NAME FROM information_schema.COLUMNS 
                WHERE TABLE_SCHEMA = DATABASE() 
                  AND TABLE_NAME = 'session_analyses'
                LIMIT 1
            `);
            sessionAnalysesExists = true;
        } catch (error) {
            sessionAnalysesExists = false;
        }
        
        if (!hasEmail || !hasPhone || !hasCorrectIdType || !hasFacilitatorId || !hasCurrentTopic || !hasQrCodeUrl || !hasProcessedAt || !hasLanguage || !sessionAnalysesExists) {
            console.log('⚠️  Schema issues detected. Running migrations...');
            if (!hasEmail) console.log('   - Missing participants.email column');
            if (!hasPhone) console.log('   - Missing participants.phone column');
            if (!hasCorrectIdType) console.log(`   - participants.id column type is ${idColumn?.DATA_TYPE}, should be varchar`);
            if (!hasFacilitatorId) console.log('   - Missing tables.facilitator_id column');
            if (!hasCurrentTopic) console.log('   - Missing tables.current_topic column');
            if (!hasQrCodeUrl) console.log('   - Missing tables.qr_code_url column');
            if (!hasProcessedAt) console.log('   - Missing recordings.processed_at column');
            if (!hasLanguage) console.log('   - Missing sessions.language column');
            if (!sessionAnalysesExists) console.log('   - Missing session_analyses table');
            await runMigrations();
        } else {
            console.log('✅ All required columns present');
        }
        
    } catch (error) {
        console.error('❌ Failed to check table structure:', error.message);
        throw error;
    }
}

// If run directly
if (require.main === module) {
    checkTableStructure()
        .then(() => {
            console.log('Migration check complete');
            process.exit(0);
        })
        .catch((error) => {
            console.error('Migration failed:', error);
            process.exit(1);
        });
}

module.exports = {
    runMigrations,
    checkTableStructure
};