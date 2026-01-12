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

// Check if user can send messages
chatSchema.methods.canSendMessage = function (userId) {
  const permission = this.getUserPermission(userId);
  if (!permission) return false;

  return [CHAT_PERMISSIONS.MEMBER, CHAT_PERMISSIONS.ADMIN].includes(permission);
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
