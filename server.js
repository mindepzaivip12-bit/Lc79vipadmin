const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const DB_FILE = path.join(__dirname, 'database.json');
const CONFIG_FILE = path.join(__dirname, 'config.json');

if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ keys: [] }));
if (!fs.existsSync(CONFIG_FILE)) fs.writeFileSync(CONFIG_FILE, JSON.stringify({ maintenance: false, custom_html: "" }));

const getDB = () => JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
const saveDB = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
const getConfig = () => JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
const saveConfig = (data) => fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2));

const ADMIN_PASS = "admin123"; 

// ==========================================
// GIAO DIỆN ADMIN
// ==========================================
function renderAdmin(req, res) {
  res.send(`
    <!doctype html>
    <html lang="vi">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>ADMIN - BON TOOL</title>
      <style>
        body { background: #090a0f; color: #fff; font-family: sans-serif; padding: 20px; }
        .container { max-width: 1000px; margin: auto; display: flex; flex-direction: column; gap: 20px; }
        .box { background: #13141f; padding: 20px; border-radius: 10px; border: 1px solid #05d9e8; }
        h2, h3 { color: #05d9e8; margin-top: 0; }
        input, textarea { padding: 10px; border-radius: 5px; border: 1px solid #05d9e8; background: #000; color: #fff; outline: none; margin-bottom: 10px; width: 100%; box-sizing: border-box; }
        textarea { resize: vertical; min-height: 80px; font-family: monospace; }
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
        .toggle-switch { display: flex; align-items: center; gap: 10px; margin-bottom: 15px; }
        .toggle-switch input { width: 20px; height: 20px; cursor: pointer; margin: 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="box">
          <h2>QUẢN LÝ TOOL</h2>
          <input type="password" id="admin-pass" placeholder="Nhập mật khẩu Admin...">
        </div>

        <div class="box">
          <h3>CẤU HÌNH TOOL</h3>
          <div class="toggle-switch">
            <input type="checkbox" id="cfg-maintenance">
            <label for="cfg-maintenance" style="color:#ff2a6d; font-weight:bold;">BẬT CHẾ ĐỘ BẢO TRÌ</label>
          </div>
          <label>Nhập HTML gốc (Thông báo):</label>
          <textarea id="cfg-html" placeholder="<h2>Thông báo quan trọng!</h2>"></textarea>
          <button class="btn-cyan" onclick="saveConfig()">LƯU CẤU HÌNH</button>
        </div>

        <div class="box">
          <h3>QUẢN LÝ KEY</h3>
          <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 15px;">
            <input type="text" id="custom-key" placeholder="Nhập tên Key tự chọn (VD: KEY-LEMINH). Bỏ trống để tự tạo ngẫu nhiên...">
            <div class="row">
              <input type="number" id="key-days" placeholder="Số ngày (9999 = vĩnh viễn)" value="30">
              <button onclick="createKey()">TẠO KEY</button>
              <button class="btn-cyan" onclick="loadKeys()">TẢI LẠI</button>
            </div>
          </div>
          <table>
            <thead>
              <tr><th>Key</th><th>Thời Hạn</th><th>Hết Hạn</th><th>Thiết bị</th><th>Trạng Thái</th><th>Xóa</th></tr>
            </thead>
            <tbody id="table-body"></tbody>
          </table>
        </div>
      </div>

      <script>
        const API_URL = ""; 

        async function loadConfig() {
          try {
            const res = await fetch(API_URL + '/api/config/get', { method: 'POST' });
            const data = await res.json();
            document.getElementById('cfg-maintenance').checked = data.maintenance;
            document.getElementById('cfg-html').value = data.custom_html || "";
          } catch(e) {}
        }

        async function saveConfig() {
          const pass = document.getElementById('admin-pass').value;
          if(!pass) return alert("Nhập mật khẩu!");
          const maintenance = document.getElementById('cfg-maintenance').checked;
          const custom_html = document.getElementById('cfg-html').value;

          const res = await fetch(API_URL + '/api/admin/config', {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: pass, maintenance, custom_html })
          });
          if(res.ok) alert("Lưu thành công!"); else alert("Sai mật khẩu!");
        }

        async function loadKeys() {
          const pass = document.getElementById('admin-pass').value;
          if(!pass) return alert("Nhập mật khẩu!");
          try {
            const res = await fetch(API_URL + '/api/admin/keys', { 
              method: 'POST', headers: { 'Content-Type': 'application/json' },
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
              const device = k.device ? k.device.substring(0, 20) + '...' : '---';
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
          const customKey = document.getElementById('custom-key').value.trim();
          
          if(!pass || isNaN(days)) return alert("Nhập đủ thông tin (Mật khẩu và Số ngày)!");
          
          const res = await fetch(API_URL + '/api/admin/create', {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: pass, days, customKey })
          });
          const data = await res.json();
          if(data.success) { 
            alert("Tạo thành công!\\nKey: " + data.key); 
            document.getElementById('custom-key').value = ""; // Reset ô nhập
            loadKeys(); 
          } 
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

        window.onload = () => { loadConfig(); };
      </script>
    </body>
    </html>
  `);
}

