const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');
const Subscription = require('../src/models/Subscription');
const Insight = require('../src/models/Insight');
const { SUBSCRIPTION_TIERS, SUBSCRIPTION_STATUS, ROLES } = require('../src/constants');
require('./setup');

describe('Subscription System Tests', () => {
  let freeUser, premiumUser, adminUser;
  let freeUserToken, premiumUserToken, adminToken;
  let freeInsight, premiumInsight;

  beforeEach(async () => {
    // Create test users
    const freeUserRes = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Free User',
        email: 'free@example.com',
        password: 'password123'
      });

    freeUser = freeUserRes.body.data.user;
    freeUserToken = freeUserRes.body.data.token;

    const premiumUserRes = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Premium User',
        email: 'premium@example.com',
        password: 'password123'
      });

    premiumUser = premiumUserRes.body.data.user;
    premiumUserToken = premiumUserRes.body.data.token;

    // Grant premium subscription to premium user
    const premiumSubscription = await Subscription.findOne({ user: premiumUser.id });
    await premiumSubscription.upgrade({
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      source: 'manual',
      reason: 'Test setup'
    });

    // Create admin user
    const adminUserDoc = await User.create({
      name: 'Admin User',
      email: 'admin@example.com',
      password: 'password123',
      role: ROLES.ADMIN
    });

    adminUser = adminUserDoc.toObject();

    // Login as admin to get token
    const adminLoginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@example.com',
        password: 'password123'
      });

    adminToken = adminLoginRes.body.data.token;

    // Create test insights
    freeInsight = await Insight.create({
      title: 'Free Market Analysis',
      content: 'This is a free insight available to all users.',
      excerpt: 'Free insight excerpt',
      type: 'free',
      category: 'market_analysis',
      author: adminUser._id,
      status: 'published'
    });

    premiumInsight = await Insight.create({
      title: 'Premium Trading Strategy',
      content: 'This is a premium insight only available to premium subscribers.',
      excerpt: 'Premium insight excerpt',
      type: 'premium',
      category: 'strategy',
      author: adminUser._id,
      status: 'published'
    });
  });

  // ==================== SUBSCRIPTION ACCESS CONTROL TESTS ====================

  describe('Content Access Control', () => {
    describe('Free User Access', () => {
      it('should allow free user to access free content', async () => {
        const res = await request(app)
          .get(`/api/insights/published/${freeInsight._id}`)
          .set('Authorization', `Bearer ${freeUserToken}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.insight.title).toBe(freeInsight.title);
      });

      it('should deny free user access to premium content', async () => {
        const res = await request(app)
          .get(`/api/insights/published/${premiumInsight._id}`)
          .set('Authorization', `Bearer ${freeUserToken}`);

        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toContain('Premium subscription required');
        expect(res.body.preview).toBeDefined();
        expect(res.body.preview.excerpt).toBeDefined();
        expect(res.body.upgrade).toBeDefined();
      });

      it('should filter out premium insights from list endpoint', async () => {
        const res = await request(app)
          .get('/api/insights/published')
          .set('Authorization', `Bearer ${freeUserToken}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);

        const insights = res.body.data.insights;
        const hasPremium = insights.some(i => i.type === 'premium');

        expect(hasPremium).toBe(false);
      });
    });

    describe('Premium User Access', () => {
      it('should allow premium user to access free content', async () => {
        const res = await request(app)
          .get(`/api/insights/published/${freeInsight._id}`)
          .set('Authorization', `Bearer ${premiumUserToken}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      });

      it('should allow premium user to access premium content', async () => {
        const res = await request(app)
          .get(`/api/insights/published/${premiumInsight._id}`)
          .set('Authorization', `Bearer ${premiumUserToken}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.insight.title).toBe(premiumInsight.title);
        expect(res.body.data.insight.content).toBeDefined();
      });

      it('should include premium insights in list endpoint', async () => {
        const res = await request(app)
          .get('/api/insights/published')
          .set('Authorization', `Bearer ${premiumUserToken}`);

        expect(res.status).toBe(200);
        const insights = res.body.data.insights;
        const hasPremium = insights.some(i => i.type === 'premium');

        expect(hasPremium).toBe(true);
      });
    });

    describe('Unauthenticated Access', () => {
      it('should allow unauthenticated users to access free content', async () => {
        const res = await request(app)
          .get(`/api/insights/published/${freeInsight._id}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      });

      it('should deny unauthenticated users access to premium content', async () => {
        const res = await request(app)
          .get(`/api/insights/published/${premiumInsight._id}`);

        expect(res.status).toBe(403);
        expect(res.body.preview).toBeDefined();
      });

      it('should filter out premium insights for unauthenticated users', async () => {
        const res = await request(app)
          .get('/api/insights/published');

        expect(res.status).toBe(200);
        const insights = res.body.data.insights;
        const hasPremium = insights.some(i => i.type === 'premium');

        expect(hasPremium).toBe(false);
      });
    });

    describe('Admin Access', () => {
      it('should allow admin to access free content', async () => {
        const res = await request(app)
          .get(`/api/insights/published/${freeInsight._id}`)
          .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      });

      it('should allow admin to access premium content (bypass subscription)', async () => {
        const res = await request(app)
          .get(`/api/insights/published/${premiumInsight._id}`)
          .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.insight.content).toBeDefined();
      });
    });
  });

  // ==================== SUBSCRIPTION EXPIRATION TESTS ====================

  describe('Subscription Expiration', () => {
    it('should deny access when subscription expires', async () => {
      // Create user with expired subscription
      const expiredUserRes = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Expired User',
          email: 'expired@example.com',
          password: 'password123'
        });

      const expiredToken = expiredUserRes.body.data.token;
      const expiredUserId = expiredUserRes.body.data.user.id;

      // Grant premium with past end date
      const subscription = await Subscription.findOne({ user: expiredUserId });
      await subscription.upgrade({
        endDate: new Date(Date.now() - 1000), // Already expired
        source: 'manual',
        reason: 'Test expired'
      });

      // Try to access premium content
      const res = await request(app)
        .get(`/api/insights/published/${premiumInsight._id}`)
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.preview).toBeDefined();
    });

    it('should detect expiration through virtual property', async () => {
      const subscription = await Subscription.findOne({ user: premiumUser.id });

      // Set end date to past
      subscription.endDate = new Date(Date.now() - 1000);
      await subscription.save();

      // Re-fetch and check virtual
      const refreshed = await Subscription.findById(subscription._id);

      expect(refreshed.isExpired).toBe(true);
      expect(refreshed.isPremium).toBe(false);
    });

    it('should auto-expire on save when end date passed', async () => {
      const subscription = await Subscription.findOne({ user: premiumUser.id });

      subscription.endDate = new Date(Date.now() - 1000);
      await subscription.save();

      expect(subscription.status).toBe(SUBSCRIPTION_STATUS.EXPIRED);
      expect(subscription.tier).toBe(SUBSCRIPTION_TIERS.FREE);
    });
  });

  // ==================== ADMIN SUBSCRIPTION MANAGEMENT TESTS ====================

  describe('Admin Subscription Management', () => {
    it('should allow admin to grant premium subscription', async () => {
      const res = await request(app)
        .post('/api/subscriptions/grant')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: freeUser.id,
          endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          reason: 'Promotional grant',
          source: 'promotion'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.subscription.tier).toBe(SUBSCRIPTION_TIERS.PREMIUM);

      // Verify user can now access premium content
      const contentRes = await request(app)
        .get(`/api/insights/published/${premiumInsight._id}`)
        .set('Authorization', `Bearer ${freeUserToken}`);

      expect(contentRes.status).toBe(200);
      expect(contentRes.body.data.insight.content).toBeDefined();
    });

    it('should allow admin to revoke premium subscription', async () => {
      const res = await request(app)
        .post('/api/subscriptions/revoke')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: premiumUser.id,
          reason: 'Policy violation'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify user can no longer access premium content
      const contentRes = await request(app)
        .get(`/api/insights/published/${premiumInsight._id}`)
        .set('Authorization', `Bearer ${premiumUserToken}`);

      expect(contentRes.status).toBe(403);
    });

    it('should allow admin to extend subscription', async () => {
      const subscription = await Subscription.findOne({ user: premiumUser.id });
      const oldEndDate = subscription.endDate;

      const newEndDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000); // 60 days

      const res = await request(app)
        .patch(`/api/subscriptions/${subscription._id}/extend`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          endDate: newEndDate.toISOString(),
          reason: 'Extension reward'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(new Date(res.body.data.subscription.endDate)).toEqual(newEndDate);
    });

    it('should get subscription statistics', async () => {
      const res = await request(app)
        .get('/api/subscriptions/stats')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.stats).toBeDefined();
      expect(res.body.data.stats.totalByTier).toBeDefined();
      expect(res.body.data.stats.totalByStatus).toBeDefined();
    });

    it('should reject non-admin subscription grant', async () => {
      const res = await request(app)
        .post('/api/subscriptions/grant')
        .set('Authorization', `Bearer ${freeUserToken}`)
        .send({
          userId: freeUser.id,
          endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        });

      expect(res.status).toBe(403);
    });
  });

  // ==================== USER SUBSCRIPTION ENDPOINTS TESTS ====================

  describe('User Subscription Endpoints', () => {
    it('should allow user to view their subscription', async () => {
      const res = await request(app)
        .get('/api/subscriptions/me')
        .set('Authorization', `Bearer ${premiumUserToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.subscription.tier).toBe(SUBSCRIPTION_TIERS.PREMIUM);
      expect(res.body.data.subscription.hasPremiumAccess).toBe(true);
    });

    it('should allow user to cancel their subscription', async () => {
      const res = await request(app)
        .post('/api/subscriptions/cancel')
        .set('Authorization', `Bearer ${premiumUserToken}`)
        .send({
          reason: 'No longer needed'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return subscription benefits (public endpoint)', async () => {
      const res = await request(app)
        .get('/api/subscriptions/benefits');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.tiers.free).toBeDefined();
      expect(res.body.data.tiers.premium).toBeDefined();
    });
  });

  // ==================== CACHE TESTS ====================

  describe('Subscription-Aware Caching', () => {
    it('should cache featured insights separately per subscription tier', async () => {
      // Create featured insights
      freeInsight.featured = true;
      await freeInsight.save();

      premiumInsight.featured = true;
      await premiumInsight.save();

      // Free user request (should cache with tier=free)
      const freeRes1 = await request(app)
        .get('/api/insights/featured')
        .set('Authorization', `Bearer ${freeUserToken}`);

      // Premium user request (should cache with tier=premium)
      const premiumRes1 = await request(app)
        .get('/api/insights/featured')
        .set('Authorization', `Bearer ${premiumUserToken}`);

      expect(freeRes1.body.data.insights.length).toBeLessThan(premiumRes1.body.data.insights.length);
    });

    it('should invalidate cache when user subscription changes', async () => {
      // Get initial insights as free user
      const beforeRes = await request(app)
        .get('/api/insights/published')
        .set('Authorization', `Bearer ${freeUserToken}`);

      const beforeCount = beforeRes.body.data.insights.length;

      // Grant premium to free user
      await request(app)
        .post('/api/subscriptions/grant')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: freeUser.id,
          endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          reason: 'Test grant'
        });

      // Get insights again (should see premium content now)
      const afterRes = await request(app)
        .get('/api/insights/published')
        .set('Authorization', `Bearer ${freeUserToken}`);

      const afterCount = afterRes.body.data.insights.length;

      expect(afterCount).toBeGreaterThanOrEqual(beforeCount);

      // Check if premium content is now visible
      const hasPremium = afterRes.body.data.insights.some(i => i.type === 'premium');
      expect(hasPremium).toBe(true);
    });
  });

  // ==================== EDGE CASE TESTS ====================

  describe('Edge Cases', () => {
    it('should handle deleted insights correctly', async () => {
      await freeInsight.softDelete(adminUser._id);

      const res = await request(app)
        .get('/api/insights/published');

      const deleted = res.body.data.insights.some(i => i._id === freeInsight._id.toString());
      expect(deleted).toBe(false);
    });

    it('should handle unpublished insights correctly', async () => {
      freeInsight.status = 'draft';
      await freeInsight.save();

      const res = await request(app)
        .get('/api/insights/published');

      const draft = res.body.data.insights.some(i => i._id === freeInsight._id.toString());
      expect(draft).toBe(false);
    });

    it('should create default subscription on user registration', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'New User',
          email: 'newuser@example.com',
          password: 'password123'
        });

      expect(res.status).toBe(201);

      const subscription = await Subscription.findOne({ user: res.body.data.user.id });

      expect(subscription).toBeDefined();
      expect(subscription.tier).toBe(SUBSCRIPTION_TIERS.FREE);
      expect(subscription.status).toBe(SUBSCRIPTION_STATUS.ACTIVE);
    });

    it('should handle concurrent subscription updates safely', async () => {
      const subscription = await Subscription.findOne({ user: freeUser.id });

      // Simulate concurrent updates
      const updates = [
        subscription.upgrade({ endDate: new Date(Date.now() + 10000), source: 'manual', reason: 'Test 1' }),
        subscription.upgrade({ endDate: new Date(Date.now() + 20000), source: 'manual', reason: 'Test 2' })
      ];

      // Should not throw error
      await expect(Promise.all(updates)).resolves.toBeDefined();
    });
  });

  // ==================== VALIDATION TESTS ====================

  describe('Input Validation', () => {
    it('should reject invalid subscription grant (missing userId)', async () => {
      const res = await request(app)
        .post('/api/subscriptions/grant')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          endDate: new Date().toISOString()
        });

      expect(res.status).toBe(400);
    });

    it('should reject invalid subscription grant (past end date)', async () => {
      const res = await request(app)
        .post('/api/subscriptions/grant')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: freeUser.id,
          endDate: new Date(Date.now() - 1000).toISOString()
        });

      expect(res.status).toBe(400);
      expect(res.body.errors).toBeDefined();
    });

    it('should reject invalid subscription source', async () => {
      const res = await request(app)
        .post('/api/subscriptions/grant')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: freeUser.id,
          source: 'invalid_source'
        });

      expect(res.status).toBe(400);
    });
  });
});
