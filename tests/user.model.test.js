const User = require('../src/models/User');
require('./setup');

describe('User Model Tests', () => {
  describe('User Creation', () => {
    it('should create a user with valid data', async () => {
      const userData = {
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123'
      };

      const user = await User.create(userData);

      expect(user._id).toBeDefined();
      expect(user.name).toBe(userData.name);
      expect(user.email).toBe(userData.email);
      expect(user.role).toBe('user');
      expect(user.isActive).toBe(true);
      expect(user.password).not.toBe(userData.password); // Should be hashed
    });

    it('should hash password before saving', async () => {
      const plainPassword = 'password123';
      const user = await User.create({
        name: 'Hash Test',
        email: 'hash@example.com',
        password: plainPassword
      });

      expect(user.password).not.toBe(plainPassword);
      expect(user.password.length).toBeGreaterThan(plainPassword.length);
    });

    it('should set default role to user', async () => {
      const user = await User.create({
        name: 'Default Role',
        email: 'default@example.com',
        password: 'password123'
      });

      expect(user.role).toBe('user');
    });

    it('should set default isActive to true', async () => {
      const user = await User.create({
        name: 'Active Test',
        email: 'active@example.com',
        password: 'password123'
      });

      expect(user.isActive).toBe(true);
    });
  });

  describe('User Validation', () => {
    it('should reject user without name', async () => {
      const userData = {
        email: 'noname@example.com',
        password: 'password123'
      };

      await expect(User.create(userData)).rejects.toThrow();
    });

    it('should reject user without email', async () => {
      const userData = {
        name: 'No Email',
        password: 'password123'
      };

      await expect(User.create(userData)).rejects.toThrow();
    });

    it('should reject user without password', async () => {
      const userData = {
        name: 'No Password',
        email: 'nopass@example.com'
      };

      await expect(User.create(userData)).rejects.toThrow();
    });

    it('should reject duplicate email', async () => {
      const userData = {
        name: 'Duplicate Test',
        email: 'duplicate@example.com',
        password: 'password123'
      };

      await User.create(userData);
      await expect(User.create(userData)).rejects.toThrow();
    });

    it('should reject invalid email format', async () => {
      const userData = {
        name: 'Invalid Email',
        email: 'not-an-email',
        password: 'password123'
      };

      await expect(User.create(userData)).rejects.toThrow();
    });

    it('should reject password shorter than 6 characters', async () => {
      const userData = {
        name: 'Short Pass',
        email: 'short@example.com',
        password: '12345'
      };

      await expect(User.create(userData)).rejects.toThrow();
    });

    it('should reject invalid role', async () => {
      const userData = {
        name: 'Invalid Role',
        email: 'invalid@example.com',
        password: 'password123',
        role: 'invalidrole'
      };

      await expect(User.create(userData)).rejects.toThrow();
    });
  });

  describe('User Methods', () => {
    let user;
    const plainPassword = 'password123';

    beforeEach(async () => {
      user = await User.create({
        name: 'Method Test',
        email: 'method@example.com',
        password: plainPassword
      });
    });

    it('should match correct password', async () => {
      const userWithPassword = await User.findById(user._id).select('+password');
      const isMatch = await userWithPassword.matchPassword(plainPassword);

      expect(isMatch).toBe(true);
    });

    it('should not match incorrect password', async () => {
      const userWithPassword = await User.findById(user._id).select('+password');
      const isMatch = await userWithPassword.matchPassword('wrongpassword');

      expect(isMatch).toBe(false);
    });

    it('should not include password in toJSON', async () => {
      const userWithPassword = await User.findById(user._id).select('+password');
      const json = userWithPassword.toJSON();

      expect(json.password).toBeUndefined();
      expect(json.email).toBeDefined();
    });
  });

  describe('User Roles', () => {
    it('should create admin user', async () => {
      const admin = await User.create({
        name: 'Admin User',
        email: 'admin@example.com',
        password: 'password123',
        role: 'admin'
      });

      expect(admin.role).toBe('admin');
    });

    it('should create superadmin user', async () => {
      const superadmin = await User.create({
        name: 'Superadmin User',
        email: 'superadmin@example.com',
        password: 'password123',
        role: 'superadmin'
      });

      expect(superadmin.role).toBe('superadmin');
    });
  });
});
