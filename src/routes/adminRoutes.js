const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticateToken, authorizeRoles } = require('../middleware/authMiddleware');
const { ROLES } = require('../constants');
const { body } = require('express-validator');
const { validate } = require('../middleware/validation');
const {
  paginationValidation,
  updateUserStatusValidation
} = require('../middleware/validation');
const { bulkOperationLimiter } = require('../middleware/advancedRateLimit');

// All routes require authentication and admin or superadmin role
router.use(authenticateToken);
router.use(authorizeRoles(ROLES.ADMIN, ROLES.SUPERADMIN));

// Bulk operations validation - SECURITY FIX: Limit array size to prevent abuse
const bulkUserIdsValidation = [
  body('userIds')
    .isArray({ min: 1, max: 100 })
    .withMessage('User IDs array is required and must contain 1-100 items'),
  body('userIds.*')
    .isMongoId()
    .withMessage('Invalid user ID in array'),
  body('reason')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Reason cannot exceed 500 characters'),
  validate
];

// Validation for create user
const createUserValidation = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be 2-100 characters'),
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Invalid email format')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),
  body('role')
    .optional()
    .trim()
    .isIn(['user', 'admin'])
    .withMessage('Role must be user or admin'),
  validate
];

// Validation for update user
const updateUserValidation = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be 2-100 characters'),
  body('email')
    .optional()
    .trim()
    .isEmail()
    .withMessage('Invalid email format')
    .normalizeEmail(),
  body('role')
    .optional()
    .trim()
    .isIn(['user', 'admin'])
    .withMessage('Role must be user or admin'),
  validate
];

// Single user operations
router.get('/users', paginationValidation, adminController.getAllUsers);
router.post('/users', createUserValidation, adminController.createUser);
router.patch('/users/:userId', updateUserValidation, adminController.updateUser);
router.delete('/users/:userId', adminController.deleteUser);
router.patch('/users/:userId/status', updateUserStatusValidation, adminController.updateUserStatus);

// Bulk operations (with additional rate limiting)
router.post('/users/bulk-suspend', bulkOperationLimiter, bulkUserIdsValidation, adminController.bulkSuspendUsers);
router.post('/users/bulk-activate', bulkOperationLimiter, bulkUserIdsValidation, adminController.bulkActivateUsers);
router.post('/users/bulk-delete', bulkOperationLimiter, bulkUserIdsValidation, adminController.bulkDeleteUsers);

// Dashboard
router.get('/dashboard', adminController.getDashboardStats);

module.exports = router;
