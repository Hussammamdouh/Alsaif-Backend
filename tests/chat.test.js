const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');
const Chat = require('../src/models/Chat');
const Message = require('../src/models/Message');
const { ROLES, CHAT_TYPES, CHAT_PERMISSIONS } = require('../src/constants');
require('./setup');

describe('Chat System Tests', () => {
  let user1Token, user2Token, user3Token;
  let user1Id, user2Id, user3Id;

  // Helper function to create a test user
  const createUser = async (name, email) => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name,
        email,
        password: 'password123'
      });
    // Handle both old (token) and new (accessToken) response format
    const token = res.body.data?.accessToken || res.body.data?.token;
    return {
      token: token,
      id: res.body.data.user._id
    };
  };

  beforeEach(async () => {
    // Create test users
    const user1 = await createUser('User One', 'user1@example.com');
    const user2 = await createUser('User Two', 'user2@example.com');
    const user3 = await createUser('User Three', 'user3@example.com');

    user1Token = user1.token;
    user2Token = user2.token;
    user3Token = user3.token;

    user1Id = user1.id;
    user2Id = user2.id;
    user3Id = user3.id;
  });

  describe('POST /api/chats/private - Create Private Chat', () => {
    it('should create a private chat successfully', async () => {
      const res = await request(app)
        .post('/api/chats/private')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ userId: user2Id });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.chat.type).toBe(CHAT_TYPES.PRIVATE);
      expect(res.body.data.chat.participants).toHaveLength(2);
      expect(res.body.data.chat.isPremium).toBe(false);
    });

    it('should return existing private chat if already exists', async () => {
      // Create first chat
      const res1 = await request(app)
        .post('/api/chats/private')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ userId: user2Id });

      const chatId1 = res1.body.data.chat._id;

      // Try to create same chat again
      const res2 = await request(app)
        .post('/api/chats/private')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ userId: user2Id });

      expect(res2.status).toBe(201);
      expect(res2.body.data.chat._id).toBe(chatId1);
    });

    it('should reject creating chat with yourself', async () => {
      const res = await request(app)
        .post('/api/chats/private')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ userId: user1Id });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('yourself');
    });

    it('should reject missing userId', async () => {
      const res = await request(app)
        .post('/api/chats/private')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject unauthorized request', async () => {
      const res = await request(app)
        .post('/api/chats/private')
        .send({ userId: user2Id });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject invalid user ID', async () => {
      const res = await request(app)
        .post('/api/chats/private')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ userId: 'invalid-id' });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/chats/group - Create Group Chat', () => {
    it('should create a group chat successfully', async () => {
      const res = await request(app)
        .post('/api/chats/group')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          name: 'Test Group',
          participantIds: [user2Id, user3Id],
          isPremium: false
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.chat.type).toBe(CHAT_TYPES.GROUP);
      expect(res.body.data.chat.name).toBe('Test Group');
      expect(res.body.data.chat.participants).toHaveLength(3); // Creator + 2 participants

      // Verify creator is admin
      const creatorParticipant = res.body.data.chat.participants.find(
        p => p.user._id.toString() === user1Id.toString()
      );
      expect(creatorParticipant.permission).toBe(CHAT_PERMISSIONS.ADMIN);
    });

    it('should create group with only creator if no participants provided', async () => {
      const res = await request(app)
        .post('/api/chats/group')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          name: 'Solo Group',
          participantIds: []
        });

      expect(res.status).toBe(201);
      expect(res.body.data.chat.participants).toHaveLength(1);
    });

    it('should reject group without name', async () => {
      const res = await request(app)
        .post('/api/chats/group')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          participantIds: [user2Id]
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should create premium group when specified', async () => {
      const res = await request(app)
        .post('/api/chats/group')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          name: 'Premium Group',
          participantIds: [user2Id],
          isPremium: true
        });

      expect(res.status).toBe(201);
      expect(res.body.data.chat.isPremium).toBe(true);
    });
  });

  describe('GET /api/chats - Get My Chats', () => {
    beforeEach(async () => {
      // Create some chats
      await request(app)
        .post('/api/chats/private')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ userId: user2Id });

      await request(app)
        .post('/api/chats/group')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          name: 'Group 1',
          participantIds: [user2Id, user3Id]
        });
    });

    it('should get all user chats with pagination', async () => {
      const res = await request(app)
        .get('/api/chats?page=1&limit=20')
        .set('Authorization', `Bearer ${user1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.chats).toBeInstanceOf(Array);
      expect(res.body.data.chats.length).toBeGreaterThan(0);
      expect(res.body.data.pagination).toBeDefined();
      expect(res.body.data.pagination.total).toBeGreaterThan(0);
    });

    it('should return empty array if user has no chats', async () => {
      // Create a new user with no chats
      const newUser = await createUser('New User', 'newuser@example.com');

      const res = await request(app)
        .get('/api/chats')
        .set('Authorization', `Bearer ${newUser.token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.chats).toHaveLength(0);
      expect(res.body.data.pagination.total).toBe(0);
    });

    it('should respect pagination limits', async () => {
      const res = await request(app)
        .get('/api/chats?page=1&limit=1')
        .set('Authorization', `Bearer ${user1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.chats.length).toBeLessThanOrEqual(1);
      expect(res.body.data.pagination.limit).toBe(1);
    });

    it('should reject unauthorized request', async () => {
      const res = await request(app).get('/api/chats');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/chats/:chatId - Get Chat Details', () => {
    let chatId;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/chats/private')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ userId: user2Id });

      chatId = res.body.data.chat._id;
    });

    it('should get chat details successfully', async () => {
      const res = await request(app)
        .get(`/api/chats/${chatId}`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.chat._id).toBe(chatId);
      expect(res.body.data.chat.participants).toBeDefined();
    });

    it('should allow other participant to view chat', async () => {
      const res = await request(app)
        .get(`/api/chats/${chatId}`)
        .set('Authorization', `Bearer ${user2Token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should reject non-participant access', async () => {
      const res = await request(app)
        .get(`/api/chats/${chatId}`)
        .set('Authorization', `Bearer ${user3Token}`);

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });

    it('should reject invalid chat ID', async () => {
      const res = await request(app)
        .get('/api/chats/invalid-id')
        .set('Authorization', `Bearer ${user1Token}`);

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/chats/:chatId/messages - Get Chat Messages', () => {
    let chatId;

    beforeEach(async () => {
      const chatRes = await request(app)
        .post('/api/chats/private')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ userId: user2Id });

      chatId = chatRes.body.data.chat._id;

      // Create some messages directly in the database
      const chat = await Chat.findById(chatId);
      await Message.create({
        chat: chatId,
        sender: user1Id,
        content: 'Test message 1'
      });
      await Message.create({
        chat: chatId,
        sender: user2Id,
        content: 'Test message 2'
      });
    });

    it('should get chat messages with pagination', async () => {
      const res = await request(app)
        .get(`/api/chats/${chatId}/messages?page=1&limit=50`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.messages).toBeInstanceOf(Array);
      expect(res.body.data.messages.length).toBeGreaterThan(0);
      expect(res.body.data.pagination).toBeDefined();
    });

    it('should return messages in correct order (newest first)', async () => {
      const res = await request(app)
        .get(`/api/chats/${chatId}/messages`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(res.status).toBe(200);
      const messages = res.body.data.messages;

      // Verify messages are sorted by creation date descending
      for (let i = 0; i < messages.length - 1; i++) {
        const current = new Date(messages[i].createdAt);
        const next = new Date(messages[i + 1].createdAt);
        expect(current >= next).toBe(true);
      }
    });

    it('should reject non-participant access', async () => {
      const res = await request(app)
        .get(`/api/chats/${chatId}/messages`)
        .set('Authorization', `Bearer ${user3Token}`);

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });

    it('should return empty array for chat with no messages', async () => {
      // Create new chat without messages
      const newChatRes = await request(app)
        .post('/api/chats/private')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ userId: user3Id });

      const newChatId = newChatRes.body.data.chat._id;

      const res = await request(app)
        .get(`/api/chats/${newChatId}/messages`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.messages).toHaveLength(0);
    });
  });

  describe('POST /api/chats/:chatId/participants - Add Participant', () => {
    let groupChatId;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/chats/group')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          name: 'Test Group',
          participantIds: [user2Id]
        });

      groupChatId = res.body.data.chat._id;
    });

    it('should allow admin to add participant', async () => {
      const res = await request(app)
        .post(`/api/chats/${groupChatId}/participants`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ userId: user3Id });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.chat.participants).toHaveLength(3);
    });

    it('should reject non-admin trying to add participant', async () => {
      const res = await request(app)
        .post(`/api/chats/${groupChatId}/participants`)
        .set('Authorization', `Bearer ${user2Token}`)
        .send({ userId: user3Id });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });

    it('should reject adding participant to private chat', async () => {
      // Create private chat
      const privateRes = await request(app)
        .post('/api/chats/private')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ userId: user2Id });

      const privateChatId = privateRes.body.data.chat._id;

      const res = await request(app)
        .post(`/api/chats/${privateChatId}/participants`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ userId: user3Id });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });

    it('should reject adding already existing participant', async () => {
      const res = await request(app)
        .post(`/api/chats/${groupChatId}/participants`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ userId: user2Id });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });

    it('should reject missing userId', async () => {
      const res = await request(app)
        .post(`/api/chats/${groupChatId}/participants`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('DELETE /api/chats/:chatId/participants/:userId - Remove Participant', () => {
    let groupChatId;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/chats/group')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          name: 'Test Group',
          participantIds: [user2Id, user3Id]
        });

      groupChatId = res.body.data.chat._id;
    });

    it('should allow admin to remove participant', async () => {
      const res = await request(app)
        .delete(`/api/chats/${groupChatId}/participants/${user3Id}`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.chat.participants).toHaveLength(2);
    });

    it('should reject non-admin trying to remove participant', async () => {
      const res = await request(app)
        .delete(`/api/chats/${groupChatId}/participants/${user3Id}`)
        .set('Authorization', `Bearer ${user2Token}`);

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });

    it('should reject removing participant from private chat', async () => {
      const privateRes = await request(app)
        .post('/api/chats/private')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ userId: user2Id });

      const privateChatId = privateRes.body.data.chat._id;

      const res = await request(app)
        .delete(`/api/chats/${privateChatId}/participants/${user2Id}`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });

    it('should reject removing non-existent participant', async () => {
      // Create a user that's not in the group
      const newUser = await createUser('New User', 'newuser@example.com');

      const res = await request(app)
        .delete(`/api/chats/${groupChatId}/participants/${newUser.id}`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/chats/:chatId/leave - Leave Chat', () => {
    let groupChatId;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/chats/group')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          name: 'Test Group',
          participantIds: [user2Id, user3Id]
        });

      groupChatId = res.body.data.chat._id;
    });

    it('should allow participant to leave group chat', async () => {
      const res = await request(app)
        .post(`/api/chats/${groupChatId}/leave`)
        .set('Authorization', `Bearer ${user2Token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify user is removed
      const chatRes = await request(app)
        .get(`/api/chats/${groupChatId}`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(chatRes.body.data.chat.participants).toHaveLength(2);
    });

    it('should reject leaving private chat', async () => {
      const privateRes = await request(app)
        .post('/api/chats/private')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ userId: user2Id });

      const privateChatId = privateRes.body.data.chat._id;

      const res = await request(app)
        .post(`/api/chats/${privateChatId}/leave`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('private');
    });

    it('should reject non-participant trying to leave', async () => {
      const res = await request(app)
        .post(`/api/chats/${groupChatId}/leave`)
        .set('Authorization', `Bearer ${user3Token}`);

      // User3 is a participant, so let's create another user
      const newUser = await createUser('Outside User', 'outside@example.com');

      const res2 = await request(app)
        .post(`/api/chats/${groupChatId}/leave`)
        .set('Authorization', `Bearer ${newUser.token}`);

      expect(res2.status).toBe(500);
      expect(res2.body.success).toBe(false);
    });
  });

  describe('Chat Permissions', () => {
    let groupChatId;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/chats/group')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          name: 'Permission Test Group',
          participantIds: [user2Id]
        });

      groupChatId = res.body.data.chat._id;
    });

    it('should have creator as admin by default', async () => {
      const res = await request(app)
        .get(`/api/chats/${groupChatId}`)
        .set('Authorization', `Bearer ${user1Token}`);

      const creatorParticipant = res.body.data.chat.participants.find(
        p => p.user._id.toString() === user1Id.toString()
      );

      expect(creatorParticipant.permission).toBe(CHAT_PERMISSIONS.ADMIN);
    });

    it('should have new participants as members by default', async () => {
      const res = await request(app)
        .get(`/api/chats/${groupChatId}`)
        .set('Authorization', `Bearer ${user1Token}`);

      const memberParticipant = res.body.data.chat.participants.find(
        p => p.user._id.toString() === user2Id.toString()
      );

      expect(memberParticipant.permission).toBe(CHAT_PERMISSIONS.MEMBER);
    });
  });

  describe('Premium Chat Features', () => {
    it('should create premium private chat', async () => {
      // Manually create premium private chat in database
      const chat = await Chat.create({
        type: CHAT_TYPES.PRIVATE,
        participants: [
          { user: user1Id, permission: CHAT_PERMISSIONS.MEMBER },
          { user: user2Id, permission: CHAT_PERMISSIONS.MEMBER }
        ],
        isPremium: true,
        createdBy: user1Id
      });

      const res = await request(app)
        .get(`/api/chats/${chat._id}`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.chat.isPremium).toBe(true);
    });

    it('should create premium group chat', async () => {
      const res = await request(app)
        .post('/api/chats/group')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          name: 'Premium Group',
          participantIds: [user2Id],
          isPremium: true
        });

      expect(res.status).toBe(201);
      expect(res.body.data.chat.isPremium).toBe(true);
    });
  });
});
