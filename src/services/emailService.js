/**
 * Email Service with Nodemailer
 *
 * Handles all email sending functionality including:
 * - Transactional emails (welcome, password reset, verification)
 * - Notification emails (new insights, comments, follows)
 * - Marketing emails (weekly digest, promotional)
 *
 * Features:
 * - Template-based emails with HTML/text fallback
 * - Queue-based sending for reliability
 * - Retry logic for failed sends
 * - Email tracking and logging
 */

const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');
const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_USER,
  SMTP_PASSWORD,
  SMTP_FROM_NAME,
  SMTP_FROM_EMAIL
} = require('../config/env');

class EmailService {
  constructor() {
    this.transporter = null;
    this.isInitialized = false;
    this.templateCache = new Map();
  }

  /**
   * Initialize email transporter
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }

    try {
      // Create transporter with SMTP configuration
      this.transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_SECURE === 'true', // true for 465, false for other ports
        auth: {
          user: SMTP_USER,
          pass: SMTP_PASSWORD
        },
        pool: true, // Use connection pooling
        maxConnections: 5,
        maxMessages: 100,
        rateDelta: 1000, // 1 second
        rateLimit: 5 // Max 5 emails per rateDelta
      });

      // Verify connection
      await this.transporter.verify();
      this.isInitialized = true;
      logger.info('[EmailService] Initialized successfully');
    } catch (error) {
      logger.error('[EmailService] Failed to initialize:', error);
      // Don't throw - allow app to start even if email is misconfigured
      // Emails will fail gracefully
    }
  }

  /**
   * Load and cache email template
   */
  async loadTemplate(templateName) {
    if (this.templateCache.has(templateName)) {
      return this.templateCache.get(templateName);
    }

    try {
      const templatePath = path.join(__dirname, '../templates/emails', `${templateName}.html`);
      const template = await fs.readFile(templatePath, 'utf-8');
      this.templateCache.set(templateName, template);
      return template;
    } catch (error) {
      logger.error(`[EmailService] Failed to load template ${templateName}:`, error);
      return null;
    }
  }

