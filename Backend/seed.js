require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MONGO = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/hqs_db';

const HospitalSchema = new mongoose.Schema({ name: String, address: String, phone: String });
const DepartmentSchema = new mongoose.Schema({
  hospitalId: mongoose.Schema.Types.ObjectId,
  name: String, code: String,
  counters: [{ label: String }],
  avgServiceSeconds: { type: Number, default: 300 },
  isActive: { type: Boolean, default: true }
});
const StaffSchema = new mongoose.Schema({
  hospitalId: mongoose.Schema.Types.ObjectId,
  username: { type: String, unique: true },
  passwordHash: String, role: String, name: String,
  deptId: mongoose.Schema.Types.ObjectId,
  counterLabel: String
});

const Hospital   = mongoose.model('Hospital',   HospitalSchema);
const Department = mongoose.model('Department', DepartmentSchema);
const Staff      = mongoose.model('Staff',      StaffSchema);

async function hash(pw) { return bcrypt.hash(pw, 10); }

mongoose.connect(MONGO).then(async () => {
  console.log('Connected. Seeding...');

  // Hospital
  let hospital = await Hospital.findOne({ name: 'City General Hospital' });
  if (!hospital) hospital = await Hospital.create({ name: 'City General Hospital', address: '123 Main Street', phone: '011-12345678' });
  console.log('Hospital:', hospital.name);

  // Departments
  const deptDefs = [
    { name: 'OPD',          code: 'opd',  counters: [{ label: 'Counter 1' }, { label: 'Counter 2' }] },
    { name: 'Cardiology',   code: 'card', counters: [{ label: 'Counter 1' }] },
    { name: 'Radiology',    code: 'rad',  counters: [{ label: 'Counter 1' }] },
    { name: 'Pharmacy',     code: 'phar', counters: [{ label: 'Counter 1' }, { label: 'Counter 2' }] },
    { name: 'Laboratory',   code: 'lab',  counters: [{ label: 'Counter 1' }] },
  ];
  const depts = {};
  for (const d of deptDefs) {
    let dept = await Department.findOne({ hospitalId: hospital._id, code: d.code });
    if (!dept) dept = await Department.create({ hospitalId: hospital._id, ...d });
    depts[d.code] = dept;
    console.log('  Dept:', dept.name);
  }

  // Staff
  const staffDefs = [
    { username: 'admin',      password: 'admin123',    name: 'System Admin',  role: 'admin',     deptCode: null },
    { username: 'reception1', password: 'password123', name: 'Reception - A', role: 'reception', deptCode: 'opd',  counter: 'Counter 1' },
    { username: 'reception2', password: 'password123', name: 'Reception - B', role: 'reception', deptCode: 'opd',  counter: 'Counter 2' },
    { username: 'doctor1',    password: 'doctor123',   name: 'Dr. A. Sharma', role: 'doctor',    deptCode: 'card', counter: 'Counter 1' },
  ];
  for (const s of staffDefs) {
    const existing = await Staff.findOne({ username: s.username });
    if (!existing) {
      await Staff.create({
        hospitalId: hospital._id,
        username: s.username,
        passwordHash: await hash(s.password),
        name: s.name,
        role: s.role,
        deptId: s.deptCode ? depts[s.deptCode]._id : undefined,
        counterLabel: s.counter
      });
      console.log(`  Staff: ${s.username} / ${s.password}`);
    } else {
      console.log(`  Staff already exists: ${s.username}`);
    }
  }

  console.log('\nSeed complete!');
  console.log('Logins:');
  console.log('  admin      / admin123');
  console.log('  reception1 / password123');
  console.log('  reception2 / password123');
  console.log('  doctor1    / doctor123');
  process.exit(0);
}).catch(err => { console.error(err); process.exit(1); });
