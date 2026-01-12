const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');
require('./setup');

describe('Authorization Tests', () => {
  let userToken, adminToken, superadminToken;
  let userId, adminId, superadminId;

  beforeEach(async () => {
    // Create normal user
    const userRes = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Normal User',
        email: 'user@example.com',
        password: 'password123'
      });
    userToken = userRes.body.data.token;
    userId = userRes.body.data.user.id;

    // Create admin
    const admin = await User.create({
      name: 'Admin User',
      email: 'admin@example.com',
      password: 'password123',
      role: 'admin'
    });
    adminId = admin._id;
    const adminLoginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@example.com',
        password: 'password123'
      });
    adminToken = adminLoginRes.body.data.token;

    // Create superadmin
    const superadmin = await User.create({
      name: 'Superadmin User',
      email: 'superadmin@example.com',
      password: 'password123',
      role: 'superadmin'
    });
    superadminId = superadmin._id;
    const superadminLoginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'superadmin@example.com',
        password: 'password123'
      });
    superadminToken = superadminLoginRes.body.data.token;
  });

  describe('Admin Routes Authorization', () => {
    it('should allow admin to access admin routes', async () => {
      const res = await request(app)
        .get('/api/admin/dashboard')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should allow superadmin to access admin routes', async () => {
      const res = await request(app)
        .get('/api/admin/dashboard')
        .set('Authorization', `Bearer ${superadminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should reject normal user from admin routes', async () => {
      const res = await request(app)
        .get('/api/admin/dashboard')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('not authorized');
    });

    it('should reject unauthenticated requests to admin routes', async () => {
      const res = await request(app).get('/api/admin/dashboard');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Superadmin Routes Authorization', () => {
    it('should allow superadmin to access superadmin routes', async () => {
      const res = await request(app)
        .get('/api/superadmin/system')
        .set('Authorization', `Bearer ${superadminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should reject admin from superadmin routes', async () => {
      const res = await request(app)
        .get('/api/superadmin/system')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should reject normal user from superadmin routes', async () => {
      const res = await request(app)
        .get('/api/superadmin/system')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Role-Based Operations', () => {
    it('should allow admin to update user status', async () => {
      const res = await request(app)
        .patch(`/api/admin/users/${userId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.isActive).toBe(false);
    });

    it('should allow superadmin to create admin', async () => {
      const res = await request(app)
        .post('/api/superadmin/admins')
        .set('Authorization', `Bearer ${superadminToken}`)
        .send({
          name: 'New Admin',
          email: 'newadmin@example.com',
          password: 'password123'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.admin.role).toBe('admin');
    });

    it('should allow superadmin to update user roles', async () => {
      const res = await request(app)
        .patch(`/api/superadmin/users/${userId}/role`)
        .set('Authorization', `Bearer ${superadminToken}`)
        .send({ role: 'admin' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.role).toBe('admin');
    });

    it('should prevent deleting superadmin users', async () => {
      const res = await request(app)
        .delete(`/api/superadmin/users/${superadminId}`)
        .set('Authorization', `Bearer ${superadminToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should allow superadmin to delete normal users', async () => {
      const res = await request(app)
        .delete(`/api/superadmin/users/${userId}`)
        .set('Authorization', `Bearer ${superadminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('Admin Operations', () => {
    it('should allow admin to get all users', async () => {
      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.users).toBeDefined();
      expect(res.body.data.count).toBeGreaterThan(0);
    });

    it('should provide dashboard stats to admin', async () => {
      const res = await request(app)
        .get('/api/admin/dashboard')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalUsers).toBeDefined();
      expect(res.body.data.activeUsers).toBeDefined();
    });
  });
});
