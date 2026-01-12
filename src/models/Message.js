const mongoose = require('mongoose');
const { MESSAGE_STATUS } = require('../constants');

const messageSchema = new mongoose.Schema(
  {
    chat: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Chat',
      required: true,
      index: true
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    content: {
      type: String,
      required: [true, 'Message content is required'],
      trim: true,
      maxlength: [5000, 'Message cannot exceed 5000 characters']
    },
    type: {
      type: String,
      enum: ['text', 'file', 'image', 'video', 'audio'],
      default: 'text'
    },
    file: {
      url: String,
      name: String,
      size: Number,
      mimeType: String
    },
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null
    },
    status: {
      type: String,
      enum: Object.values(MESSAGE_STATUS),
      default: MESSAGE_STATUS.SENT
    },
    readBy: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        readAt: {
          type: Date,
          default: Date.now
        }
      }
    ],
    isEdited: {
      type: Boolean,
      default: false
    },
    editedAt: Date,
    isDeleted: {
      type: Boolean,
      default: false
    },
    deletedAt: Date,
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    isPinned: {
      type: Boolean,
      default: false
    },
    pinnedAt: Date,
    pinnedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reactions: [
      {
        emoji: {
          type: String,
          required: true
        },
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true
        },
        createdAt: {
          type: Date,
          default: Date.now
        }
      }
    ],
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true
  }
);

// Indexes for efficient queries
messageSchema.index({ chat: 1, createdAt: -1 });
messageSchema.index({ sender: 1, createdAt: -1 });
messageSchema.index({ chat: 1, status: 1 });
// PERFORMANCE: Index for bulk markAsRead query
messageSchema.index({ chat: 1, sender: 1, 'readBy.user': 1 });

// Mark message as read by user
messageSchema.methods.markAsRead = function (userId) {
  const alreadyRead = this.readBy.some(
    r => r.user.toString() === userId.toString()
  );

  if (!alreadyRead) {
    this.readBy.push({
      user: userId,
      readAt: new Date()
    });

    // Update status if it was just sent or delivered
    if (this.status === MESSAGE_STATUS.SENT || this.status === MESSAGE_STATUS.DELIVERED) {
      this.status = MESSAGE_STATUS.READ;
    }
  }
};

// Check if user has read the message
messageSchema.methods.isReadBy = function (userId) {
  return this.readBy.some(r => r.user.toString() === userId.toString());
};

// Soft delete
messageSchema.methods.softDelete = function (userId) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = userId;
  this.content = '[Message deleted]';
};

module.exports = mongoose.model('Message', messageSchema);
