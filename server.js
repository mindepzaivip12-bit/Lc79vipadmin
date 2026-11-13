const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Tạo file database nếu chưa có
const DB_FILE = path.join(__dirname, 'database.json');
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({ keys: [] }));
}

const getDB = () => JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
const saveDB = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

const ADMIN_PASS = "admin123"; // Bạn có thể đổi mật khẩu tại đây

// ==========================================
// 1. HIỂN THỊ GIAO DIỆN ADMIN TẠI TRANG CHỦ "/"
// ==========================================
app.get('/', (req, res) => {
  res.send(`
    <!doctype html>
    <html lang="vi">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>ADMIN - Quản Lý Tool</title>
      <style>
        body { background: #090a0f; color: #fff; font-family: sans-serif; padding: 20px; }
        .container { max-width: 1000px; margin: auto; display: flex; flex-direction: column; gap: 20px; }
        .box { background: #13141f; padding: 20px; border-radius: 10px; border: 1px solid #05d9e8; }
        h2, h3 { color: #05d9e8; margin-top: 0; }
        input, textarea { padding: 10px; border-radius: 5px; border: 1px solid #05d9e8; background: #000; color: #fff; outline: none; margin-bottom: 10px; width: 100%; box-sizing: border-box; }
        textarea { resize: vertical; min-height: 100px; font-family: monospace; }
        button { padding: 10px 15px; background: #ff2a6d; color: #fff; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; transition: 0.2s; }
        button:hover { opacity: 0.8; }
        .btn-cyan { background: #05d9e8; color: #000; }
        .btn-red { background: #ff3333; }
        .row { display: flex; gap: 10px; }
        .row > * { flex: 1; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { padding: 10px; border: 1px solid #333; text-align: left; font-size: 13px; }
        th { background: #000; color: #ff2a6d; }
        .status-ok { color: #55ff55; } .status-bad { color: #ff5555; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="box">
          <h2>QUẢN LÝ TOOL - BON TOOL</h2>
          <input type="password" id="admin-pass" placeholder="Nhập mật khẩu Admin...">
        </div>

        <div class="box">
          <h3>QUẢN LÝ KEY</h3>
          <div class="row">
            <input type="number" id="key-days" placeholder="Số ngày (9999 = vĩnh viễn)" value="30">
            <button onclick="createKey()">TẠO KEY MỚI</button>
            <button class="btn-cyan" onclick="loadKeys()">TẢI LẠI</button>
          </div>
          <table>
            <thead>
              <tr><th>Key</th><th>Thời Hạn</th><th>Hết Hạn</th><th>IP / Thiết bị</th><th>Trạng Thái</th><th>Xóa</th></tr>
            </thead>
            <tbody id="table-body"></tbody>
          </table>
        </div>
      </div>

      <script>
        const API_URL = ""; // Chạy cùng server nên để trống

        async function loadKeys() {
          const pass = document.getElementById('admin-pass').value;
          if(!pass) return alert("Nhập mật khẩu!");
          try {
            const res = await fetch(API_URL + '/api/admin/keys', { 
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ password: pass })
            });
            if(res.status === 403) return alert("Sai mật khẩu!");
            
            const keys = await res.json();
            const tbody = document.getElementById('table-body');
            tbody.innerHTML = '';
            keys.forEach(k => {
              const isExpired = k.expires_at && Date.now() > k.expires_at;
              const status = !k.activated_at ? '<span style="color:#aaa">Chưa dùng</span>' 
                           : isExpired ? '<span class="status-bad">Hết hạn</span>' 
                           : '<span class="status-ok">Hoạt động</span>';
              const device = k.ip ? k.ip + '<br><small>' + (k.device ? k.device.substring(0, 20) : '') + '...</small>' : '---';
              const expDate = k.expires_at ? new Date(k.expires_at).toLocaleString("vi-VN") : '---';
              
              tbody.innerHTML += \`
                <tr>
                  <td><b style="color:#05d9e8">\${k.key}</b></td>
                  <td>\${k.days >= 9999 ? 'Vĩnh viễn' : k.days + ' ngày'}</td>
                  <td>\${expDate}</td>
                  <td>\${device}</td>
                  <td>\${status}</td>
                  <td><button class="btn-red" onclick="deleteKey('\${k.key}')" style="padding: 5px 10px">Xóa</button></td>
                </tr>
              \`;
            });
          } catch(e) { alert("Lỗi kết nối Server!"); }
        }

        async function createKey() {
          const pass = document.getElementById('admin-pass').value;
          const days = parseInt(document.getElementById('key-days').value);
          if(!pass || isNaN(days)) return alert("Nhập đủ thông tin!");
          const res = await fetch(API_URL + '/api/admin/create', {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: pass, days })
          });
          const data = await res.json();
          if(data.success) { alert("Tạo thành công!\\nKey: " + data.key); loadKeys(); } 
          else alert(data.error);
        }

        async function deleteKey(key) {
          if(!confirm("Xóa key này?")) return;
          const pass = document.getElementById('admin-pass').value;
          await fetch(API_URL + '/api/admin/delete', {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: pass, key })
          });
          loadKeys();
        }
      </script>
    </body>
    </html>
  `);
});

// ==========================================
// 2. API QUẢN LÝ KEY
// ==========================================
app.post('/api/admin/keys', (req, res) => {
  const { password } = req.body;
  if (password !== ADMIN_PASS) return res.status(403).json({ error: "Sai mật khẩu" });
  res.json(getDB().keys);
});

app.post('/api/admin/create', (req, res) => {
  const { password, days } = req.body;
  if (password !== ADMIN_PASS) return res.status(403).json({ error: "Sai mật khẩu" });

  const db = getDB();
  const newKey = 'BON-' + crypto.randomBytes(4).toString('hex').toUpperCase() + '-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  db.keys.unshift({ 
    key: newKey, 
    days: days, 
    created_at: Date.now(), 
    activated_at: null, 
    expires_at: null, 
    ip: null, 
    device: null 
  });
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
// 3. API DÀNH CHO CLIENT (KÍCH HOẠT)
// ==========================================
app.post('/api/activate', (req, res) => {
  const { key } = req.body;
  const db = getDB();
  const keyData = db.keys.find(k => k.key === key);
  
  if (!keyData) return res.json({ success: false, msg: "Key không tồn tại!" });

  const clientIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const clientDevice = req.headers['user-agent'];

  // Trường hợp 1: Key đã được kích hoạt trước đó
  if (keyData.activated_at !== null) {
    // Kiểm tra IP
    if (keyData.ip !== clientIP) {
      return res.json({ success: false, msg: "Key đã bị khóa bởi IP khác!" });
    }
    // Kiểm tra Thiết bị
    if (keyData.device !== clientDevice) {
      return res.json({ success: false, msg: "Key đã bị khóa bởi thiết bị khác!" });
    }
    // Kiểm tra Hạn sử dụng
    if (Date.now() > keyData.expires_at) {
      return res.json({ success: false, msg: "Key đã hết hạn sử dụng!" });
    }
    
    // Hợp lệ -> Trả về thời gian
    return res.json({ 
      success: true, 
      expires_at: new Date(keyData.expires_at).toLocaleString("vi-VN"),
      time_left: keyData.expires_at - Date.now() 
    });
  }

  // Trường hợp 2: Key chưa dùng (Kích hoạt lần đầu)
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
