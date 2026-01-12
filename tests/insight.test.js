const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Insight = require('../src/models/Insight');
const User = require('../src/models/User');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  await Insight.deleteMany({});
  await User.deleteMany({});
});

describe('Insight Content Management', () => {
  describe('Insight Creation', () => {
    it('should create a free insight', async () => {
      const author = await User.create({
        name: 'Admin',
        email: 'admin@test.com',
        password: 'password123',
        role: 'admin'
      });

      const insight = await Insight.create({
        title: 'Market Analysis for 2024',
        content: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(50),
        excerpt: 'A comprehensive analysis of market trends',
        type: 'free',
        category: 'market_analysis',
        author: author._id,
        status: 'published'
      });

      expect(insight.title).toBe('Market Analysis for 2024');
      expect(insight.type).toBe('free');
      expect(insight.status).toBe('published');
      expect(insight.slug).toContain('market-analysis-for-2024');
      expect(insight.readTime).toBeGreaterThan(0);
    });

    it('should create a premium insight', async () => {
      const author = await User.create({
        name: 'Admin',
        email: 'admin@test.com',
        password: 'password123',
        role: 'admin'
      });

      const insight = await Insight.create({
        title: 'Advanced Trading Strategies',
        content: 'Premium content here for paid users',
        excerpt: 'Exclusive strategies for premium members',
        type: 'premium',
        category: 'trading_tips',
        author: author._id,
        status: 'published'
      });

      expect(insight.type).toBe('premium');
    });

    it('should auto-generate slug from title', async () => {
      const author = await User.create({
        name: 'Admin',
        email: 'admin@test.com',
        password: 'password123',
        role: 'admin'
      });

      const insight = await Insight.create({
        title: 'My Amazing Insight Title',
        content: 'This is a longer content for testing purposes',
        author: author._id
      });

      expect(insight.slug).toMatch(/^my-amazing-insight-title-\d+$/);
    });

    it('should calculate read time automatically', async () => {
      const author = await User.create({
        name: 'Admin',
        email: 'admin@test.com',
        password: 'password123',
        role: 'admin'
      });

      // 400 words = ~2 minutes read time (at 200 words/min)
      const content = 'word '.repeat(400);

      const insight = await Insight.create({
        title: 'Test Insight',
        content,
        author: author._id
      });

      // 400 words / 200 words per minute = 2 minutes, but Math.ceil may round up
      expect(insight.readTime).toBeGreaterThanOrEqual(2);
      expect(insight.readTime).toBeLessThanOrEqual(3);
    });
  });

  describe('Insight Status Management', () => {
    it('should create insight in draft status by default', async () => {
      const author = await User.create({
        name: 'Admin',
        email: 'admin@test.com',
        password: 'password123',
        role: 'admin'
      });

      const insight = await Insight.create({
        title: 'Draft Insight',
        content: 'Work in progress with enough content to pass validation',
        author: author._id
      });

      expect(insight.status).toBe('draft');
    });

    it('should allow status transitions', async () => {
      const author = await User.create({
        name: 'Admin',
        email: 'admin@test.com',
        password: 'password123',
        role: 'admin'
      });

      const insight = await Insight.create({
        title: 'Test Insight',
        content: 'Content here with enough text to pass validation requirements',
        author: author._id,
        status: 'draft'
      });

      insight.status = 'published';
      await insight.save();
      expect(insight.status).toBe('published');

      insight.status = 'archived';
      await insight.save();
      expect(insight.status).toBe('archived');
    });

    it('should support under_review status', async () => {
      const author = await User.create({
        name: 'Admin',
        email: 'admin@test.com',
        password: 'password123',
        role: 'admin'
      });

      const insight = await Insight.create({
        title: 'Review Needed',
        content: 'Content under review with enough text',
        author: author._id,
        status: 'under_review',
        moderationNotes: 'Needs fact-checking'
      });

      expect(insight.status).toBe('under_review');
      expect(insight.moderationNotes).toBe('Needs fact-checking');
    });
  });

  describe('Featured Insights', () => {
    it('should mark insight as featured', async () => {
      const author = await User.create({
        name: 'Admin',
        email: 'admin@test.com',
        password: 'password123',
        role: 'admin'
      });

      const insight = await Insight.create({
        title: 'Featured Insight',
        content: 'Great content with enough characters to pass validation',
        author: author._id,
        featured: true
      });

      expect(insight.featured).toBe(true);
    });

    it('should find featured insights', async () => {
      const author = await User.create({
        name: 'Admin',
        email: 'admin@test.com',
        password: 'password123',
        role: 'admin'
      });

      await Insight.create({
        title: 'Featured 1',
        content: 'Valid content for testing',
        author: author._id,
        featured: true,
        status: 'published'
      });

      await Insight.create({
        title: 'Not Featured',
        content: 'Valid content for testing',
        author: author._id,
        featured: false,
        status: 'published'
      });

      const featured = await Insight.find({ featured: true, status: 'published' });

      expect(featured).toHaveLength(1);
      expect(featured[0].title).toBe('Featured 1');
    });
  });

  describe('Soft Delete', () => {
    it('should soft delete insight', async () => {
      const author = await User.create({
        name: 'Admin',
        email: 'admin@test.com',
        password: 'password123',
        role: 'admin'
      });

      const insight = await Insight.create({
        title: 'To Be Deleted',
        content: 'Valid content for testing',
        author: author._id
      });

      insight.isDeleted = true;
      insight.deletedAt = new Date();
      await insight.save();

      expect(insight.isDeleted).toBe(true);
      expect(insight.deletedAt).toBeDefined();
    });

    it('should exclude soft deleted insights from queries', async () => {
      const author = await User.create({
        name: 'Admin',
        email: 'admin@test.com',
        password: 'password123',
        role: 'admin'
      });

      await Insight.create({
        title: 'Active Insight',
        content: 'Valid content for testing',
        author: author._id,
        status: 'published'
      });

      await Insight.create({
        title: 'Deleted Insight',
        content: 'Valid content for testing',
        author: author._id,
        status: 'published',
        isDeleted: true
      });

      const activeInsights = await Insight.find({ isDeleted: false });

      expect(activeInsights).toHaveLength(1);
      expect(activeInsights[0].title).toBe('Active Insight');
    });

    it('should restore soft deleted insight', async () => {
      const author = await User.create({
        name: 'Admin',
        email: 'admin@test.com',
        password: 'password123',
        role: 'admin'
      });

      const insight = await Insight.create({
        title: 'Deleted Insight',
        content: 'Valid content for testing',
        author: author._id,
        isDeleted: true,
        deletedAt: new Date()
      });

      insight.isDeleted = false;
      insight.deletedAt = null;
      await insight.save();

      expect(insight.isDeleted).toBe(false);
      expect(insight.deletedAt).toBeNull();
    });
  });

  describe('Views and Likes', () => {
    it('should increment view count', async () => {
      const author = await User.create({
        name: 'Admin',
        email: 'admin@test.com',
        password: 'password123',
        role: 'admin'
      });

      const insight = await Insight.create({
        title: 'Popular Insight',
        content: 'Valid content for testing',
        author: author._id
      });

      insight.views += 1;
      await insight.save();
      expect(insight.views).toBe(1);

      insight.views += 1;
      await insight.save();
      expect(insight.views).toBe(2);
    });

    it('should increment like count', async () => {
      const author = await User.create({
        name: 'Admin',
        email: 'admin@test.com',
        password: 'password123',
        role: 'admin'
      });

      const insight = await Insight.create({
        title: 'Liked Insight',
        content: 'Valid content for testing',
        author: author._id
      });

      insight.likes += 1;
      await insight.save();
      expect(insight.likes).toBe(1);
    });
  });

  describe('Categories', () => {
    it('should validate category', async () => {
      const author = await User.create({
        name: 'Admin',
        email: 'admin@test.com',
        password: 'password123',
        role: 'admin'
      });

      const insight = await Insight.create({
        title: 'Categorized Insight',
        content: 'Valid content for testing',
        author: author._id,
        category: 'trading_tips'
      });

      expect(insight.category).toBe('trading_tips');
    });

    it('should filter by category', async () => {
      const author = await User.create({
        name: 'Admin',
        email: 'admin@test.com',
        password: 'password123',
        role: 'admin'
      });

      await Insight.create({
        title: 'Market Analysis',
        content: 'Valid content for testing',
        author: author._id,
        category: 'market_analysis',
        status: 'published'
      });

      await Insight.create({
        title: 'Trading Tip',
        content: 'Valid content for testing',
        author: author._id,
        category: 'trading_tips',
        status: 'published'
      });

      const marketInsights = await Insight.find({
        category: 'market_analysis',
        status: 'published'
      });

      expect(marketInsights).toHaveLength(1);
      expect(marketInsights[0].title).toBe('Market Analysis');
    });
  });

  describe('Moderation', () => {
    it('should record moderation details', async () => {
      const author = await User.create({
        name: 'Author',
        email: 'author@test.com',
        password: 'password123',
        role: 'user'
      });

      const moderator = await User.create({
        name: 'Moderator',
        email: 'moderator@test.com',
        password: 'password123',
        role: 'admin'
      });

      const insight = await Insight.create({
        title: 'Moderated Insight',
        content: 'Valid content for testing',
        author: author._id,
        status: 'under_review',
        moderationNotes: 'Needs revision',
        moderatedBy: moderator._id,
        moderatedAt: new Date()
      });

      expect(insight.moderationNotes).toBe('Needs revision');
      expect(insight.moderatedBy).toEqual(moderator._id);
      expect(insight.moderatedAt).toBeDefined();
    });
  });

  describe('Search and Filtering', () => {
    it('should filter by type', async () => {
      const author = await User.create({
        name: 'Admin',
        email: 'admin@test.com',
        password: 'password123',
        role: 'admin'
      });

      await Insight.create({
        title: 'Free Insight',
        content: 'Valid content for testing',
        author: author._id,
        type: 'free',
        status: 'published'
      });

      await Insight.create({
        title: 'Premium Insight',
        content: 'Valid content for testing',
        author: author._id,
        type: 'premium',
        status: 'published'
      });

      const freeInsights = await Insight.find({ type: 'free', status: 'published' });
      const premiumInsights = await Insight.find({ type: 'premium', status: 'published' });

      expect(freeInsights).toHaveLength(1);
      expect(premiumInsights).toHaveLength(1);
    });

    it('should filter by author', async () => {
      const author1 = await User.create({
        name: 'Author 1',
        email: 'author1@test.com',
        password: 'password123',
        role: 'admin'
      });

      const author2 = await User.create({
        name: 'Author 2',
        email: 'author2@test.com',
        password: 'password123',
        role: 'admin'
      });

      await Insight.create({
        title: 'Insight by Author 1',
        content: 'Valid content for testing',
        author: author1._id,
        status: 'published'
      });

      await Insight.create({
        title: 'Insight by Author 2',
        content: 'Valid content for testing',
        author: author2._id,
        status: 'published'
      });

      const author1Insights = await Insight.find({ author: author1._id });

      expect(author1Insights).toHaveLength(1);
      expect(author1Insights[0].title).toBe('Insight by Author 1');
    });

    it('should sort by views', async () => {
      const author = await User.create({
        name: 'Admin',
        email: 'admin@test.com',
        password: 'password123',
        role: 'admin'
      });

      const insight1 = await Insight.create({
        title: 'Low Views',
        content: 'Valid content for testing',
        author: author._id,
        views: 10
      });

      const insight2 = await Insight.create({
        title: 'High Views',
        content: 'Valid content for testing',
        author: author._id,
        views: 100
      });

      const insights = await Insight.find().sort({ views: -1 });

      expect(insights[0].title).toBe('High Views');
      expect(insights[1].title).toBe('Low Views');
    });
  });

  describe('Timestamps', () => {
    it('should automatically set createdAt and updatedAt', async () => {
      const author = await User.create({
        name: 'Admin',
        email: 'admin@test.com',
        password: 'password123',
        role: 'admin'
      });

      const insight = await Insight.create({
        title: 'Timestamped Insight',
        content: 'Valid content for testing',
        author: author._id
      });

      expect(insight.createdAt).toBeDefined();
      expect(insight.updatedAt).toBeDefined();
    });

    it('should update updatedAt on modification', async () => {
      const author = await User.create({
        name: 'Admin',
        email: 'admin@test.com',
        password: 'password123',
        role: 'admin'
      });

      const insight = await Insight.create({
        title: 'Test Insight',
        content: 'Original content with enough characters',
        author: author._id
      });

      const originalUpdatedAt = insight.updatedAt;

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 100));

      insight.content = 'Updated content with more text';
      await insight.save();

      expect(insight.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });
  });
});
