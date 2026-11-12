const express = require('express');
const cors = require('cors');
const fs = require('fs');
const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

const DB_FILE = './database.json';

// Khởi tạo Database mặc định
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ 
        maintenance: false, 
        keys: {} 
    }, null, 2));
}

const getDB = () => JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
const saveDB = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

// Lấy IP thực của client
const getClientIp = (req) => {
    let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    if (ip === '::1') ip = '127.0.0.1'; // Fix lỗi IP localhost
    return ip;
};

// 1. API Kiểm tra trạng thái (Bảo trì)
app.get('/api/status', (req, res) => {
    const db = getDB();
    res.json({ maintenance: db.maintenance });
});

// 2. API Kích hoạt Key
app.post('/api/activate', (req, res) => {
    const { key } = req.body;
    const clientIp = getClientIp(req);
    const db = getDB();

    if (db.maintenance) {
        return res.json({ success: false, msg: "Hệ thống đang bảo trì, vui lòng quay lại sau!" });
    }

    const keyData = db.keys[key];
    if (!keyData) {
        return res.json({ success: false, msg: "Key không hợp lệ hoặc không tồn tại!" });
    }
    if (Date.now() > keyData.expiresAt) {
        return res.json({ success: false, msg: "Key đã hết hạn sử dụng!" });
    }
    // Kiểm tra cố định IP
    if (keyData.ip && keyData.ip !== clientIp) {
        return res.json({ success: false, msg: "Key này đã bị khóa vào IP khác!" });
    }

    // Nếu key chưa có IP, gán IP hiện tại (Cố định 1 IP)
    if (!keyData.ip) {
        db.keys[key].ip = clientIp;
        saveDB(db);
    }

    res.json({ 
        success: true, 
        msg: "Kích hoạt thành công!", 
        expiresAt: keyData.expiresAt 
    });
});

// 3. API Admin (Tạo key & Bật/tắt bảo trì)
// Lưu ý: Đổi mật khẩu admin bên dưới
const ADMIN_PASS = "admin123"; 

app.post('/api/admin', (req, res) => {
    const { password, action, key, days } = req.body;
    if (password !== ADMIN_PASS) return res.status(403).json({ success: false, msg: "Sai mật khẩu!" });
    
    const db = getDB();

    if (action === 'toggle_maintenance') {
        db.maintenance = !db.maintenance;
        saveDB(db);
        return res.json({ success: true, msg: `Bảo trì đã ${db.maintenance ? 'BẬT' : 'TẮT'}` });
    }

    if (action === 'create_key') {
        // Tạo key ngẫu nhiên nếu không nhập
        const newKey = key || "VIP-" + Math.random().toString(36).substring(2, 10).toUpperCase();
        db.keys[newKey] = {
            expiresAt: Date.now() + (days * 24 * 60 * 60 * 1000), // Tính theo ngày
            ip: null
        };
        saveDB(db);
        return res.json({ success: true, msg: "Tạo key thành công", key: newKey });
    }

    if (action === 'get_keys') {
        return res.json({ success: true, keys: db.keys, maintenance: db.maintenance });
    }
});

app.listen(PORT, () => {
    console.log(`Server chạy tại http://localhost:${PORT}`);
});
