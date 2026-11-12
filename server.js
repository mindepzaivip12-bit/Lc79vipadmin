const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Cho phép các domain khác gọi API (CORS)
app.use(cors());
app.use(express.json());

const DB_FILE = path.join(__dirname, 'database.json');

// Khởi tạo Database nếu chưa có
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ maintenance: false, keys: {} }, null, 2));
}

const getDB = () => JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
const saveDB = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

// Lấy IP thực của người dùng (Dùng để khóa 1 IP cho 1 Key)
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

// Hiển thị giao diện Admin (Yêu cầu file admin.html phải nằm cùng thư mục)
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// ==========================================
// CÁC API CHO WEB CHÍNH (Dùng cho index.html)
// ==========================================

// 1. API Kiểm tra trạng thái bảo trì
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
    if (!keyData) return res.json({ success: false, msg: "Key không hợp lệ!" });
    if (Date.now() > keyData.expiresAt) return res.json({ success: false, msg: "Key đã hết hạn!" });
    
    // Kiểm tra cố định 1 IP
    if (keyData.ip && keyData.ip !== clientIp) {
        return res.json({ success: false, msg: "Key này đã bị khóa vào IP khác!" });
    }

    // Lưu IP vào Key ở lần sử dụng đầu tiên
    if (!keyData.ip) {
        db.keys[key].ip = clientIp;
        saveDB(db);
    }

    res.json({ success: true, msg: "Kích hoạt thành công!" });
});


// ==========================================
// API DÀNH CHO TRANG ADMIN
// ==========================================
const ADMIN_PASS = "admin123"; // Mật khẩu đăng nhập Admin (Bạn có thể đổi tại đây)

app.post('/api/admin', (req, res) => {
    const { password, action, key, days } = req.body;
    if (password !== ADMIN_PASS) return res.status(403).json({ success: false, msg: "Sai mật khẩu!" });
    
    const db = getDB();

    // Bật / Tắt bảo trì
    if (action === 'toggle_maintenance') {
        db.maintenance = !db.maintenance;
        saveDB(db);
        return res.json({ success: true, msg: `Bảo trì đã ${db.maintenance ? 'BẬT' : 'TẮT'}` });
    }

    // Tạo Key mới
    if (action === 'create_key') {
        const newKey = key || "VIP-" + Math.random().toString(36).substring(2, 10).toUpperCase();
        db.keys[newKey] = {
            expiresAt: Date.now() + (days * 24 * 60 * 60 * 1000), // Tính theo ngày
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

// ==========================================
// KHỞI CHẠY SERVER
// ==========================================
app.listen(PORT, () => {
    console.log(`Server đang chạy tại port ${PORT}`);
    console.log(`Link Admin: https://bontooltxios.onrender.com/admin`);
});
