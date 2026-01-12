const mongoose = require('mongoose');
const { CHAT_TYPES, CHAT_PERMISSIONS } = require('../constants');

const chatSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      maxlength: [100, 'Chat name cannot exceed 100 characters']
    },
    type: {
      type: String,
      enum: Object.values(CHAT_TYPES),
      required: true,
      index: true
    },
    participants: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true
        },
        permission: {
          type: String,
          enum: Object.values(CHAT_PERMISSIONS),
          default: CHAT_PERMISSIONS.MEMBER
        },
        joinedAt: {
          type: Date,
          default: Date.now
        }
      }
    ],
    isPremium: {
      type: Boolean,
      default: false,
      index: true
    },
    // System-managed tier group fields
    isSystemGroup: {
      type: Boolean,
      default: false,
      index: true
    },
    tierGroup: {
      type: String,
      enum: ['free', 'premium', null],
      default: null,
      index: true
    },
    // Group settings for admin-controlled messaging
    settings: {
      onlyAdminsCanSend: {
        type: Boolean,
        default: false
      },
      allowedSenders: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }]
    },
    lastMessage: {
      content: String,
      sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      timestamp: Date
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    archivedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ],
    deletedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ]
  },
  {
    timestamps: true
  }
);

// Indexes for efficient queries
chatSchema.index({ 'participants.user': 1 });
chatSchema.index({ type: 1, isPremium: 1 });
chatSchema.index({ updatedAt: -1 });

// Virtual for participant count
chatSchema.virtual('participantCount').get(function () {
  return this.participants.length;
});

// Check if user is participant
chatSchema.methods.isParticipant = function (userId) {
  return this.participants.some(p => {
    // Handle both populated and unpopulated user references
    const participantId = p.user._id || p.user;
    return participantId.toString() === userId.toString();
  });
};

// Get user's permission in chat
chatSchema.methods.getUserPermission = function (userId) {
  const participant = this.participants.find(p => {
    // Handle both populated and unpopulated user references
    const participantId = p.user._id || p.user;
    return participantId.toString() === userId.toString();
  });
  return participant ? participant.permission : null;
};

// Check if user is in allowedSenders list
chatSchema.methods.isAllowedSender = function (userId) {
  if (!this.settings || !this.settings.allowedSenders) return false;
  return this.settings.allowedSenders.some(
    id => id.toString() === userId.toString()
  );
};

// Check if user can send messages (updated for admin-controlled groups)
chatSchema.methods.canSendMessage = function (userId) {
  const permission = this.getUserPermission(userId);
  if (!permission) return false;

  // If onlyAdminsCanSend is enabled
  if (this.settings && this.settings.onlyAdminsCanSend) {
    // Admins can always send
    if (permission === CHAT_PERMISSIONS.ADMIN) return true;
    // Check if user is in allowedSenders list
    return this.isAllowedSender(userId);
  }

  // Normal permission check - member and admin can send
  return [CHAT_PERMISSIONS.MEMBER, CHAT_PERMISSIONS.ADMIN].includes(permission);
};

// Grant send permission to a non-admin user
chatSchema.methods.grantSendPermission = function (userId) {
  if (!this.settings) {
    this.settings = { onlyAdminsCanSend: false, allowedSenders: [] };
  }
  if (!this.settings.allowedSenders) {
    this.settings.allowedSenders = [];
  }
  if (!this.isAllowedSender(userId)) {
    this.settings.allowedSenders.push(userId);
  }
};

// Revoke send permission from a user
chatSchema.methods.revokeSendPermission = function (userId) {
  if (this.settings && this.settings.allowedSenders) {
    this.settings.allowedSenders = this.settings.allowedSenders.filter(
      id => id.toString() !== userId.toString()
    );
  }
};

// Add participant
chatSchema.methods.addParticipant = function (userId, permission = CHAT_PERMISSIONS.MEMBER) {
  if (!this.isParticipant(userId)) {
    this.participants.push({
      user: userId,
      permission,
      joinedAt: new Date()
    });
  }
};

// Remove participant
chatSchema.methods.removeParticipant = function (userId) {
  this.participants = this.participants.filter(p => {
    // Handle both populated and unpopulated user references
    const participantId = p.user._id || p.user;
    return participantId.toString() !== userId.toString();
  });
  // Also remove from allowedSenders if present
  this.revokeSendPermission(userId);
};

// Update last message
chatSchema.methods.updateLastMessage = function (content, sender) {
  this.lastMessage = {
    content,
    sender,
    timestamp: new Date()
  };
};

module.exports = mongoose.model('Chat', chatSchema);
