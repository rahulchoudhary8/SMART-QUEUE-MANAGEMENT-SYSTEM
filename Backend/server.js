require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Redis = require('ioredis');
const twilio = require('twilio');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(bodyParser.json());

const MONGO  = process.env.MONGO_URI   || 'mongodb://127.0.0.1:27017/hqs_db';
const SECRET = process.env.JWT_SECRET  || 'devsecret';
const REDIS_URL = process.env.REDIS_URL || null;

// Twilio (optional — only active when env vars set)
const twilioClient = (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN)
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

mongoose.connect(MONGO, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('Mongo err', err));

let redis = null;
if (REDIS_URL) {
  try {
    redis = new Redis(REDIS_URL);
    redis.on('error', e => console.warn('Redis warn:', e.message));
  } catch (e) {
    console.warn('Redis unavailable, fallback to Mongo counters');
    redis = null;
  }
} else {
  console.log('Redis not configured (REDIS_URL not set); using Mongo counters');
}

// ─── Schemas ────────────────────────────────────────────────────────────────

const HospitalSchema = new mongoose.Schema({
  name:    { type: String, required: true },
  address: String,
  phone:   String,
  createdAt: { type: Date, default: Date.now }
});
const Hospital = mongoose.model('Hospital', HospitalSchema);

const DepartmentSchema = new mongoose.Schema({
  hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true },
  name:       { type: String, required: true },   // e.g. "OPD", "Cardiology"
  code:       { type: String, required: true },   // e.g. "opd", "card"
  counters:   [{ label: String }],                // e.g. [{label:"Counter 1"},{label:"Counter 2"}]
  avgServiceSeconds: { type: Number, default: 300 }, // rolling avg seconds per token
  isActive:   { type: Boolean, default: true },
  createdAt:  { type: Date, default: Date.now }
});
const Department = mongoose.model('Department', DepartmentSchema);

const StaffSchema = new mongoose.Schema({
  hospitalId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
  username:    { type: String, unique: true },
  passwordHash: String,
  role:        { type: String, enum: ['admin', 'reception', 'doctor'], default: 'reception' },
  name:        String,
  deptId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Department' }, // assigned dept
  counterLabel: String,  // e.g. "Counter 2"
  createdAt:   { type: Date, default: Date.now }
});
const Staff = mongoose.model('Staff', StaffSchema);

const TokenSchema = new mongoose.Schema({
  hospitalId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
  deptId:          { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
  deptCode:        String,
  tokenNumber:     Number,
  patientName:     String,
  phone:           String,
  status:          { type: String, default: 'waiting', enum: ['waiting','active','done','skipped'] },
  priority:        { type: String, default: 'normal', enum: ['normal','elderly','emergency'] },
  source:          { type: String, default: 'app' },
  assignedCounter: String,
  calledBy:        { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
  createdAt:       { type: Date, default: Date.now },
  calledAt:        Date,
  servedAt:        Date,
  serviceSeconds:  Number   // how long this token took (set when marked done)
});
const Token = mongoose.model('Token', TokenSchema);

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateJWT(staff) {
  return jwt.sign(
    { id: staff._id, username: staff.username, role: staff.role, name: staff.name,
      hospitalId: staff.hospitalId?.toString(), deptId: staff.deptId?.toString(),
      counterLabel: staff.counterLabel },
    SECRET,
    { expiresIn: '8h' }
  );
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'no token' });
  try {
    req.staff = jwt.verify(header.split(' ')[1], SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'invalid token' });
  }
}

function adminOnly(req, res, next) {
  if (req.staff.role !== 'admin') return res.status(403).json({ error: 'admin only' });
  next();
}

async function getNextTokenNumber(deptId) {
  if (redis) {
    return await redis.incr(`dept:${deptId}:counter`);
  }
  const last = await Token.findOne({ deptId }).sort({ tokenNumber: -1 });
  return (last?.tokenNumber || 0) + 1;
}

