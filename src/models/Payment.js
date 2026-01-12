/**
 * Payment Model
 * Tracks payment transactions for subscriptions
 */

const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    subscription: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subscription',
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: 'USD',
      uppercase: true,
      minlength: 3,
      maxlength: 3,
    },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'completed', 'failed', 'refunded', 'cancelled'],
      default: 'pending',
      index: true,
    },
    paymentMethod: {
      type: String,
      enum: ['credit_card', 'debit_card', 'paypal', 'stripe', 'bank_transfer', 'crypto', 'other'],
      default: 'credit_card',
    },
    provider: {
      type: String,
      enum: ['stripe', 'paypal', 'square', 'manual', 'other'],
      default: 'stripe',
    },
    providerPaymentId: {
      type: String,
      index: true,
    },
    providerCustomerId: {
      type: String,
    },
    refundedAt: {
      type: Date,
    },
    refundReason: {
      type: String,
      maxlength: 500,
    },
    refundAmount: {
      type: Number,
      min: 0,
    },
    failureReason: {
      type: String,
      maxlength: 500,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
paymentSchema.index({ user: 1, status: 1 });
paymentSchema.index({ subscription: 1, createdAt: -1 });
paymentSchema.index({ createdAt: -1 });

// Virtual for checking if payment is successful
paymentSchema.virtual('isSuccessful').get(function () {
  return this.status === 'completed';
});

// Method to mark payment as completed
paymentSchema.methods.markCompleted = async function () {
  this.status = 'completed';
  return await this.save();
};

// Method to mark payment as failed
paymentSchema.methods.markFailed = async function (reason) {
  this.status = 'failed';
  this.failureReason = reason;
  return await this.save();
};

// Method to refund payment
paymentSchema.methods.refund = async function (amount, reason) {
  this.status = 'refunded';
  this.refundedAt = new Date();
  this.refundAmount = amount || this.amount;
  this.refundReason = reason;
  return await this.save();
};

// Static method to get payment stats
paymentSchema.statics.getStats = async function (startDate, endDate) {
  const matchQuery = {};
  if (startDate || endDate) {
    matchQuery.createdAt = {};
    if (startDate) matchQuery.createdAt.$gte = new Date(startDate);
    if (endDate) matchQuery.createdAt.$lte = new Date(endDate);
  }

  const stats = await this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' },
      },
    },
  ]);

  return stats;
};

const Payment = mongoose.model('Payment', paymentSchema);

module.exports = Payment;
