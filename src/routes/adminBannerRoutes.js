const express = require('express');
const router = express.Router();
const adminBannerController = require('../controllers/adminBannerController');
const { authenticateToken, authorizeRoles } = require('../middleware/authMiddleware');
const { ROLES } = require('../constants');
const { body } = require('express-validator');
const { validate } = require('../middleware/validation');

// All routes require authentication and admin or superadmin role
router.use(authenticateToken);
router.use(authorizeRoles(ROLES.ADMIN, ROLES.SUPERADMIN));

const bannerValidation = [
    body('title').trim().notEmpty().withMessage('Title is required').isLength({ max: 100 }),
    body('imageUrl').trim().notEmpty().withMessage('Image URL is required').isURL().withMessage('Invalid Image URL'),
    body('link').optional().trim().isURL().withMessage('Invalid Link URL'),
    body('partner').optional().trim().isLength({ max: 100 }),
    body('isActive').optional().isBoolean(),
    body('order').optional().isInt({ min: 0 }),
    body('type').optional().isIn(['free', 'premium', 'both']),
    validate,
];

router.get('/', adminBannerController.getAllBanners);
router.post('/', bannerValidation, adminBannerController.createBanner);
router.patch('/:bannerId', bannerValidation, adminBannerController.updateBanner);
router.delete('/:bannerId', adminBannerController.deleteBanner);

module.exports = router;