/** Returns estimated wait seconds for position `position` (1-based) in a dept */
async function estimateWait(dept, position) {
  const avg = dept.avgServiceSeconds || 300;
  return avg * position;
}

/** Update rolling avg service time for a dept after a token is done */
async function updateAvgService(deptId, serviceSeconds) {
  if (!serviceSeconds || serviceSeconds <= 0) return;
  const dept = await Department.findById(deptId);
  if (!dept) return;
  // exponential moving average (alpha=0.2)
  dept.avgServiceSeconds = Math.round(0.8 * dept.avgServiceSeconds + 0.2 * serviceSeconds);
  await dept.save();
}

async function sendSMS(phone, message) {
  if (!twilioClient) {
    console.log('[SMS skipped - Twilio not configured]', message);
    return;
  }
  try {
    await twilioClient.messages.create({
      body: message,
      from: process.env.TWILIO_FROM,
      to: phone.startsWith('+') ? phone : `+91${phone}`
    });
  } catch (e) {
    console.warn('SMS send failed:', e.message);
  }
}

// ─── Auth Routes ─────────────────────────────────────────────────────────────

app.post('/api/staff/login', async (req, res) => {
  const { username, password } = req.body;
  const staff = await Staff.findOne({ username });
  if (!staff) return res.status(401).json({ error: 'invalid credentials' });
  const ok = await bcrypt.compare(password, staff.passwordHash);
  if (!ok) return res.status(401).json({ error: 'invalid credentials' });
  res.json({
    token: generateJWT(staff),
    staff: { username: staff.username, name: staff.name, role: staff.role,
             deptId: staff.deptId, counterLabel: staff.counterLabel }
  });
});

// ─── Admin: Hospital Management ──────────────────────────────────────────────

app.get('/api/admin/hospitals', authMiddleware, adminOnly, async (req, res) => {
  const hospitals = await Hospital.find().sort({ createdAt: -1 });
  res.json(hospitals);
});

app.post('/api/admin/hospitals', authMiddleware, adminOnly, async (req, res) => {
  const { name, address, phone } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const h = await Hospital.create({ name, address, phone });
  res.json(h);
});

app.put('/api/admin/hospitals/:hId', authMiddleware, adminOnly, async (req, res) => {
  const h = await Hospital.findByIdAndUpdate(req.params.hId, req.body, { new: true });
  res.json(h);
});

// ─── Admin: Department Management ────────────────────────────────────────────

app.get('/api/admin/hospitals/:hId/departments', authMiddleware, adminOnly, async (req, res) => {
  const depts = await Department.find({ hospitalId: req.params.hId });
  res.json(depts);
});

app.post('/api/admin/hospitals/:hId/departments', authMiddleware, adminOnly, async (req, res) => {
  const { name, code, counters } = req.body;
  if (!name || !code) return res.status(400).json({ error: 'name and code required' });
  const dept = await Department.create({
    hospitalId: req.params.hId,
    name,
    code: code.toLowerCase(),
    counters: counters || [{ label: 'Counter 1' }]
  });
  res.json(dept);
});

app.put('/api/admin/departments/:dId', authMiddleware, adminOnly, async (req, res) => {
  const dept = await Department.findByIdAndUpdate(req.params.dId, req.body, { new: true });
  res.json(dept);
});

app.delete('/api/admin/departments/:dId', authMiddleware, adminOnly, async (req, res) => {
  await Department.findByIdAndUpdate(req.params.dId, { isActive: false });
  res.json({ success: true });
});

// ─── Admin: Staff Management ──────────────────────────────────────────────────

app.get('/api/admin/staff', authMiddleware, adminOnly, async (req, res) => {
  const staff = await Staff.find().select('-passwordHash').populate('deptId', 'name');
  res.json(staff);
});

