const QRCode = require('qrcode');
const fs = require('fs').promises;
const path = require('path');

class QRCodeService {
  constructor() {
    this.qrCodesDir = path.join(__dirname, '../public/qr-codes');
    this.ensureQRCodesDirectory();
  }

  async ensureQRCodesDirectory() {
    try {
      await fs.access(this.qrCodesDir);
    } catch {
      await fs.mkdir(this.qrCodesDir, { recursive: true });
    }
  }

  async generateSessionQR(sessionId, baseUrl) {
    const qrData = `${baseUrl}/join/${sessionId}`;
    const filename = `session-${sessionId}.png`;
    const imagePath = path.join(this.qrCodesDir, filename);
    
    const qrOptions = {
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    };

    try {
      await QRCode.toFile(imagePath, qrData, qrOptions);
      return {
        id: `session-${sessionId}`,
        data: qrData,
        imagePath: `/qr-codes/${filename}`,
        type: 'session'
      };
    } catch (error) {
      console.error('Error generating session QR code:', error);
      throw error;
    }
  }

  async generateTableQR(sessionId, tableNumber, baseUrl) {
    const qrData = `${baseUrl}/join/${sessionId}/table/${tableNumber}`;
    const filename = `table-${sessionId}-${tableNumber}.png`;
    const imagePath = path.join(this.qrCodesDir, filename);
    
    const qrOptions = {
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    };

    try {
      await QRCode.toFile(imagePath, qrData, qrOptions);
      return {
        id: `table-${sessionId}-${tableNumber}`,
        data: qrData,
        imagePath: `/qr-codes/${filename}`,
        type: 'table',
        tableNumber: tableNumber
      };
    } catch (error) {
      console.error('Error generating table QR code:', error);
      throw error;
    }
  }

  async generateAllQRCodes(sessionId, tableCount, baseUrl) {
    const qrCodes = [];
    
    // Generate session QR code
    const sessionQR = await this.generateSessionQR(sessionId, baseUrl);
    qrCodes.push(sessionQR);

    // Generate table QR codes
    for (let i = 1; i <= tableCount; i++) {
      const tableQR = await this.generateTableQR(sessionId, i, baseUrl);
      qrCodes.push(tableQR);
    }

    return qrCodes;
  }

  async generateDataURL(data, options = {}) {
    const qrOptions = {
      width: options.width || 300,
      margin: options.margin || 2,
      color: {
        dark: options.darkColor || '#000000',
        light: options.lightColor || '#FFFFFF'
      }
    };

    try {
      return await QRCode.toDataURL(data, qrOptions);
    } catch (error) {
      console.error('Error generating QR data URL:', error);
      throw error;
    }
  }

  async getQRImagePath(sessionId, tableNumber = null) {
    const filename = tableNumber 
      ? `table-${sessionId}-${tableNumber}.png`
      : `session-${sessionId}.png`;
    
    const imagePath = path.join(this.qrCodesDir, filename);
    
    try {
      await fs.access(imagePath);
      return `/qr-codes/${filename}`;
    } catch {
      return null;
    }
  }

  async cleanupSessionQRs(sessionId) {
    try {
      const files = await fs.readdir(this.qrCodesDir);
      const sessionFiles = files.filter(file => 
        file.startsWith(`session-${sessionId}`) || 
        file.startsWith(`table-${sessionId}-`)
      );

      for (const file of sessionFiles) {
        await fs.unlink(path.join(this.qrCodesDir, file));
      }

      return sessionFiles.length;
    } catch (error) {
      console.error('Error cleaning up QR codes:', error);
      return 0;
    }
  }
}

module.exports = QRCodeService;