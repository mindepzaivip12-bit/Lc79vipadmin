const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const DB_FILE = path.join(__dirname, 'database.json');
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ keys: [] }));

const getDB = () => JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
const saveDB = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

const ADMIN_PASS = "admin123"; // Đổi pass tại đây

// GIAO DIỆN ADMIN (Giữ nguyên như cũ)
app.get('/', (req, res) => { /* ... Copy đoạn HTML Admin cũ vào đây ... */ });

// API KÍCH HOẠT
app.post('/api/activate', (req, res) => {
  const { key } = req.body;
  const db = getDB();
  const keyData = db.keys.find(k => k.key === key);
  
  if (!keyData) return res.json({ success: false, msg: "Key không tồn tại!" });

  const clientIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const clientDevice = req.headers['user-agent']; // Nhận diện thiết bị

  // Nếu key đã được kích hoạt trước đó
  if (keyData.activated_at !== null) {
    // Kiểm tra IP (chặn nếu khác IP)
    if (keyData.ip !== clientIP) {
      return res.json({ success: false, msg: "Key đã bị khóa bởi IP khác!" });
    }
    // Kiểm tra Thiết bị (chặn nếu khác máy)
    if (keyData.device !== clientDevice) {
      return res.json({ success: false, msg: "Key đã bị khóa bởi thiết bị khác!" });
    }
    // Kiểm tra Hạn sử dụng
    if (Date.now() > keyData.expires_at) {
      return res.json({ success: false, msg: "Key đã hết hạn sử dụng!" });
    }
    
    // Hợp lệ -> Trả về thời gian còn lại
    return res.json({ 
      success: true, 
      expires_at: new Date(keyData.expires_at).toLocaleString("vi-VN"),
      time_left: keyData.expires_at - Date.now()
    });
  }

  // Kích hoạt lần đầu -> Bắt đầu tính giờ
  const now = Date.now();
  const msInDay = 24 * 60 * 60 * 1000;
  const expires = keyData.days >= 9999 ? now + 100*365*msInDay : now + (keyData.days * msInDay);
  
  keyData.activated_at = now; 
  keyData.expires_at = expires; 
  keyData.ip = clientIP; 
  keyData.device = clientDevice;
  
  saveDB(db);
  res.json({ 
    success: true, 
    expires_at: new Date(expires).toLocaleString("vi-VN"),
    time_left: expires - now
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server chạy tại port ' + PORT));
