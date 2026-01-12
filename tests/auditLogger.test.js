const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const AuditLog = require('../src/models/AuditLog');
const AuditLogger = require('../src/utils/auditLogger');
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
  await AuditLog.deleteMany({});
  await User.deleteMany({});
});

describe('Audit Logger', () => {
  describe('Basic Logging', () => {
    it('should create an audit log entry', async () => {
      const user = await User.create({
        name: 'Test User',
        email: 'test@test.com',
        password: 'password123',
        role: 'admin'
      });

      const log = await AuditLogger.log({
        actor: {
          userId: user._id,
          email: user.email,
          role: user.role,
          ip: '127.0.0.1',
          userAgent: 'test-agent'
        },
        action: 'USER_CREATED',
        target: {
          resourceType: 'User',
          resourceId: user._id,
          resourceName: user.email
        },
        changes: {
          after: { name: user.name, email: user.email }
        },
        status: 'success'
      });

      expect(log).toBeDefined();
      expect(log.actor.email).toBe('test@test.com');
      expect(log.action).toBe('USER_CREATED');
      expect(log.status).toBe('success');
    });

    it('should automatically classify severity', async () => {
      const user = await User.create({
        name: 'Admin',
        email: 'admin@test.com',
        password: 'password123',
        role: 'admin'
      });

      const log = await AuditLogger.log({
        actor: {
          userId: user._id,
          email: user.email,
          role: user.role,
          ip: '127.0.0.1'
        },
        action: 'USER_DELETED',
        target: {
          resourceType: 'User',
          resourceId: user._id,
          resourceName: user.email
        },
        status: 'success'
      });

      expect(log.metadata.severity).toBe('critical');
    });

    it('should sanitize sensitive request data', async () => {
      const user = await User.create({
        name: 'User',
        email: 'user@test.com',
        password: 'password123',
        role: 'user'
      });

      const log = await AuditLogger.log({
        actor: {
          userId: user._id,
          email: user.email,
          role: user.role
        },
        action: 'LOGIN',
        target: {
          resourceType: 'User',
          resourceId: user._id,
          resourceName: user.email
        },
        request: {
          body: {
            email: 'user@test.com',
            password: 'mySecretPassword123'
          }
        },
        status: 'success'
      });

      expect(log.request.body.password).toBe('[REDACTED]');
      expect(log.request.body.email).toBe('user@test.com');
    });
  });

  describe('Write-Once Protection', () => {
    it('should prevent updates to audit logs', async () => {
      const user = await User.create({
        name: 'Test',
        email: 'test@test.com',
        password: 'password123',
        role: 'user'
      });

      const log = await AuditLog.create({
        actor: {
          userId: user._id,
          email: user.email,
          role: user.role
        },
        action: 'LOGIN',
        target: {
          resourceType: 'User',
          resourceId: user._id,
          resourceName: user.email
        },
        status: 'success'
      });

      await expect(
        AuditLog.findByIdAndUpdate(log._id, { status: 'failure' })
      ).rejects.toThrow('Audit logs cannot be modified');
    });

    it('should prevent deletes of audit logs', async () => {
      const user = await User.create({
        name: 'Test',
        email: 'test@test.com',
        password: 'password123',
        role: 'user'
      });

      const log = await AuditLog.create({
        actor: {
          userId: user._id,
          email: user.email,
          role: user.role
        },
        action: 'LOGIN',
        target: {
          resourceType: 'User',
          resourceId: user._id,
          resourceName: user.email
        },
        status: 'success'
      });

      await expect(
        AuditLog.findByIdAndDelete(log._id)
      ).rejects.toThrow('Audit logs cannot be deleted');
    });
  });

  describe('Query Methods', () => {
    it('should query audit logs with filters', async () => {
      const user = await User.create({
        name: 'Test',
        email: 'test@test.com',
        password: 'password123',
        role: 'admin'
      });

      await AuditLogger.log({
        actor: { userId: user._id, email: user.email, role: user.role },
        action: 'USER_CREATED',
        target: { resourceType: 'User', resourceId: user._id, resourceName: user.email },
        status: 'success'
      });

      await AuditLogger.log({
        actor: { userId: user._id, email: user.email, role: user.role },
        action: 'USER_DELETED',
        target: { resourceType: 'User', resourceId: user._id, resourceName: user.email },
        status: 'success'
      });

      const result = await AuditLogger.query({ action: 'USER_CREATED' });

      expect(result.logs).toHaveLength(1);
      expect(result.logs[0].action).toBe('USER_CREATED');
    });

    it('should get user audit trail', async () => {
      const user = await User.create({
        name: 'Test',
        email: 'test@test.com',
        password: 'password123',
        role: 'user'
      });

      await AuditLogger.log({
        actor: { userId: user._id, email: user.email, role: user.role },
        action: 'LOGIN',
        target: { resourceType: 'User', resourceId: user._id, resourceName: user.email },
        status: 'success'
      });

      const result = await AuditLogger.getUserAuditTrail(user._id.toString());

      expect(result.logs).toHaveLength(1);
      // userId may be populated with full user object
      const actorUserId = result.logs[0].actor.userId._id || result.logs[0].actor.userId;
      expect(actorUserId.toString()).toBe(user._id.toString());
    });
  });
});
