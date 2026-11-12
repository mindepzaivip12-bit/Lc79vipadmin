const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const DB_FILE = path.join(__dirname, 'database.json');

// Khởi tạo Database nếu chưa có
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ maintenance: false, keys: {} }, null, 2));
}

const getDB = () => JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
const saveDB = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

// Lấy IP thực của người dùng
const getClientIp = (req) => {
    let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    if (ip && ip.includes(',')) ip = ip.split(',')[0]; 
    return ip ? ip.trim() : 'unknown';
};

// ==========================================
// TỰ ĐỘNG CHUYỂN HƯỚNG TRANG CHỦ SANG ADMIN
// ==========================================
app.get('/', (req, res) => {
    res.redirect('/admin');
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// ==========================================
// CÁC API CHO WEB CHÍNH
// ==========================================

app.get('/api/status', (req, res) => {
    const db = getDB();
    res.json({ maintenance: db.maintenance });
});

app.post('/api/activate', (req, res) => {
    const { key } = req.body;
    const clientIp = getClientIp(req);
    const db = getDB();

    if (db.maintenance) {
        return res.json({ success: false, msg: "Hệ thống đang bảo trì!" });
    }

    const keyData = db.keys[key];
    if (!keyData) return res.json({ success: false, msg: "Key không hợp lệ!" });
    if (Date.now() > keyData.expiresAt) return res.json({ success: false, msg: "Key đã hết hạn!" });
    
    if (keyData.ip && keyData.ip !== clientIp) {
        return res.json({ success: false, msg: "Key này đã bị khóa vào IP khác!" });
    }

    if (!keyData.ip) {
        db.keys[key].ip = clientIp;
        saveDB(db);
    }

    res.json({ success: true, msg: "Kích hoạt thành công!" });
});


// ==========================================
// API DÀNH CHO TRANG ADMIN
// ==========================================
const ADMIN_PASS = "admin123"; // Mật khẩu Admin

app.post('/api/admin', (req, res) => {
    const { password, action, key, amount, unit } = req.body;
    if (password !== ADMIN_PASS) return res.status(403).json({ success: false, msg: "Sai mật khẩu!" });
    
    const db = getDB();

    // Bật / Tắt bảo trì
    if (action === 'toggle_maintenance') {
        db.maintenance = !db.maintenance;
        saveDB(db);
        return res.json({ success: true, msg: `Bảo trì đã ${db.maintenance ? 'BẬT' : 'TẮT'}` });
    }

    // Tạo Key mới (Hỗ trợ Ngày / Giờ / Phút)
    if (action === 'create_key') {
        const newKey = key || "VIP-" + Math.random().toString(36).substring(2, 10).toUpperCase();
        
        // Tính toán thời gian an toàn
        const numAmount = parseInt(amount) || 1; // Nếu không nhập thì mặc định là 1
        let msPerUnit = 24 * 60 * 60 * 1000; // Mặc định là Ngày
        
        if (unit === 'hours') msPerUnit = 60 * 60 * 1000;
        if (unit === 'minutes') msPerUnit = 60 * 1000;

        const durationMs = numAmount * msPerUnit;

        db.keys[newKey] = {
            expiresAt: Date.now() + durationMs,
            ip: null
        };
        saveDB(db);
        return res.json({ success: true, msg: "Tạo key thành công", key: newKey });
    }

    // Lấy danh sách Key
    if (action === 'get_keys') {
        return res.json({ success: true, keys: db.keys, maintenance: db.maintenance });
    }
});

app.listen(PORT, () => {
    console.log(`Server đang chạy tại port ${PORT}`);
});
