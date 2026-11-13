const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors()); 

const DB_FILE = path.join(__dirname, 'database.json');
const CONFIG_FILE = path.join(__dirname, 'config.json');

// Khởi tạo file nếu chưa có
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ keys: [] }));
if (!fs.existsSync(CONFIG_FILE)) fs.writeFileSync(CONFIG_FILE, JSON.stringify({ maintenance: false, custom_html: "" }));

const getDB = () => JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
const saveDB = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
const getConfig = () => JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
const saveConfig = (data) => fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2));

const ADMIN_PASS = "admin123"; // Mật khẩu Admin

// ==========================================
// API CẤU HÌNH (BẢO TRÌ & HTML)
// ==========================================
app.get('/api/config', (req, res) => {
  res.json(getConfig());
});

app.post('/api/admin/config', (req, res) => {
  const { password, maintenance, custom_html } = req.body;
  if (password !== ADMIN_PASS) return res.status(403).json({ error: "Sai mật khẩu" });
  saveConfig({ maintenance, custom_html });
  res.json({ success: true });
});

// ==========================================
// API ADMIN QUẢN LÝ KEY
// ==========================================
app.get('/api/admin/keys', (req, res) => {
  if (req.headers['authorization'] !== ADMIN_PASS) return res.status(403).json({ error: "Sai mật khẩu" });
  res.json(getDB().keys);
});

app.post('/api/admin/create', (req, res) => {
  const { password, days } = req.body;
  if (password !== ADMIN_PASS) return res.status(403).json({ error: "Sai mật khẩu" });

  const db = getDB();
  const newKey = 'NX-' + crypto.randomBytes(6).toString('hex').toUpperCase();
  db.keys.unshift({ key: newKey, days: days, created_at: Date.now(), activated_at: null, expires_at: null, ip: null, device: null });
  saveDB(db);
  res.json({ success: true, key: newKey });
});

app.post('/api/admin/delete', (req, res) => {
  const { password, key } = req.body;
  if (password !== ADMIN_PASS) return res.status(403).json({ error: "Sai mật khẩu" });
  const db = getDB();
  db.keys = db.keys.filter(k => k.key !== key);
  saveDB(db);
  res.json({ success: true });
});

// ==========================================
// API CLIENT KÍCH HOẠT & CHECK
// ==========================================
app.post('/api/activate', (req, res) => {
  const { key } = req.body;
  const db = getDB();
  const keyData = db.keys.find(k => k.key === key);
  if (!keyData) return res.json({ success: false, message: "Key không tồn tại!" });

  const clientIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const clientDevice = req.headers['user-agent'];

  if (keyData.activated_at !== null) {
    if (keyData.ip !== clientIP) return res.json({ success: false, message: "Key đã khóa bởi IP khác!" });
    if (keyData.device !== clientDevice) return res.json({ success: false, message: "Key đã khóa bởi thiết bị khác!" });
    return res.json({ success: true, expires_at: new Date(keyData.expires_at).toLocaleString("vi-VN") });
  }

  const now = Date.now();
  const expires = keyData.days >= 9999 ? now + 100*365*24*3600*1000 : now + (keyData.days * 24 * 3600 * 1000);
  keyData.activated_at = now; keyData.expires_at = expires; keyData.ip = clientIP; keyData.device = clientDevice;
  saveDB(db);
  res.json({ success: true, expires_at: new Date(expires).toLocaleString("vi-VN") });
});

app.post('/api/check', (req, res) => {
  const { key } = req.body;
  const db = getDB();
  const keyData = db.keys.find(k => k.key === key);
  if (!keyData) return res.json({ valid: false, message: "Key không tồn tại" });
  if (keyData.activated_at === null) return res.json({ valid: false, message: "Key chưa kích hoạt" });

  const clientIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const clientDevice = req.headers['user-agent'];

  if (keyData.ip !== clientIP || keyData.device !== clientDevice) return res.json({ valid: false, message: "Thiết bị/IP không khớp!" });
  if (Date.now() > keyData.expires_at) return res.json({ valid: false, message: "Key đã hết hạn!" });

  res.json({ valid: true, expires_at: new Date(keyData.expires_at).toLocaleString("vi-VN") });
});

app.listen(3000, () => console.log('Server chạy tại port 3000'));