app.post('/api/admin/staff', authMiddleware, adminOnly, async (req, res) => {
  const { username, password, name, role, hospitalId, deptId, counterLabel } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'missing fields' });
  if (await Staff.findOne({ username })) return res.status(400).json({ error: 'username taken' });
  const hash = await bcrypt.hash(password, 10);
  const s = await Staff.create({ username, passwordHash: hash, name, role, hospitalId, deptId, counterLabel });
  res.json({ success: true, id: s._id });
});

app.put('/api/admin/staff/:sId', authMiddleware, adminOnly, async (req, res) => {
  const { password, ...rest } = req.body;
  if (password) rest.passwordHash = await bcrypt.hash(password, 10);
  const s = await Staff.findByIdAndUpdate(req.params.sId, rest, { new: true }).select('-passwordHash');
  res.json(s);
});

app.delete('/api/admin/staff/:sId', authMiddleware, adminOnly, async (req, res) => {
  await Staff.findByIdAndDelete(req.params.sId);
  res.json({ success: true });
});

// ─── Admin: Analytics ────────────────────────────────────────────────────────

app.get('/api/admin/analytics', authMiddleware, adminOnly, async (req, res) => {
  const { hId, deptId, from, to } = req.query;
  const match = {};
  if (hId)    match.hospitalId = mongoose.Types.ObjectId(hId);
  if (deptId) match.deptId     = mongoose.Types.ObjectId(deptId);
  if (from || to) {
    match.createdAt = {};
    if (from) match.createdAt.$gte = new Date(from);
    if (to)   match.createdAt.$lte = new Date(to);
  }

  const [totals, byStatus, byPriority, byHour] = await Promise.all([
    Token.countDocuments(match),
    Token.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Token.aggregate([{ $match: match }, { $group: { _id: '$priority', count: { $sum: 1 } } }]),
    Token.aggregate([
      { $match: match },
      { $group: { _id: { $hour: '$createdAt' }, count: { $sum: 1 } } },
      { $sort: { '_id': 1 } }
    ])
  ]);

  res.json({ totals, byStatus, byPriority, byHour });
});

// ─── Admin: Reset Department Queue ───────────────────────────────────────────

app.post('/api/admin/dept/:dId/reset', authMiddleware, adminOnly, async (req, res) => {
  const { dId } = req.params;
  try {
    const result = await Token.deleteMany({ deptId: dId });
    if (redis) await redis.set(`dept:${dId}:counter`, 0);
    await Department.findByIdAndUpdate(dId, { avgServiceSeconds: 300 });
    io.to(`dept_${dId}`).emit('queue-updated');
    res.json({ success: true, deletedTokens: result.deletedCount });
  } catch (err) {
    console.error('Reset error', err);
    res.status(500).json({ error: 'Reset failed' });
  }
});

app.post('/api/admin/hospital/:hId/reset-all', authMiddleware, adminOnly, async (req, res) => {
  const { hId } = req.params;
  try {
    const depts = await Department.find({ hospitalId: hId });
    const result = await Token.deleteMany({ hospitalId: hId });
    if (redis) {
      for (const d of depts) {
        await redis.set(`dept:${d._id}:counter`, 0);
        io.to(`dept_${d._id}`).emit('queue-updated');
      }
    }
    await Department.updateMany({ hospitalId: hId }, { avgServiceSeconds: 300 });
    res.json({ success: true, deletedTokens: result.deletedCount, deptsReset: depts.length });
  } catch (err) {
    console.error('Reset all error', err);
    res.status(500).json({ error: 'Reset failed' });
  }
});

// ─── Public: List hospitals & departments ─────────────────────────────────────

app.get('/api/public/hospitals', async (req, res) => {
  const hospitals = await Hospital.find();
  res.json(hospitals);
});

app.get('/api/public/hospitals/:hId/departments', async (req, res) => {
  const depts = await Department.find({ hospitalId: req.params.hId, isActive: true })
    .select('name code counters avgServiceSeconds');
  res.json(depts);
});

// ─── Patient: Book Token ──────────────────────────────────────────────────────

