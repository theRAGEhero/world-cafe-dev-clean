/**
 * Frontend Logger for World Café Platform
 * Provides structured logging with backend integration
 */

class FrontendLogger {
    constructor() {
        this.logLevel = localStorage.getItem('logLevel') || 'info';
        this.sessionId = null;
        this.userId = null;
        this.logQueue = [];
        this.isOnline = navigator.onLine;
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Track online/offline status
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.flushQueue();
        });
        
        window.addEventListener('offline', () => {
            this.isOnline = false;
        });

        // Send queued logs before page unload
        window.addEventListener('beforeunload', () => {
            if (this.logQueue.length > 0) {
                this.sendLogsSync();
            }
        });
    }

    setContext(context) {
        if (context.sessionId) this.sessionId = context.sessionId;
        if (context.userId) this.userId = context.userId;
    }

    // Log levels
    error(message, meta = {}) {
        this._log('error', message, meta);
    }

    warn(message, meta = {}) {
        this._log('warn', message, meta);
    }

    info(message, meta = {}) {
        this._log('info', message, meta);
    }

    debug(message, meta = {}) {
        if (this.logLevel === 'debug') {
            this._log('debug', message, meta);
        }
    }

    // Specific action logging methods
    logUserAction(action, details = {}) {
        this._log('info', `User action: ${action}`, {
            action,
            userId: this.userId,
            sessionId: this.sessionId,
            timestamp: new Date().toISOString(),
            url: window.location.href,
            userAgent: navigator.userAgent,
            ...details
        });
    }

    logPageView(page) {
        this.logUserAction('page_view', {
            page,
            referrer: document.referrer,
            timestamp: new Date().toISOString()
        });
    }

    logSessionEvent(event, details = {}) {
        this.logUserAction('session_event', {
            event,
            sessionId: this.sessionId,
            ...details
        });
    }

    logTableEvent(event, tableId, details = {}) {
        this.logUserAction('table_event', {
            event,
            tableId,
            sessionId: this.sessionId,
            ...details
        });
    }

    logError(error, context = {}) {
        this._log('error', error.message, {
            action: 'javascript_error',
            error: error.message,
            stack: error.stack,
            url: window.location.href,
            timestamp: new Date().toISOString(),
            userId: this.userId,
            sessionId: this.sessionId,
            ...context
        });
    }

    logPerformance(operation, startTime, details = {}) {
        const duration = Date.now() - startTime;
        this._log('info', `Performance: ${operation}`, {
            action: 'performance_metric',
            operation,
            duration,
            timestamp: new Date().toISOString(),
            userId: this.userId,
            sessionId: this.sessionId,
            ...details
        });

        if (duration > 2000) {
            this.logUserAction('slow_operation', {
                operation,
                duration,
                ...details
            });
        }
    }

    _log(level, message, meta = {}) {
        const logEntry = {
            level,
            message,
            timestamp: new Date().toISOString(),
            url: window.location.href,
            userId: this.userId,
            sessionId: this.sessionId,
            ...meta
        };

        // Always log to console for development
        if (this.shouldLogLevel(level)) {
            this._consoleLog(level, message, meta);
        }

        // Queue for sending to backend (only important logs)
        if (this.shouldSendToBackend(level, meta)) {
            this.logQueue.push(logEntry);
            
            if (this.isOnline && this.logQueue.length >= 10) {
                this.flushQueue();
            } else if (this.isOnline) {
                // Send important logs immediately
                if (level === 'error' || meta.action) {
                    this.flushQueue();
                }
            }
        }

        // Store critical logs locally
        if (level === 'error') {
            this.storeLocalLog(logEntry);
        }
    }

    _consoleLog(level, message, meta) {
        const style = this.getConsoleStyle(level);
        const metaStr = Object.keys(meta).length ? ` %o` : '';
        
        console.log(
            `%c[${level.toUpperCase()}] ${message}${metaStr}`,
            style,
            ...(Object.keys(meta).length ? [meta] : [])
        );
    }

    getConsoleStyle(level) {
        switch (level) {
            case 'error': return 'color: #ff4444; font-weight: bold;';
            case 'warn': return 'color: #ffaa00; font-weight: bold;';
            case 'info': return 'color: #4444ff;';
            case 'debug': return 'color: #888888;';
            default: return '';
        }
    }

    shouldLogLevel(level) {
        const levels = { error: 0, warn: 1, info: 2, debug: 3 };
        return levels[level] <= levels[this.logLevel];
    }

    shouldSendToBackend(level, meta) {
        // Send errors, warnings, and actions to backend
        return level === 'error' || level === 'warn' || meta.action;
    }

    async flushQueue() {
        if (this.logQueue.length === 0 || !this.isOnline) return;

        const logsToSend = [...this.logQueue];
        this.logQueue = [];

        try {
            await fetch('/api/logs', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ logs: logsToSend })
            });
        } catch (error) {
            // Put logs back in queue if send failed
            this.logQueue.unshift(...logsToSend);
            console.warn('Failed to send logs to server:', error);
        }
    }

    sendLogsSync() {
        // Synchronous sending for beforeunload
        if (this.logQueue.length === 0) return;

        try {
            navigator.sendBeacon('/api/logs', JSON.stringify({
                logs: this.logQueue
            }));
        } catch (error) {
            console.warn('Failed to send logs via beacon:', error);
        }
    }

    storeLocalLog(logEntry) {
        try {
            const logs = JSON.parse(localStorage.getItem('errorLogs') || '[]');
            logs.push(logEntry);
            
            // Keep only last 50 error logs
            if (logs.length > 50) {
                logs.splice(0, logs.length - 50);
            }
            
            localStorage.setItem('errorLogs', JSON.stringify(logs));
        } catch (error) {
            console.warn('Failed to store log locally:', error);
        }
    }

    getLocalLogs() {
        try {
            return JSON.parse(localStorage.getItem('errorLogs') || '[]');
        } catch (error) {
            return [];
        }
    }

    clearLocalLogs() {
        localStorage.removeItem('errorLogs');
    }

    setLogLevel(level) {
        this.logLevel = level;
        localStorage.setItem('logLevel', level);
    }

    // Performance timing helpers
    time(label) {
        return {
            label,
            startTime: Date.now(),
            end: (details = {}) => {
                this.logPerformance(label, Date.now() - Date.now(), details);
            }
        };
    }
}

// Global error handler
window.addEventListener('error', (event) => {
    if (window.logger) {
        window.logger.logError(event.error || new Error(event.message), {
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno
        });
    }
});

// Unhandled promise rejection handler
window.addEventListener('unhandledrejection', (event) => {
    if (window.logger) {
        window.logger.logError(new Error(event.reason), {
            type: 'unhandled_promise_rejection'
        });
    }
});

// Create global logger instance
window.logger = new FrontendLogger();

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FrontendLogger;
}