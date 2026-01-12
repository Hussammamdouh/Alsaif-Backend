const express = require('express');
const router = express.Router();
const abuseController = require('../controllers/abuseController');
const { authenticateToken, authorizeRoles } = require('../middleware/authMiddleware');
const { ROLES } = require('../constants');

// All routes require authentication and admin or superadmin role
router.use(authenticateToken);
router.use(authorizeRoles(ROLES.ADMIN, ROLES.SUPERADMIN));

// View abuse metrics
router.get('/stats', abuseController.getAbuseStats);
router.get('/locked', abuseController.getLockedAccounts);
router.get('/spam', abuseController.getSpamAccounts);
router.get('/suspicious', abuseController.getSuspiciousAccounts);
router.get('/user/:userId', abuseController.getUserSecurityDetails);

// Admin interventions
router.post('/lock/:userId', abuseController.lockUserAccount);
router.post('/unlock/:userId', abuseController.unlockUserAccount);
router.post('/clear-spam/:userId', abuseController.clearSpamFlags);
router.post('/reset-failures/:userId', abuseController.resetFailedLogins);

module.exports = router;
