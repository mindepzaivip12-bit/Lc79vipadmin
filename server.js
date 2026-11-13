const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors()); 

// Lưu trữ tạm bằng file JSON (khi deploy thật nên dùng MongoDB)
const DB_FILE = path.join(__dirname, 'database.json');
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ keys: [] }));

const getDB = () => JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
const saveDB = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

const ADMIN_PASS = "admin123"; // Đổi mật khẩu này

// API ADMIN: Lấy danh sách key
app.get('/api/admin/keys', (req, res) => {
  const pass = req.headers['authorization'];
  if (pass !== ADMIN_PASS) return res.status(403).json({ error: "Sai mật khẩu" });
  const db = getDB();
  res.json(db.keys);
});

// API ADMIN: Tạo key mới
app.post('/api/admin/create', (req, res) => {
  const { password, days } = req.body;
  if (password !== ADMIN_PASS) return res.status(403).json({ error: "Sai mật khẩu" });

  const db = getDB();
  const newKey = 'NX-' + crypto.randomBytes(6).toString('hex').toUpperCase();
  
  db.keys.unshift({
    key: newKey,
    days: days, // Số ngày (9999 = vĩnh viễn)
    created_at: Date.now(),
    activated_at: null,
    expires_at: null,
    ip: null,
    device: null
  });
  
  saveDB(db);
  res.json({ success: true, key: newKey });
});

// API ADMIN: Xóa key
app.post('/api/admin/delete', (req, res) => {
  const { password, key } = req.body;
  if (password !== ADMIN_PASS) return res.status(403).json({ error: "Sai mật khẩu" });
  const db = getDB();
  db.keys = db.keys.filter(k => k.key !== key);
  saveDB(db);
  res.json({ success: true });
});

// API CLIENT: Kích hoạt key
app.post('/api/activate', (req, res) => {
  const { key } = req.body;
  const db = getDB();
  const keyData = db.keys.find(k => k.key === key);

  if (!keyData) return res.json({ success: false, message: "Key không tồn tại!" });

  // Lấy IP thật (sau proxy Render)
  const clientIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const clientDevice = req.headers['user-agent'];

  if (keyData.activated_at !== null) {
    if (keyData.ip !== clientIP) return res.json({ success: false, message: "Key đã bị khóa bởi IP khác!" });
    if (keyData.device !== clientDevice) return res.json({ success: false, message: "Key đã bị khóa bởi thiết bị khác!" });
    return res.json({ success: true, message: "Đăng nhập thành công", expires_at: new Date(keyData.expires_at).toLocaleString("vi-VN") });
  }

  // Kích hoạt lần đầu -> Bắt đầu tính giờ
  const now = Date.now();
  const msInDay = 24 * 60 * 60 * 1000;
  const expires = daysCheck(keyData.days) ? now + (keyData.days * msInDay) : now + 100 * 365 * msInDay;

  keyData.activated_at = now;
  keyData.expires_at = expires;
  keyData.ip = clientIP;
  keyData.device = clientDevice;

  saveDB(db);
  res.json({ success: true, message: "Kích hoạt thành công!", expires_at: new Date(expires).toLocaleString("vi-VN") });
});

function daysCheck(days) { return days > 0 && days < 9999; }

// API CLIENT: Check xem key còn hạn không (Gọi khi load trang)
app.post('/api/check', (req, res) => {
  const { key } = req.body;
  const db = getDB();
  const keyData = db.keys.find(k => k.key === key);

  if (!keyData) return res.json({ valid: false, message: "Key không tồn tại" });
  if (keyData.activated_at === null) return res.json({ valid: false, message: "Key chưa kích hoạt" });

  const clientIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const clientDevice = req.headers['user-agent'];

  if (keyData.ip !== clientIP || keyData.device !== clientDevice) {
    return res.json({ valid: false, message: "Thiết bị/IP không khớp!" });
  }

  if (Date.now() > keyData.expires_at) {
    return res.json({ valid: false, message: "Key đã hết hạn!" });
  }

  res.json({ valid: true, expires_at: new Date(keyData.expires_at).toLocaleString("vi-VN") });
});

app.listen(3000, () => console.log('Server chạy tại port 3000'));
