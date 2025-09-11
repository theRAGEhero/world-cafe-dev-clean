const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format for better readability
const customFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
        return `${timestamp} [${level.toUpperCase()}] ${message}${metaStr}`;
    })
);

// Create Winston logger
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: customFormat,
    defaultMeta: { service: 'world-cafe' },
    transports: [
        // Write all logs with level `error` and below to `error.log`
        new winston.transports.File({ 
            filename: path.join(logsDir, 'error.log'), 
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 5,
        }),
        // Write all logs with level `info` and below to `combined.log`
        new winston.transports.File({ 
            filename: path.join(logsDir, 'combined.log'),
            maxsize: 5242880, // 5MB
            maxFiles: 5,
        }),
        // Console transport for development
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                customFormat
            )
        })
    ],
});

// Activity logging to database
let db = null;

// Initialize database connection for activity logging
const initializeActivityLogging = (database) => {
    db = database;
    logger.info('Activity logging initialized with database connection');
};

// Log user activity to database
const logActivity = async (action, details = {}) => {
    try {
        if (!db) {
            logger.warn('Database not initialized for activity logging');
            return;
        }

        const activityLog = {
            action,
            details: JSON.stringify(details),
            timestamp: new Date(),
            user_id: details.userId || null,
            session_id: details.sessionId || null,
            table_id: details.tableId || null,
            ip_address: details.ipAddress || null,
            user_agent: details.userAgent || null
        };

        await db.query(`
            INSERT INTO activity_logs (action, details, timestamp, user_id, session_id, table_id, ip_address, user_agent)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            activityLog.action,
            activityLog.details,
            activityLog.timestamp,
            activityLog.user_id,
            activityLog.session_id,
            activityLog.table_id,
            activityLog.ip_address,
            activityLog.user_agent
        ]);

        logger.debug('Activity logged to database', { action, userId: details.userId });
    } catch (error) {
        logger.error('Failed to log activity to database', { error: error.message, action });
    }
};

// Enhanced logging methods that include activity logging
const enhancedLogger = {
    // Standard Winston methods
    error: (message, meta = {}) => {
        logger.error(message, meta);
        if (meta.action) logActivity(meta.action, { ...meta, level: 'error' });
    },
    
    warn: (message, meta = {}) => {
        logger.warn(message, meta);
        if (meta.action) logActivity(meta.action, { ...meta, level: 'warn' });
    },
    
    info: (message, meta = {}) => {
        logger.info(message, meta);
        if (meta.action) logActivity(meta.action, { ...meta, level: 'info' });
    },
    
    debug: (message, meta = {}) => {
        logger.debug(message, meta);
    },

    // Activity-specific logging methods
    logUserAction: (action, userId, details = {}) => {
        const meta = { action, userId, ...details };
        logger.info(`User action: ${action}`, meta);
        logActivity(action, meta);
    },

    logSessionEvent: (event, sessionId, details = {}) => {
        const meta = { action: event, sessionId, ...details };
        logger.info(`Session event: ${event}`, meta);
        logActivity(event, meta);
    },

    logTableEvent: (event, tableId, sessionId, details = {}) => {
        const meta = { action: event, tableId, sessionId, ...details };
        logger.info(`Table event: ${event}`, meta);
        logActivity(event, meta);
    },

    logError: (error, context = {}) => {
        const meta = { 
            error: error.message, 
            stack: error.stack, 
            action: 'error_occurred',
            ...context 
        };
        logger.error(`Error: ${error.message}`, meta);
        logActivity('error_occurred', meta);
    },

    // Performance logging
    logPerformance: (operation, duration, details = {}) => {
        const meta = { 
            action: 'performance_metric', 
            operation, 
            duration, 
            ...details 
        };
        logger.info(`Performance: ${operation} took ${duration}ms`, meta);
        if (duration > 1000) { // Log slow operations to database
            logActivity('slow_operation', meta);
        }
    },

    // Initialize the database connection
    initialize: initializeActivityLogging,

    // Get activity logs from database
    getActivityLogs: async (filters = {}) => {
        if (!db) return [];
        
        try {
            let query = 'SELECT * FROM activity_logs WHERE 1=1';
            const params = [];

            if (filters.action) {
                query += ' AND action = ?';
                params.push(filters.action);
            }
            if (filters.userId) {
                query += ' AND user_id = ?';
                params.push(filters.userId);
            }
            if (filters.sessionId) {
                query += ' AND session_id = ?';
                params.push(filters.sessionId);
            }
            if (filters.since) {
                query += ' AND timestamp >= ?';
                params.push(filters.since);
            }

            query += ' ORDER BY timestamp DESC LIMIT ?';
            params.push(filters.limit || 100);

            const [rows] = await db.query(query, params);
            return rows.map(row => ({
                ...row,
                details: JSON.parse(row.details || '{}')
            }));
        } catch (error) {
            logger.error('Failed to retrieve activity logs', { error: error.message });
            return [];
        }
    }
};

module.exports = enhancedLogger;