app.get('/', renderAdmin);
app.get('/admin', renderAdmin);

// ==========================================
// API QUẢN LÝ KEY
// ==========================================
app.post('/api/admin/keys', (req, res) => {
  const { password } = req.body;
  if (password !== ADMIN_PASS) return res.status(403).json({ error: "Sai mật khẩu" });
  res.json(getDB().keys);
});

app.post('/api/admin/create', (req, res) => {
  const { password, days, customKey } = req.body;
  if (password !== ADMIN_PASS) return res.status(403).json({ error: "Sai mật khẩu" });

  const db = getDB();
  let newKey = customKey ? customKey.trim() : "";
  
  // Nếu không nhập customKey, tự động tạo ngẫu nhiên
  if (!newKey) {
    newKey = 'BON-' + crypto.randomBytes(4).toString('hex').toUpperCase() + '-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  }

  // Kiểm tra xem key đã tồn tại chưa
  if (db.keys.find(k => k.key === newKey)) {
    return res.json({ error: "Key này đã tồn tại, vui lòng nhập tên khác!" });
  }

  db.keys.unshift({ 
    key: newKey, 
    days: days, 
    created_at: Date.now(), 
    activated_at: null, 
    expires_at: null, 
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
// API CẤU HÌNH (BẢO TRÌ)
// ==========================================
app.post('/api/config/get', (req, res) => res.json(getConfig()));

app.post('/api/admin/config', (req, res) => {
  const { password, maintenance, custom_html } = req.body;
  if (password !== ADMIN_PASS) return res.status(403).json({ error: "Sai mật khẩu" });
  saveConfig({ maintenance, custom_html });
  res.json({ success: true });
});

// ==========================================
// API CLIENT (KÍCH HOẠT)
// ==========================================
app.post('/api/activate', (req, res) => {
  const { key } = req.body;
  const db = getDB();
  const keyData = db.keys.find(k => k.key === key);
  
  if (!keyData) return res.json({ success: false, msg: "Key không tồn tại!" });

  // Chỉ lấy User-Agent, KHÔNG check IP
  const clientDevice = req.headers['user-agent'];

  if (keyData.activated_at !== null) {
    if (keyData.device !== clientDevice) {
      return res.json({ success: false, msg: "Key này đã được sử dụng trên thiết bị khác!" });
    }
    if (Date.now() > keyData.expires_at) {
      return res.json({ success: false, msg: "Key đã hết hạn sử dụng!" });
    }
    
    return res.json({ 
      success: true, 
      expires_at: new Date(keyData.expires_at).toLocaleString("vi-VN"),
      time_left: keyData.expires_at - Date.now() 
    });
  }

  const now = Date.now();
  const msInDay = 24 * 60 * 60 * 1000;
  const expires = keyData.days >= 9999 ? now + 100*365*msInDay : now + (keyData.days * msInDay);
  
  keyData.activated_at = now; 
  keyData.expires_at = expires; 
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
