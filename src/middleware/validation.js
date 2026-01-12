const { body, param, query, validationResult } = require('express-validator');
const { HTTP_STATUS, ERROR_MESSAGES, ROLES } = require('../constants');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: ERROR_MESSAGES.MISSING_FIELDS,
      errors: errors.array().map(err => ({
        field: err.path,
        message: err.msg
      }))
    });
  }
  next();
};

const registerValidation = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters'),
  body('email')
    .trim()
    .isEmail()
    .normalizeEmail()
    .withMessage(ERROR_MESSAGES.INVALID_EMAIL),
  body('password')
    .isLength({ min: 6 })
    .withMessage(ERROR_MESSAGES.PASSWORD_TOO_SHORT),
  validate
];

const loginValidation = [
  body('email')
    .trim()
    .isEmail()
    .normalizeEmail()
    .withMessage(ERROR_MESSAGES.INVALID_EMAIL),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  validate
];

const refreshTokenValidation = [
  body('refreshToken')
    .notEmpty()
    .withMessage(ERROR_MESSAGES.REFRESH_TOKEN_REQUIRED),
  validate
];

const updateUserStatusValidation = [
  param('userId')
    .isMongoId()
    .withMessage('Invalid user ID'),
  body('isActive')
    .isBoolean()
    .withMessage(ERROR_MESSAGES.INVALID_STATUS),
  validate
];

const updateUserRoleValidation = [
  param('userId')
    .isMongoId()
    .withMessage('Invalid user ID'),
  body('role')
    .isIn(Object.values(ROLES))
    .withMessage(ERROR_MESSAGES.INVALID_ROLE),
  validate
];

const createAdminValidation = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters'),
  body('email')
    .trim()
    .isEmail()
    .normalizeEmail()
    .withMessage(ERROR_MESSAGES.INVALID_EMAIL),
  body('password')
    .isLength({ min: 6 })
    .withMessage(ERROR_MESSAGES.PASSWORD_TOO_SHORT),
  validate
];

const paginationValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .toInt()
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .toInt()
    .withMessage('Limit must be between 1 and 100'),
  validate
];

module.exports = {
  validate,
  registerValidation,
  loginValidation,
  refreshTokenValidation,
  updateUserStatusValidation,
  updateUserRoleValidation,
  createAdminValidation,
  paginationValidation
};
