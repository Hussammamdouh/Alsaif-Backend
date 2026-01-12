const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const AccountSecurity = require('../src/models/AccountSecurity');
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
  await AccountSecurity.deleteMany({});
  await User.deleteMany({});
});

describe('Account Security & Abuse Protection', () => {
  describe('Failed Login Tracking', () => {
    it('should record failed login attempts', async () => {
      const user = await User.create({
        name: 'Test User',
        email: 'test@test.com',
        password: 'password123',
        role: 'user'
      });

      const security = await AccountSecurity.getOrCreate(user._id);

      await security.recordFailedLogin('192.168.1.1', 'Mozilla/5.0');
      await security.recordFailedLogin('192.168.1.2', 'Chrome/91.0');

      expect(security.failedLoginAttempts.count).toBe(2);
      expect(security.failedLoginAttempts.attempts).toHaveLength(2);
      expect(security.failedLoginAttempts.attempts[0].ip).toBe('192.168.1.1');
    });

    it('should reset failed login attempts', async () => {
      const user = await User.create({
        name: 'Test User',
        email: 'test@test.com',
        password: 'password123',
        role: 'user'
      });

      const security = await AccountSecurity.getOrCreate(user._id);

      await security.recordFailedLogin('192.168.1.1', 'Mozilla/5.0');
      await security.recordFailedLogin('192.168.1.2', 'Chrome/91.0');

      expect(security.failedLoginAttempts.count).toBe(2);

      await security.resetFailedLogins();

      expect(security.failedLoginAttempts.count).toBe(0);
      expect(security.failedLoginAttempts.lastAttempt).toBeNull();
    });

    it('should maintain only last 20 failed attempts', async () => {
      const user = await User.create({
        name: 'Test User',
        email: 'test@test.com',
        password: 'password123',
        role: 'user'
      });

      const security = await AccountSecurity.getOrCreate(user._id);

      // Record 25 failed attempts
      for (let i = 0; i < 25; i++) {
        await security.recordFailedLogin(`192.168.1.${i}`, 'Mozilla/5.0');
      }

      expect(security.failedLoginAttempts.count).toBe(25);
      expect(security.failedLoginAttempts.attempts).toHaveLength(20);
      expect(security.failedLoginAttempts.attempts[0].ip).toBe('192.168.1.5'); // First 5 removed
    });
  });

  describe('Account Locking', () => {
    it('should auto-lock account after 10 failed attempts', async () => {
      const user = await User.create({
        name: 'Test User',
        email: 'test@test.com',
        password: 'password123',
        role: 'user'
      });

      const security = await AccountSecurity.getOrCreate(user._id);

      // Record 10 failed attempts
      for (let i = 0; i < 10; i++) {
        await security.recordFailedLogin(`192.168.1.${i}`, 'Mozilla/5.0');
      }

      expect(security.locked.isLocked).toBe(true);
      expect(security.locked.lockReason).toBe('FAILED_LOGIN_ATTEMPTS');
      expect(security.locked.lockedUntil).toBeDefined();
    });

    it('should lock account manually by admin', async () => {
      const user = await User.create({
        name: 'Test User',
        email: 'test@test.com',
        password: 'password123',
        role: 'user'
      });

      const admin = await User.create({
        name: 'Admin',
        email: 'admin@test.com',
        password: 'password123',
        role: 'admin'
      });

      const security = await AccountSecurity.getOrCreate(user._id);

      await security.lockAccount('MANUAL_ADMIN', admin._id, 60);

      expect(security.locked.isLocked).toBe(true);
      expect(security.locked.lockReason).toBe('MANUAL_ADMIN');
      expect(security.locked.lockedBy).toEqual(admin._id);
    });

    it('should unlock account after lock expiry', async () => {
      const user = await User.create({
        name: 'Test User',
        email: 'test@test.com',
        password: 'password123',
        role: 'user'
      });

      const security = await AccountSecurity.getOrCreate(user._id);

      // Lock for 1 second
      await security.lockAccount('FAILED_LOGIN_ATTEMPTS', null, 1 / 60);
      expect(security.locked.isLocked).toBe(true);

      // Wait 2 seconds
      await new Promise(resolve => setTimeout(resolve, 2000));

      const wasUnlocked = await security.checkLockExpiry();

      expect(wasUnlocked).toBe(true);
      expect(security.locked.isLocked).toBe(false);
      expect(security.locked.lockedUntil).toBeNull();
    });

    it('should permanently lock account', async () => {
      const user = await User.create({
        name: 'Test User',
        email: 'test@test.com',
        password: 'password123',
        role: 'user'
      });

      const admin = await User.create({
        name: 'Admin',
        email: 'admin@test.com',
        password: 'password123',
        role: 'admin'
      });

      const security = await AccountSecurity.getOrCreate(user._id);

      await security.lockAccount('MANUAL_ADMIN', admin._id, null);

      expect(security.locked.isLocked).toBe(true);
      expect(security.locked.lockedUntil).toBeUndefined();

      // Check expiry should not unlock permanent locks
      const wasUnlocked = await security.checkLockExpiry();
      expect(wasUnlocked).toBe(false);
      expect(security.locked.isLocked).toBe(true);
    });

    it('should unlock account manually', async () => {
      const user = await User.create({
        name: 'Test User',
        email: 'test@test.com',
        password: 'password123',
        role: 'user'
      });

      const admin = await User.create({
        name: 'Admin',
        email: 'admin@test.com',
        password: 'password123',
        role: 'admin'
      });

      const security = await AccountSecurity.getOrCreate(user._id);

      await security.lockAccount('MANUAL_ADMIN', admin._id, 60);
      expect(security.locked.isLocked).toBe(true);

      await security.unlockAccount(admin._id);

      expect(security.locked.isLocked).toBe(false);
      expect(security.locked.lockedUntil).toBeNull();
      expect(security.interventions.length).toBeGreaterThan(0);
    });
  });

  describe('Spam Detection', () => {
    it('should flag spam', async () => {
      const user = await User.create({
        name: 'Test User',
        email: 'test@test.com',
        password: 'password123',
        role: 'user'
      });

      const security = await AccountSecurity.getOrCreate(user._id);

      await security.flagSpam();

      expect(security.messageSpam.spamFlags).toBe(1);
    });

    it('should auto-lock after 3 spam flags', async () => {
      const user = await User.create({
        name: 'Test User',
        email: 'test@test.com',
        password: 'password123',
        role: 'user'
      });

      const security = await AccountSecurity.getOrCreate(user._id);

      await security.flagSpam();
      await security.flagSpam();
      await security.flagSpam();

      expect(security.locked.isLocked).toBe(true);
      expect(security.locked.lockReason).toBe('SPAM_DETECTED');
    });

    it('should track messages', async () => {
      const user = await User.create({
        name: 'Test User',
        email: 'test@test.com',
        password: 'password123',
        role: 'user'
      });

      const security = await AccountSecurity.getOrCreate(user._id);

      security.trackMessage();
      security.trackMessage();
      security.trackMessage();
      await security.save();

      expect(security.messageSpam.recentMessageCount).toBe(3);
    });

    it('should reset message count', async () => {
      const user = await User.create({
        name: 'Test User',
        email: 'test@test.com',
        password: 'password123',
        role: 'user'
      });

      const security = await AccountSecurity.getOrCreate(user._id);

      security.messageSpam.recentMessageCount = 50;
      await security.save();

      await security.resetMessageCount();

      expect(security.messageSpam.recentMessageCount).toBe(0);
    });
  });

  describe('Admin Interventions', () => {
    it('should record admin intervention', async () => {
      const user = await User.create({
        name: 'Test User',
        email: 'test@test.com',
        password: 'password123',
        role: 'user'
      });

      const admin = await User.create({
        name: 'Admin',
        email: 'admin@test.com',
        password: 'password123',
        role: 'admin'
      });

      const security = await AccountSecurity.getOrCreate(user._id);

      await security.addIntervention(
        admin._id,
        'LOCKED',
        'Suspicious activity detected'
      );

      expect(security.interventions).toHaveLength(1);
      expect(security.interventions[0].admin).toEqual(admin._id);
      expect(security.interventions[0].action).toBe('LOCKED');
      expect(security.interventions[0].reason).toBe('Suspicious activity detected');
    });

    it('should maintain intervention history', async () => {
      const user = await User.create({
        name: 'Test User',
        email: 'test@test.com',
        password: 'password123',
        role: 'user'
      });

      const admin = await User.create({
        name: 'Admin',
        email: 'admin@test.com',
        password: 'password123',
        role: 'admin'
      });

      const security = await AccountSecurity.getOrCreate(user._id);

      await security.addIntervention(admin._id, 'WARNING_ISSUED', 'First warning');
      await security.addIntervention(admin._id, 'LOCKED', 'Second offense');
      await security.addIntervention(admin._id, 'UNLOCKED', 'User apologized');

      expect(security.interventions).toHaveLength(3);
      expect(security.interventions[0].action).toBe('WARNING_ISSUED');
      expect(security.interventions[2].action).toBe('UNLOCKED');
    });
  });

  describe('Static Methods', () => {
    it('should get or create security record', async () => {
      const user = await User.create({
        name: 'Test User',
        email: 'test@test.com',
        password: 'password123',
        role: 'user'
      });

      const security1 = await AccountSecurity.getOrCreate(user._id);
      expect(security1.user).toEqual(user._id);

      const security2 = await AccountSecurity.getOrCreate(user._id);
      expect(security2._id).toEqual(security1._id);
    });

    it('should find locked accounts', async () => {
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

      const security1 = await AccountSecurity.getOrCreate(user1._id);
      const security2 = await AccountSecurity.getOrCreate(user2._id);

      await security1.lockAccount('MANUAL_ADMIN', null, 60);

      const lockedAccounts = await AccountSecurity.getLockedAccounts();

      expect(lockedAccounts).toHaveLength(1);
      expect(lockedAccounts[0].user._id).toEqual(user1._id);
    });

    it('should find spam flagged accounts', async () => {
      const user = await User.create({
        name: 'Test User',
        email: 'test@test.com',
        password: 'password123',
        role: 'user'
      });

      const security = await AccountSecurity.getOrCreate(user._id);
      await security.flagSpam();
      await security.flagSpam();

      const spamAccounts = await AccountSecurity.getSpamAccounts(2);

      expect(spamAccounts).toHaveLength(1);
      expect(spamAccounts[0].user._id).toEqual(user._id);
    });
  });
});
