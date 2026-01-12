/**
 * Versioning Service
 *
 * Manages content versioning with auto-save drafts
 */

const InsightVersion = require('../models/InsightVersion');
const logger = require('../utils/logger');

class VersioningService {
  /**
   * Auto-save draft (called periodically from frontend)
   */
  async autoSaveDraft(insightId, insightData, userId) {
    try {
      const Insight = require('../models/Insight');
      let insight = await Insight.findById(insightId);

      if (!insight) {
        // Create new draft insight if it doesn't exist
        insight = await Insight.create({
          ...insightData,
          status: 'draft',
          author: userId
        });
      } else {
        // Update existing insight
        Object.assign(insight, insightData);
        await insight.save();
      }

      // Create version snapshot
      const version = await InsightVersion.createVersion(
        insight,
        userId,
        'Auto-save draft',
        'updated'
      );

      logger.info('[VersioningService] Auto-saved draft', {
        insightId: insight._id,
        version: version.version
      });

      return { insight, version };
    } catch (error) {
      logger.error('[VersioningService] Auto-save failed:', error);
      throw error;
    }
  }

  /**
   * Create version on publish
   */
  async onPublish(insight, userId) {
    try {
      const version = await InsightVersion.createVersion(
        insight,
        userId,
        'Published insight',
        'published'
      );

      logger.info('[VersioningService] Created publish version', {
        insightId: insight._id,
        version: version.version
      });

      return version;
    } catch (error) {
      logger.error('[VersioningService] Publish version failed:', error);
      throw error;
    }
  }

  /**
   * Create version on update
   */
  async onUpdate(insight, userId, changeDescription = '') {
    try {
      const version = await InsightVersion.createVersion(
        insight,
        userId,
        changeDescription || 'Updated insight',
        'updated'
      );

      logger.info('[VersioningService] Created update version', {
        insightId: insight._id,
        version: version.version
      });

      return version;
    } catch (error) {
      logger.error('[VersioningService] Update version failed:', error);
      throw error;
    }
  }

  /**
   * Get version history
   */
  async getHistory(insightId, options = {}) {
    return await InsightVersion.getHistory(insightId, options);
  }

  /**
   * Get specific version
   */
  async getVersion(insightId, versionNumber) {
    return await InsightVersion.getVersion(insightId, versionNumber);
  }

  /**
   * Compare versions
   */
  async compareVersions(insightId, version1, version2) {
    return await InsightVersion.compareVersions(insightId, version1, version2);
  }

  /**
   * Restore to specific version
   */
  async restoreVersion(insightId, versionNumber, userId) {
    return await InsightVersion.restoreVersion(insightId, versionNumber, userId);
  }

  /**
   * Cleanup old versions (keep only N most recent)
   */
  async cleanupOldVersions(insightId, keepCount = 50) {
    try {
      const deletedCount = await InsightVersion.cleanupOldVersions(insightId, keepCount);

      logger.info('[VersioningService] Cleaned up old versions', {
        insightId,
        deletedCount
      });

      return deletedCount;
    } catch (error) {
      logger.error('[VersioningService] Cleanup failed:', error);
      throw error;
    }
  }

  /**
   * Get storage usage
   */
  async getStorageUsage(insightId) {
    return await InsightVersion.getStorageUsage(insightId);
  }

  /**
   * Batch cleanup for all insights (maintenance task)
   */
  async batchCleanup(keepCount = 50) {
    try {
      const Insight = require('../models/Insight');
      const insights = await Insight.find().select('_id');

      let totalDeleted = 0;
      for (const insight of insights) {
        const deleted = await this.cleanupOldVersions(insight._id, keepCount);
        totalDeleted += deleted;
      }

      logger.info('[VersioningService] Batch cleanup completed', {
        insightsProcessed: insights.length,
        versionsDeleted: totalDeleted
      });

      return { insightsProcessed: insights.length, versionsDeleted: totalDeleted };
    } catch (error) {
      logger.error('[VersioningService] Batch cleanup failed:', error);
      throw error;
    }
  }
}

module.exports = new VersioningService();