  /**
   * Replace template variables
   */
  replaceVariables(template, variables) {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(regex, value);
    }
    return result;
  }

  /**
   * Send email with template
   */
  async sendEmail({ to, subject, template, variables = {}, text }) {
    if (!this.isInitialized) {
      logger.warn('[EmailService] Not initialized, skipping email send');
      return { success: false, error: 'Email service not initialized' };
    }

    try {
      let html = null;

      // Load template if provided
      if (template) {
        const templateContent = await this.loadTemplate(template);
        if (templateContent) {
          html = this.replaceVariables(templateContent, variables);
        }
      }

      // Prepare email options
      const mailOptions = {
        from: `"${SMTP_FROM_NAME}" <${SMTP_FROM_EMAIL}>`,
        to,
        subject,
        text: text || variables.text || subject,
        html: html || undefined
      };

      // Send email
      const info = await this.transporter.sendMail(mailOptions);

      logger.info('[EmailService] Email sent successfully', {
        to,
        subject,
        messageId: info.messageId
      });

      return { success: true, messageId: info.messageId };
    } catch (error) {
      logger.error('[EmailService] Failed to send email:', {
        to,
        subject,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Send welcome email to new user
   */
  async sendWelcomeEmail(user) {
    return this.sendEmail({
      to: user.email,
      subject: 'Welcome to ElSaif Stock Insights',
      template: 'welcome',
      variables: {
        userName: user.name,
        userEmail: user.email,
        subscriptionType: user.subscription?.type || 'free',
        loginUrl: process.env.FRONTEND_URL || 'https://elsaif.com/login',
        year: new Date().getFullYear()
      }
    });
  }

  /**
   * Send password reset email with code (for mobile app)
   */
  async sendPasswordResetCodeEmail(email, code, name, expiresAt) {
    const appName = process.env.APP_NAME || 'Vertex Capital';
    const expiryMinutes = Math.ceil((new Date(expiresAt) - new Date()) / 60000);

    const text = `
Hello ${name},

You requested a password reset for your ${appName} account.

Your password reset code is: ${code}

This code will expire in ${expiryMinutes} minutes.

If you didn't request this password reset, please ignore this email or contact support if you have concerns.

Best regards,
The ${appName} Team
    `.trim();

    const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .container { background-color: #f9f9f9; border-radius: 8px; padding: 30px; border: 1px solid #e0e0e0; }
    .header { text-align: center; margin-bottom: 30px; }
    .header h1 { color: #2c3e50; margin: 0; font-size: 24px; }
    .code-box { background-color: #fff; border: 2px solid #3498db; border-radius: 6px; padding: 20px; text-align: center; margin: 30px 0; }
    .code { font-size: 36px; font-weight: bold; color: #3498db; letter-spacing: 8px; font-family: 'Courier New', monospace; }
    .expiry { color: #e74c3c; font-weight: bold; margin-top: 20px; }
    .warning { background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin-top: 20px; border-radius: 4px; }
    .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #7f8c8d; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>🔐 Password Reset Request</h1></div>
    <p>Hello <strong>${name}</strong>,</p>
    <p>You requested a password reset for your ${appName} account.</p>
    <div class="code-box">
      <p style="margin: 0; color: #7f8c8d; font-size: 14px;">Your Reset Code:</p>
      <div class="code">${code}</div>
      <p class="expiry">⏱ Expires in ${expiryMinutes} minutes</p>
    </div>
    <p>Enter this code in the mobile app to reset your password.</p>
    <div class="warning">
      <strong>⚠️ Security Notice:</strong><br>
      If you didn't request this password reset, please ignore this email or contact our support team immediately.
    </div>
    <div class="footer">
      <p>Best regards,<br>The ${appName} Team</p>
      <p style="margin-top: 20px;">This is an automated email. Please do not reply.</p>
    </div>
  </div>
</body>
</html>
    `.trim();

    return this.sendEmail({ to: email, subject: `Password Reset Code - ${appName}`, text, html });
  }

  /**
   * Send password changed confirmation email
   */
  async sendPasswordChangedEmail(email, name) {
    const appName = process.env.APP_NAME || 'Vertex Capital';

    const text = `
Hello ${name},

This email confirms that your ${appName} account password was successfully changed.

If you made this change, no further action is needed.

If you did NOT make this change, please contact our support team immediately and secure your account.

Best regards,
The ${appName} Team
    `.trim();

    const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .container { background-color: #f9f9f9; border-radius: 8px; padding: 30px; border: 1px solid #e0e0e0; }
    .header { text-align: center; margin-bottom: 30px; }
    .header h1 { color: #27ae60; margin: 0; font-size: 24px; }
    .success-box { background-color: #d4edda; border-left: 4px solid #28a745; padding: 20px; margin: 20px 0; border-radius: 4px; }
    .warning { background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin-top: 20px; border-radius: 4px; }
    .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #7f8c8d; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>✅ Password Changed Successfully</h1></div>
    <p>Hello <strong>${name}</strong>,</p>
    <div class="success-box">
      <strong>✓ Confirmation:</strong><br>
      Your ${appName} account password was successfully changed.
    </div>
    <p>If you made this change, no further action is needed. Your account is secure.</p>
    <div class="warning">
      <strong>⚠️ Didn't make this change?</strong><br>
      If you did NOT change your password, please contact our support team immediately to secure your account.
    </div>
    <div class="footer">
      <p>Best regards,<br>The ${appName} Team</p>
      <p style="margin-top: 20px;">This is an automated email. Please do not reply.</p>
    </div>
  </div>
</body>
</html>
    `.trim();

    return this.sendEmail({ to: email, subject: `Password Changed Successfully - ${appName}`, text, html });
  }

  /**
   * Send password reset email (legacy - for web with token)
   */
  async sendPasswordResetEmail(user, resetToken) {
    const resetUrl = `${process.env.FRONTEND_URL || 'https://elsaif.com'}/reset-password?token=${resetToken}`;

    return this.sendEmail({
      to: user.email,
      subject: 'Password Reset Request',
      template: 'passwordReset',
      variables: {
        userName: user.name,
        resetUrl,
        expiryTime: '1 hour',
        year: new Date().getFullYear()
      }
    });
  }

  /**
   * Send email verification
   */
  async sendVerificationEmail(user, verificationToken) {
    const verificationUrl = `${process.env.FRONTEND_URL || 'https://elsaif.com'}/verify-email?token=${verificationToken}`;

    return this.sendEmail({
      to: user.email,
      subject: 'Verify Your Email Address',
      template: 'emailVerification',
      variables: {
        userName: user.name,
        verificationUrl,
        year: new Date().getFullYear()
      }
    });
  }

  /**
   * Send subscription confirmation email
   */
  async sendSubscriptionConfirmation(user, subscription) {
    return this.sendEmail({
      to: user.email,
      subject: `Subscription Confirmed: ${subscription.type}`,
      template: 'subscriptionConfirmation',
      variables: {
        userName: user.name,
        subscriptionType: subscription.type,
        startDate: subscription.startDate.toLocaleDateString(),
        endDate: subscription.endDate?.toLocaleDateString() || 'N/A',
        features: this.getSubscriptionFeatures(subscription.type),
        year: new Date().getFullYear()
      }
    });
  }

  /**
   * Send new insight notification to subscribers
   */
  async sendNewInsightNotification(user, insight) {
    const insightUrl = `${process.env.FRONTEND_URL || 'https://elsaif.com'}/insights/${insight._id}`;

    return this.sendEmail({
      to: user.email,
      subject: `New Insight: ${insight.title}`,
      template: 'newInsight',
      variables: {
        userName: user.name,
        insightTitle: insight.title,
        insightExcerpt: insight.excerpt,
        insightUrl,
        category: insight.category,
        publishedAt: insight.publishedAt?.toLocaleDateString() || 'Today',
        year: new Date().getFullYear()
      }
    });
  }

  /**
   * Send weekly digest email
   */
  async sendWeeklyDigest(user, insights) {
    const insightList = insights.map(insight => ({
      title: insight.title,
      excerpt: insight.excerpt,
      url: `${process.env.FRONTEND_URL || 'https://elsaif.com'}/insights/${insight._id}`,
      category: insight.category,
      views: insight.analytics?.views || 0
    }));

    return this.sendEmail({
      to: user.email,
      subject: 'Your Weekly Stock Insights Digest',
      template: 'weeklyDigest',
      variables: {
        userName: user.name,
        insights: JSON.stringify(insightList),
        insightCount: insights.length,
        dashboardUrl: `${process.env.FRONTEND_URL || 'https://elsaif.com'}/dashboard`,
        year: new Date().getFullYear()
      }
    });
  }

  /**
   * Send comment reply notification
   */
  async sendCommentReplyNotification(user, comment, reply) {
    const commentUrl = `${process.env.FRONTEND_URL || 'https://elsaif.com'}/insights/${comment.insightId}#comment-${reply._id}`;

    return this.sendEmail({
      to: user.email,
      subject: 'New Reply to Your Comment',
      template: 'commentReply',
      variables: {
        userName: user.name,
        replyAuthor: reply.author?.name || 'Someone',
        replyContent: reply.content.substring(0, 200),
        commentUrl,
        year: new Date().getFullYear()
      }
    });
  }

  /**
   * Send follow notification
   */
  async sendFollowNotification(user, follower) {
    const profileUrl = `${process.env.FRONTEND_URL || 'https://elsaif.com'}/profile/${follower._id}`;

    return this.sendEmail({
      to: user.email,
      subject: `${follower.name} is now following you`,
      template: 'newFollower',
      variables: {
        userName: user.name,
        followerName: follower.name,
        followerProfile: profileUrl,
        year: new Date().getFullYear()
      }
    });
  }

  /**
   * Get subscription features description
   */
  getSubscriptionFeatures(type) {
    const features = {
      free: '• Access to free insights\n• Basic market updates\n• Community features',
      premium: '• All free features\n• Premium insights\n• Advanced analytics\n• Priority support\n• Ad-free experience',
      vip: '• All premium features\n• Exclusive VIP insights\n• 1-on-1 consultations\n• Early access to new features\n• Custom market analysis'
    };
    return features[type] || features.free;
  }

  /**
   * Close transporter connection
   */
  async close() {
    if (this.transporter) {
      this.transporter.close();
      this.isInitialized = false;
      logger.info('[EmailService] Closed successfully');
    }
  }
}

// Export singleton instance
const emailService = new EmailService();
module.exports = emailService;