app.post('/api/hospital/:hId/dept/:dId/token', async (req, res) => {
  try {
    const { patientName, phone, priority, source } = req.body;
    if (!phone || !/^\d{10}$/.test(phone.trim()))
      return res.status(400).json({ error: 'Phone number must be exactly 10 digits' });
    const dept = await Department.findById(req.params.dId);
    if (!dept) return res.status(404).json({ error: 'dept not found' });

    const tokenNumber = await getNextTokenNumber(dept._id);

    // Count how many are ahead
    const ahead = await Token.countDocuments({ deptId: dept._id, status: 'waiting' });
    const etaSeconds = await estimateWait(dept, ahead + 1);
    const etaMin = Math.ceil(etaSeconds / 60);

    const token = await Token.create({
      hospitalId: req.params.hId,
      deptId: dept._id,
      deptCode: dept.code,
      tokenNumber,
      patientName,
      phone,
      priority: priority || 'normal',
      source: source || 'app'
    });

    io.to(`dept_${dept._id}`).emit('queue-updated');

    // SMS notification
    if (phone) {
      const msg = `HQS: Your token for ${dept.name} is *${tokenNumber}*. Approx wait: ${etaMin} min. Show this at reception.`;
      sendSMS(phone, msg);
    }

    return res.json({ success: true, tokenNumber, etaMinutes: etaMin, deptId: dept._id });
  } catch (err) {
    console.error('create token err', err);
    return res.status(500).json({ error: 'server error' });
  }
});

// ─── Patient: Token Status Check ──────────────────────────────────────────────

app.get('/api/token/status', async (req, res) => {
  const { tokenNumber, deptId } = req.query;
  if (!tokenNumber || !deptId) return res.status(400).json({ error: 'tokenNumber and deptId required' });

  const token = await Token.findOne({ tokenNumber: parseInt(tokenNumber), deptId });
  if (!token) return res.status(404).json({ error: 'token not found' });

  const dept = await Department.findById(deptId);
  const ahead = await Token.countDocuments({ deptId, tokenNumber: { $lt: token.tokenNumber }, status: 'waiting' });
  const etaSeconds = token.status === 'waiting' ? await estimateWait(dept, ahead + 1) : 0;

  res.json({
    tokenNumber: token.tokenNumber,
    patientName: token.patientName,
    status: token.status,
    priority: token.priority,
    positionAhead: ahead,
    etaMinutes: Math.ceil(etaSeconds / 60),
    assignedCounter: token.assignedCounter,
    deptName: dept?.name
  });
});

// ─── Staff: Queue ─────────────────────────────────────────────────────────────

app.get('/api/dept/:dId/queue', authMiddleware, async (req, res) => {
  // Fetch all tokens and sort in-memory so priority order is correct:
  // active first → waiting (emergency → elderly → normal by tokenNumber) → done → skipped
  const PRIORITY_ORDER = { emergency: 0, elderly: 1, normal: 2 };
  const STATUS_ORDER   = { active: 0, waiting: 1, done: 2, skipped: 3 };

  const tokens = await Token.find({ deptId: req.params.dId }).limit(500).lean();

  tokens.sort((a, b) => {
    const so = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
    if (so !== 0) return so;
    if (a.status === 'waiting' && b.status === 'waiting') {
      const po = (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9);
      if (po !== 0) return po;
    }
    return a.tokenNumber - b.tokenNumber;
  });

  res.json(tokens);
});

app.get('/api/dept/:dId/summary', authMiddleware, async (req, res) => {
  const deptId = req.params.dId;
  const dept = await Department.findById(deptId);
  const [waiting, active, done, skipped] = await Promise.all([
    Token.countDocuments({ deptId, status: 'waiting' }),
    Token.countDocuments({ deptId, status: 'active' }),
    Token.countDocuments({ deptId, status: 'done' }),
    Token.countDocuments({ deptId, status: 'skipped' })
  ]);
  const waitingTokens = await Token.find({ deptId, status: 'waiting' }).sort({ tokenNumber: 1 });
  const etaMinutes = waitingTokens.length
    ? Math.ceil(await estimateWait(dept, 1) / 60)
    : 0;
  res.json({ waiting, active, done, skipped, etaMinutes, avgServiceSeconds: dept?.avgServiceSeconds });
});

