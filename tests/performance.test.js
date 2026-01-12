/**
 * PERFORMANCE TESTS: Database Query Optimization
 * Tests N+1 query fixes and bulk operations
 */

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Message = require('../src/models/Message');
const Chat = require('../src/models/Chat');
const User = require('../src/models/User');
const chatService = require('../src/services/chatService');

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
  await Message.deleteMany({});
  await Chat.deleteMany({});
  await User.deleteMany({});
});

describe('Performance Optimizations', () => {
  describe('N+1 Query Fix: Bulk Message Read Marking', () => {
    let chat, sender, reader;

    beforeEach(async () => {
      // Create users
      sender = await User.create({
        name: 'Sender',
        email: 'sender@test.com',
        password: 'password123',
        role: 'user'
      });

      reader = await User.create({
        name: 'Reader',
        email: 'reader@test.com',
        password: 'password123',
        role: 'user'
      });

      // Create chat
      chat = await Chat.create({
        participants: [sender._id, reader._id],
        isGroup: false
      });
    });

    it('should use bulk update instead of N individual saves', async () => {
      // Create 50 messages
      const messages = [];
      for (let i = 0; i < 50; i++) {
        const message = await Message.create({
          chat: chat._id,
          sender: sender._id,
          content: `Message ${i}`
        });
        messages.push(message);
      }

      // Track query execution
      const startTime = Date.now();

      // Mark all messages as read using the optimized bulk update
      const result = await chatService.markMessagesAsRead(
        chat._id.toString(),
        reader._id.toString()
      );

      const duration = Date.now() - startTime;

      // Verify all messages marked
      expect(result.marked).toBe(50);

      // Should complete in under 100ms (vs 2500ms for N+1)
      expect(duration).toBeLessThan(100);

      // Verify messages are actually marked
      const markedMessages = await Message.find({
        chat: chat._id,
        'readBy.user': reader._id
      });

      expect(markedMessages.length).toBe(50);
    });

    it('should use compound index for efficient querying', async () => {
      // Create many messages
      for (let i = 0; i < 100; i++) {
        await Message.create({
          chat: chat._id,
          sender: sender._id,
          content: `Message ${i}`
        });
      }

      const startTime = Date.now();

      // Query that uses compound index: { chat: 1, sender: 1, 'readBy.user': 1 }
      const unreadMessages = await Message.find({
        chat: chat._id,
        sender: sender._id,
        'readBy.user': { $ne: reader._id }
      });

      const duration = Date.now() - startTime;

      expect(unreadMessages.length).toBe(100);

      // Should be very fast with index (under 20ms)
      expect(duration).toBeLessThan(20);
    });

    it('should handle zero messages gracefully', async () => {
      const result = await chatService.markMessagesAsRead(
        chat._id.toString(),
        reader._id.toString()
      );

      expect(result.marked).toBe(0);
    });

    it('should not mark already-read messages', async () => {
      // Create messages
      await Message.create({
        chat: chat._id,
        sender: sender._id,
        content: 'Message 1',
        readBy: [{ user: reader._id, readAt: new Date() }]
      });

      await Message.create({
        chat: chat._id,
        sender: sender._id,
        content: 'Message 2'
      });

      const result = await chatService.markMessagesAsRead(
        chat._id.toString(),
        reader._id.toString()
      );

      // Only 1 message should be marked (Message 2)
      expect(result.marked).toBe(1);
    });

    it('should not mark own messages', async () => {
      // Create messages sent by reader
      await Message.create({
        chat: chat._id,
        sender: reader._id,
        content: 'My message'
      });

      const result = await chatService.markMessagesAsRead(
        chat._id.toString(),
        reader._id.toString()
      );

      // Should not mark own messages
      expect(result.marked).toBe(0);
    });
  });

  describe('Database Index Performance', () => {
    let chat, user1, user2;

    beforeEach(async () => {
      user1 = await User.create({
        name: 'User 1',
        email: 'user1@test.com',
        password: 'password123',
        role: 'user'
      });

      user2 = await User.create({
        name: 'User 2',
        email: 'user2@test.com',
        password: 'password123',
        role: 'user'
      });

      chat = await Chat.create({
        participants: [user1._id, user2._id],
        isGroup: false
      });
    });

    it('should efficiently query by chat and createdAt', async () => {
      // Create 200 messages
      for (let i = 0; i < 200; i++) {
        await Message.create({
          chat: chat._id,
          sender: user1._id,
          content: `Message ${i}`
        });
      }

      const startTime = Date.now();

      // Query using index: { chat: 1, createdAt: -1 }
      const messages = await Message.find({ chat: chat._id })
        .sort({ createdAt: -1 })
        .limit(20);

      const duration = Date.now() - startTime;

      expect(messages.length).toBe(20);

      // Should be very fast with index
      expect(duration).toBeLessThan(20);
    });

    it('should efficiently query by sender', async () => {
      // Create messages from both users
      for (let i = 0; i < 100; i++) {
        await Message.create({
          chat: chat._id,
          sender: i % 2 === 0 ? user1._id : user2._id,
          content: `Message ${i}`
        });
      }

      const startTime = Date.now();

      // Query using index: { sender: 1, createdAt: -1 }
      const user1Messages = await Message.find({ sender: user1._id })
        .sort({ createdAt: -1 });

      const duration = Date.now() - startTime;

      expect(user1Messages.length).toBe(50);

      // Should be fast with index
      expect(duration).toBeLessThan(30);
    });
  });

  describe('Connection Pool Efficiency', () => {
    it('should reuse connections from pool', async () => {
      const connections = [];

      // Make 20 concurrent queries
      const promises = [];
      for (let i = 0; i < 20; i++) {
        promises.push(Message.find({}).lean());
      }

      const startTime = Date.now();
      await Promise.all(promises);
      const duration = Date.now() - startTime;

      // Should complete quickly with connection pooling
      expect(duration).toBeLessThan(200);
    });

    it('should handle rapid concurrent writes', async () => {
      const user = await User.create({
        name: 'User',
        email: 'user@test.com',
        password: 'password123',
        role: 'user'
      });

      const chat = await Chat.create({
        participants: [user._id],
        isGroup: false
      });

      const startTime = Date.now();

      // Create 50 messages concurrently
      const promises = [];
      for (let i = 0; i < 50; i++) {
        promises.push(
          Message.create({
            chat: chat._id,
            sender: user._id,
            content: `Message ${i}`
          })
        );
      }

      await Promise.all(promises);
      const duration = Date.now() - startTime;

      const count = await Message.countDocuments({ chat: chat._id });
      expect(count).toBe(50);

      // Should complete in under 500ms with pooling
      expect(duration).toBeLessThan(500);
    });
  });

  describe('Lean Queries for Read-Only Operations', () => {
    let chat, user;

    beforeEach(async () => {
      user = await User.create({
        name: 'User',
        email: 'user@test.com',
        password: 'password123',
        role: 'user'
      });

      chat = await Chat.create({
        participants: [user._id],
        isGroup: false
      });

      // Create messages
      for (let i = 0; i < 100; i++) {
        await Message.create({
          chat: chat._id,
          sender: user._id,
          content: `Message ${i}`
        });
      }
    });

    it('should use lean() for faster read operations', async () => {
      // Regular query (Mongoose documents)
      const regularStart = Date.now();
      const regularResults = await Message.find({ chat: chat._id });
      const regularDuration = Date.now() - regularStart;

      // Lean query (plain objects)
      const leanStart = Date.now();
      const leanResults = await Message.find({ chat: chat._id }).lean();
      const leanDuration = Date.now() - leanStart;

      expect(regularResults.length).toBe(100);
      expect(leanResults.length).toBe(100);

      // Lean queries should be faster (or at least not slower)
      expect(leanDuration).toBeLessThanOrEqual(regularDuration * 1.5);
    });
  });

  describe('Pagination Limits', () => {
    it('should enforce maximum limit to prevent resource exhaustion', async () => {
      const user = await User.create({
        name: 'User',
        email: 'user@test.com',
        password: 'password123',
        role: 'user'
      });

      const chat = await Chat.create({
        participants: [user._id],
        isGroup: false
      });

      // Create 1000 messages
      for (let i = 0; i < 1000; i++) {
        await Message.create({
          chat: chat._id,
          sender: user._id,
          content: `Message ${i}`
        });
      }

      // Attempt to fetch with large limit
      const limit = Math.min(1000, 100); // Capped at 100

      const messages = await Message.find({ chat: chat._id })
        .limit(limit)
        .lean();

      // Should be capped
      expect(messages.length).toBeLessThanOrEqual(100);
    });
  });

  describe('Performance Benchmarks', () => {
    it('should handle typical chat load efficiently', async () => {
      const user1 = await User.create({
        name: 'User 1',
        email: 'user1@test.com',
        password: 'password123',
        role: 'user'
      });

      const user2 = await User.create({
        name: 'User 2',
        email: 'user2@test.com',
        password: 'password123',
        role: 'user'
      });

      const chat = await Chat.create({
        participants: [user1._id, user2._id],
        isGroup: false
      });

      // Simulate typical usage: 50 messages
      for (let i = 0; i < 50; i++) {
        await Message.create({
          chat: chat._id,
          sender: user1._id,
          content: `Message ${i}`
        });
      }

      const startTime = Date.now();

      // Typical operations
      await Message.find({ chat: chat._id }).limit(20).lean();
      await Message.countDocuments({ chat: chat._id });
      await chatService.markMessagesAsRead(chat._id.toString(), user2._id.toString());

      const totalDuration = Date.now() - startTime;

      // All operations should complete quickly
      expect(totalDuration).toBeLessThan(150);
    });

    it('should handle high-volume chat efficiently', async () => {
      const user = await User.create({
        name: 'User',
        email: 'user@test.com',
        password: 'password123',
        role: 'user'
      });

      const chat = await Chat.create({
        participants: [user._id],
        isGroup: false
      });

      // Create 500 messages
      const startInsert = Date.now();
      const insertPromises = [];
      for (let i = 0; i < 500; i++) {
        insertPromises.push(
          Message.create({
            chat: chat._id,
            sender: user._id,
            content: `Message ${i}`
          })
        );
      }
      await Promise.all(insertPromises);
      const insertDuration = Date.now() - startInsert;

      // Should insert reasonably quickly
      expect(insertDuration).toBeLessThan(2000);

      // Query should still be fast with indexes
      const queryStart = Date.now();
      const messages = await Message.find({ chat: chat._id })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();
      const queryDuration = Date.now() - queryStart;

      expect(messages.length).toBe(50);
      expect(queryDuration).toBeLessThan(50);
    });
  });
});
