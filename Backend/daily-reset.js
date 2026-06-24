/**
 * HQS Daily Reset Script
 * Clears all tokens and resets counters to 0 for every department.
 *
 * Run manually:   node daily-reset.js
 * Run via cron:   0 0 * * * /usr/bin/node /path/to/backend/daily-reset.js >> /var/log/hqs-reset.log 2>&1
 * (Above cron runs at midnight every day)
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Redis    = require('ioredis');

const MONGO     = process.env.MONGO_URI  || 'mongodb://127.0.0.1:27017/hqs_db';
const REDIS_URL = process.env.REDIS_URL  || 'redis://127.0.0.1:6379';

const DepartmentSchema = new mongoose.Schema({ avgServiceSeconds: Number });
const TokenSchema      = new mongoose.Schema({});
const Department = mongoose.model('Department', DepartmentSchema);
const Token      = mongoose.model('Token',      TokenSchema);

async function run() {
  console.log(`\n[${new Date().toISOString()}] Starting daily reset...`);

  await mongoose.connect(MONGO, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('MongoDB connected.');

  // Delete all tokens
  const del = await Token.deleteMany({});
  console.log(`Deleted ${del.deletedCount} tokens from MongoDB.`);

  // Reset avg service time
  await Department.updateMany({}, { avgServiceSeconds: 300 });
  console.log('Reset avgServiceSeconds to 300 for all departments.');

  // Reset Redis counters
  let redis;
  try {
    redis = new Redis(REDIS_URL);
    const keys = await redis.keys('dept:*:counter');
    if (keys.length) {
      await redis.del(...keys);
      console.log(`Cleared ${keys.length} Redis counter(s): ${keys.join(', ')}`);
    } else {
      console.log('No Redis counters found (will start from 1 on next booking).');
    }
    redis.disconnect();
  } catch (e) {
    console.warn('Redis not available:', e.message, '(MongoDB fallback will handle counters)');
  }

  console.log(`[${new Date().toISOString()}] Reset complete. All queues start from token 1.\n`);
  process.exit(0);
}

run().catch(err => { console.error('Reset failed:', err); process.exit(1); });
