const { v4: uuidv4 } = require('uuid');

class Settings {
  constructor(db) {
    this.db = db;
  }

  async get(key) {
    try {
      const result = await this.db.queryOne(
        'SELECT setting_value FROM global_settings WHERE setting_key = ?',
        [key]
      );
      return result ? result.setting_value : null;
    } catch (error) {
      console.error(`Error getting setting ${key}:`, error);
      return null;
    }
  }

  async set(key, value, description = null) {
    try {
      await this.db.query(`
        INSERT INTO global_settings (setting_key, setting_value, description) 
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE 
          setting_value = VALUES(setting_value),
          updated_at = CURRENT_TIMESTAMP
      `, [key, value, description]);
      
      return true;
    } catch (error) {
      console.error(`Error setting ${key}:`, error);
      return false;
    }
  }

  async getAll() {
    try {
      const results = await this.db.query(
        'SELECT setting_key, setting_value, description, updated_at FROM global_settings ORDER BY setting_key'
      );
      
      const settings = {};
      results.forEach(row => {
        settings[row.setting_key] = {
          value: row.setting_value,
          description: row.description,
          updated_at: row.updated_at
        };
      });
      
      return settings;
    } catch (error) {
      console.error('Error getting all settings:', error);
      return {};
    }
  }

  async getApiKeys() {
    try {
      const deepgramKey = await this.get('deepgram_api_key');
      const groqKey = await this.get('groq_api_key');
      
      return {
        deepgram_api_key: deepgramKey,
        groq_api_key: groqKey
      };
    } catch (error) {
      console.error('Error getting API keys:', error);
      return {
        deepgram_api_key: null,
        groq_api_key: null
      };
    }
  }

  async setApiKeys(deepgramKey = null, groqKey = null) {
    try {
      const promises = [];
      
      if (deepgramKey !== null) {
        promises.push(this.set('deepgram_api_key', deepgramKey, 'Deepgram API key for speech-to-text transcription'));
      }
      
      if (groqKey !== null) {
        promises.push(this.set('groq_api_key', groqKey, 'Groq API key for LLM analysis'));
      }
      
      await Promise.all(promises);
      return true;
    } catch (error) {
      console.error('Error setting API keys:', error);
      return false;
    }
  }

  async getAdminPassword() {
    try {
      const password = await this.get('admin_password');
      return password || 'admin123'; // Default fallback
    } catch (error) {
      console.error('Error getting admin password:', error);
      return 'admin123';
    }
  }

  async setAdminPassword(newPassword) {
    try {
      return await this.set('admin_password', newPassword, 'Admin panel password');
    } catch (error) {
      console.error('Error setting admin password:', error);
      return false;
    }
  }

  async getPlatformPasswordEnabled() {
    try {
      const enabled = await this.get('platform_password_enabled');
      return enabled === 'true' || enabled === true;
    } catch (error) {
      console.error('Error getting platform password status:', error);
      return false;
    }
  }

  async setPlatformPasswordEnabled(enabled) {
    try {
      return await this.set('platform_password_enabled', enabled.toString(), 'Enable/disable platform-wide password protection');
    } catch (error) {
      console.error('Error setting platform password status:', error);
      return false;
    }
  }

  async getPlatformPassword() {
    try {
      const password = await this.get('platform_password');
      return password || 'testtesttest'; // Default password
    } catch (error) {
      console.error('Error getting platform password:', error);
      return 'testtesttest';
    }
  }

  async setPlatformPassword(password) {
    try {
      return await this.set('platform_password', password, 'Platform-wide access password');
    } catch (error) {
      console.error('Error setting platform password:', error);
      return false;
    }
  }

  async delete(key) {
    try {
      await this.db.query('DELETE FROM global_settings WHERE setting_key = ?', [key]);
      return true;
    } catch (error) {
      console.error(`Error deleting setting ${key}:`, error);
      return false;
    }
  }

  // Load API keys into environment variables at startup
  async loadIntoEnvironment() {
    try {
      const apiKeys = await this.getApiKeys();
      
      if (apiKeys.deepgram_api_key) {
        process.env.DEEPGRAM_API_KEY = apiKeys.deepgram_api_key;
        console.log('✅ Loaded Deepgram API key from database');
      }
      
      if (apiKeys.groq_api_key) {
        process.env.GROQ_API_KEY = apiKeys.groq_api_key;
        console.log('✅ Loaded Groq API key from database');
      }
      
      const adminPassword = await this.getAdminPassword();
      if (adminPassword) {
        process.env.ADMIN_PASSWORD = adminPassword;
        console.log('✅ Loaded admin password from database');
      }
      
      return true;
    } catch (error) {
      console.error('Error loading settings into environment:', error);
      return false;
    }
  }
}

module.exports = Settings;