// ─── Staff: Call Next ─────────────────────────────────────────────────────────

app.post('/api/dept/:dId/staff/call', authMiddleware, async (req, res) => {
  const deptId = req.params.dId;
  const { counterLabel } = req.body; // which counter is calling
  try {
    // Complete current active token for this counter (if any)
    const prev = await Token.findOne({ deptId, status: 'active', assignedCounter: counterLabel || { $exists: true } });
    if (prev) {
      const serviceSeconds = prev.calledAt ? Math.round((Date.now() - prev.calledAt) / 1000) : null;
      prev.status = 'done';
      prev.servedAt = new Date();
      prev.serviceSeconds = serviceSeconds;
      await prev.save();
      if (serviceSeconds) updateAvgService(deptId, serviceSeconds);
    }

    // Sort: emergency first, then elderly, then normal, then by token number
    const priorityOrder = { emergency: 0, elderly: 1, normal: 2 };
    const waiting = await Token.find({ deptId, status: 'waiting' }).sort({ tokenNumber: 1 });
    if (!waiting.length) return res.json({ success: false, message: 'no waiting tokens' });

    waiting.sort((a, b) => (priorityOrder[a.priority] - priorityOrder[b.priority]) || a.tokenNumber - b.tokenNumber);
    const next = waiting[0];

    next.status = 'active';
    next.calledAt = new Date();
    next.assignedCounter = counterLabel || req.staff.counterLabel || 'Counter 1';
    next.calledBy = req.staff.id;
    await next.save();

    io.to(`dept_${deptId}`).emit('call-token', { tokenNumber: next.tokenNumber, counter: next.assignedCounter });
    io.to(`dept_${deptId}`).emit('queue-updated');

    // SMS to patient
    if (next.phone) {
      sendSMS(next.phone, `HQS: Token ${next.tokenNumber} — please proceed to ${next.assignedCounter}.`);
    }

    return res.json({ success: true, token: next.tokenNumber, counter: next.assignedCounter });
  } catch (err) {
    console.error('call next err', err);
    return res.status(500).json({ error: 'server error' });
  }
});

// ─── Staff: Mark Done / Skip ──────────────────────────────────────────────────

app.post('/api/dept/:dId/staff/mark', authMiddleware, async (req, res) => {
  const { tokenNumber, action } = req.body;
  const t = await Token.findOne({ deptId: req.params.dId, tokenNumber });
  if (!t) return res.status(404).json({ error: 'not found' });

  if (action === 'done') {
    const serviceSeconds = t.calledAt ? Math.round((Date.now() - t.calledAt) / 1000) : null;
    t.status = 'done';
    t.servedAt = new Date();
    t.serviceSeconds = serviceSeconds;
    if (serviceSeconds) updateAvgService(req.params.dId, serviceSeconds);
  } else {
    t.status = 'skipped';
  }
  await t.save();
  io.to(`dept_${req.params.dId}`).emit('queue-updated');
  return res.json({ success: true });
});

// ─── Display Board: Public queue (no auth) ────────────────────────────────────

app.get('/api/public/dept/:dId/display', async (req, res) => {
  const tokens = await Token.find({ deptId: req.params.dId, status: { $in: ['active', 'waiting'] } })
    .sort({ status: -1, tokenNumber: 1 })
    .limit(20);
  const dept = await Department.findById(req.params.dId).select('name');
  res.json({ dept, tokens });
});

// ─── Socket.io ────────────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  socket.on('join-dept', (deptId) => socket.join(`dept_${deptId}`));
  socket.on('disconnect', () => {});
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`HQS server running on :${PORT}`));
