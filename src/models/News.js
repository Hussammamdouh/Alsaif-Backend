const mongoose = require('mongoose');

const NewsSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  content: {
    type: String,
    required: true,
  },
  imageUrl: {
    type: String,
    trim: true,
  },
  sourceUrl: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  publishedAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('News', NewsSchema);
