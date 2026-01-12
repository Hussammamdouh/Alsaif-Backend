/**
 * Backup Service
 *
 * Automated MongoDB backups for local VPS deployment
 * Uses mongodump/mongorestore for backup/restore
 */

const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');
const { MONGODB_URI } = require('../config/env');

class BackupService {
  constructor() {
    this.backupDir = path.join(process.cwd(), 'backups');
    this.maxBackups = 30; // Keep last 30 backups
  }

  /**
   * Initialize backup directory
   */
  async initialize() {
    try {
      await fs.mkdir(this.backupDir, { recursive: true });
      logger.info('[BackupService] Initialized', { backupDir: this.backupDir });
    } catch (error) {
      logger.error('[BackupService] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Create backup using mongodump
   */
  async createBackup(options = {}) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupName = options.name || `backup-${timestamp}`;
      const backupPath = path.join(this.backupDir, backupName);

      await fs.mkdir(backupPath, { recursive: true });

      logger.info('[BackupService] Starting backup', { backupName });

      // Build mongodump command
      const command = this.buildMongodumpCommand(backupPath);

      // Execute backup
      await this.executeCommand(command);

      // Get backup size
      const size = await this.getDirectorySize(backupPath);

      const backupInfo = {
        name: backupName,
        path: backupPath,
        timestamp: new Date(),
        size,
        sizeFormatted: this.formatBytes(size)
      };

      // Save backup metadata
      await fs.writeFile(
        path.join(backupPath, 'backup-info.json'),
        JSON.stringify(backupInfo, null, 2)
      );

      logger.info('[BackupService] Backup completed', backupInfo);

      // Cleanup old backups
      await this.cleanupOldBackups();

      return backupInfo;
    } catch (error) {
      logger.error('[BackupService] Backup failed:', error);
      throw error;
    }
  }

  /**
   * Restore from backup using mongorestore
   */
  async restoreBackup(backupName) {
    try {
      const backupPath = path.join(this.backupDir, backupName);

      // Check if backup exists
      try {
        await fs.access(backupPath);
      } catch {
        throw new Error(`Backup not found: ${backupName}`);
      }

      logger.info('[BackupService] Starting restore', { backupName });

      // Build mongorestore command
      const command = this.buildMongorestoreCommand(backupPath);

      // Execute restore
      await this.executeCommand(command);

      logger.info('[BackupService] Restore completed', { backupName });

      return { backupName, restoredAt: new Date() };
    } catch (error) {
      logger.error('[BackupService] Restore failed:', error);
      throw error;
    }
  }

  /**
   * List all backups
   */
  async listBackups() {
    try {
      const files = await fs.readdir(this.backupDir);
      const backups = [];

      for (const file of files) {
        const backupPath = path.join(this.backupDir, file);
        const stat = await fs.stat(backupPath);

        if (stat.isDirectory()) {
          try {
            const infoPath = path.join(backupPath, 'backup-info.json');
            const info = await fs.readFile(infoPath, 'utf-8');
            backups.push(JSON.parse(info));
          } catch {
            // If no info file, create basic info
            const size = await this.getDirectorySize(backupPath);
            backups.push({
              name: file,
              path: backupPath,
              timestamp: stat.mtime,
              size,
              sizeFormatted: this.formatBytes(size)
            });
          }
        }
      }

      // Sort by timestamp (newest first)
      backups.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      return backups;
    } catch (error) {
      logger.error('[BackupService] List backups failed:', error);
      throw error;
    }
  }

  /**
   * Delete a backup
   */
  async deleteBackup(backupName) {
    try {
      const backupPath = path.join(this.backupDir, backupName);

      await this.deleteDirectory(backupPath);

      logger.info('[BackupService] Backup deleted', { backupName });

      return { deleted: true, backupName };
    } catch (error) {
      logger.error('[BackupService] Delete backup failed:', error);
      throw error;
    }
  }

  /**
   * Cleanup old backups (keep only N most recent)
   */
  async cleanupOldBackups() {
    try {
      const backups = await this.listBackups();

      if (backups.length > this.maxBackups) {
        const toDelete = backups.slice(this.maxBackups);

        for (const backup of toDelete) {
          await this.deleteBackup(backup.name);
        }

        logger.info('[BackupService] Cleaned up old backups', {
          deleted: toDelete.length
        });

        return toDelete.length;
      }

      return 0;
    } catch (error) {
      logger.error('[BackupService] Cleanup failed:', error);
      throw error;
    }
  }

  /**
   * Get backup statistics
   */
  async getBackupStats() {
    try {
      const backups = await this.listBackups();
      const totalSize = backups.reduce((sum, b) => sum + b.size, 0);

      return {
        totalBackups: backups.length,
        totalSize,
        totalSizeFormatted: this.formatBytes(totalSize),
        oldestBackup: backups[backups.length - 1],
        newestBackup: backups[0],
        backupDir: this.backupDir
      };
    } catch (error) {
      logger.error('[BackupService] Get stats failed:', error);
      throw error;
    }
  }

  /**
   * Build mongodump command
   */
  buildMongodumpCommand(outputPath) {
    const uri = MONGODB_URI || 'mongodb://localhost:27017/elsaif';
    return `mongodump --uri="${uri}" --out="${outputPath}"`;
  }

  /**
   * Build mongorestore command
   */
  buildMongorestoreCommand(inputPath) {
    const uri = MONGODB_URI || 'mongodb://localhost:27017/elsaif';
    return `mongorestore --uri="${uri}" --drop "${inputPath}"`;
  }

  /**
   * Execute shell command
   */
  executeCommand(command) {
    return new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          resolve({ stdout, stderr });
        }
      });
    });
  }

  /**
   * Get directory size recursively
   */
  async getDirectorySize(dirPath) {
    let totalSize = 0;

    try {
      const files = await fs.readdir(dirPath);

      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stat = await fs.stat(filePath);

        if (stat.isDirectory()) {
          totalSize += await this.getDirectorySize(filePath);
        } else {
          totalSize += stat.size;
        }
      }
    } catch (error) {
      logger.error('[BackupService] Get directory size failed:', error);
    }

    return totalSize;
  }

  /**
   * Delete directory recursively
   */
  async deleteDirectory(dirPath) {
    try {
      await fs.rm(dirPath, { recursive: true, force: true });
    } catch (error) {
      logger.error('[BackupService] Delete directory failed:', error);
      throw error;
    }
  }

  /**
   * Format bytes to human readable
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }
}

module.exports = new BackupService();
