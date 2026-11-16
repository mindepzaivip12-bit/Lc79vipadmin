import os, time, json, secrets, threading, logging, sqlite3
from flask import Flask, request, jsonify, render_template_string

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# ===== ĐỔI SECRET NÀY KHI DEPLOY =====
ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN", "LEMINH_ADMIN_2024_SECRET")
DB_FILE = os.environ.get("DB_FILE", "keys.db")

# ================= DATABASE SETUP =================
def init_db():
    with sqlite3.connect(DB_FILE) as conn:
        c = conn.cursor()
        c.execute('''CREATE TABLE IF NOT EXISTS keys (
            key TEXT PRIMARY KEY,
            created_at REAL,
            duration_seconds INTEGER,
            expires_at REAL,
            bound_device TEXT,
            note TEXT
        )''')
        conn.commit()

init_db()

def get_db():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def gen_key():
    return "LM-" + secrets.token_hex(8).upper()

# ================= ROUTES =================

@app.route("/")
def home():
    # Giao diện Admin Panel thu nhỏ (dùng luôn ko cần viết HTML riêng)
    html = """
    <!DOCTYPE html>
    <html lang="vi">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Admin Key Server</title>
        <style>
            body { font-family: sans-serif; background: #f4f6f9; padding: 20px; }
            .box { background: white; padding: 20px; border-radius: 8px; max-width: 600px; margin: auto; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
            input, button { padding: 10px; margin: 5px 0; width: 100%; box-sizing: border-box; border-radius: 4px; border: 1px solid #ccc; }
            button { background: #6c5ce7; color: white; border: none; cursor: pointer; font-weight: bold; }
            button:hover { background: #5a4bcf; }
            .key-list { margin-top: 20px; border-top: 1px solid #eee; padding-top: 20px; }
            .key-item { display: flex; justify-content: space-between; background: #f8f9fa; padding: 10px; margin-bottom: 5px; border-radius: 4px; font-size: 14px;}
            .red { color: red; } .green { color: green; }
        </style>
    </head>
    <body>
        <div class="box">
            <h2>Tạo Key Mới</h2>
            <input type="password" id="token" placeholder="Nhập ADMIN_TOKEN...">
            <input type="number" id="days" placeholder="Số ngày (VD: 30)" value="30">
            <input type="number" id="amount" placeholder="Số lượng (VD: 5)" value="1">
            <button onclick="createKey()">TẠO KEY</button>
            <div id="result" style="margin-top:10px; color: green; font-weight: bold;"></div>

            <div class="key-list">
                <h3>Danh sách Key <button onclick="loadKeys()" style="width:auto; padding:5px 10px; font-size:12px;">Làm mới</button></h3>
                <div id="keys"></div>
            </div>
        </div>

        <script>
            async function createKey() {
                const token = document.getElementById('token').value;
                const days = document.getElementById('days').value;
                const amount = document.getElementById('amount').value;
                const r = await fetch('/api/create_key', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ admin_token: token, days, amount })
                });
                const data = await r.json();
                if(data.success) {
                    document.getElementById('result').innerText = '✅ Đã tạo: ' + data.keys.join(', ');
                    loadKeys();
                } else {
                    alert('Lỗi: ' + data.error);
                }
            }

            async function loadKeys() {
                const token = document.getElementById('token').value;
                if(!token) return alert('Nhập ADMIN_TOKEN để xem danh sách!');
                const r = await fetch('/api/list_keys', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ admin_token: token })
                });
                const data = await r.json();
                if(!data.success) return alert(data.error);
                
                let html = '';
                data.keys.forEach(k => {
                    const status = k.expired ? '<span class="red">Hết hạn</span>' : '<span class="green">Còn hạn</span>';
                    const bound = k.bound ? '🔒 Đã khóa máy' : '🔓 Chưa kích hoạt';
                    html += `<div class="key-item">
                        <span><b>${k.key}</b> (${status}) - ${bound}</span>
                        <button onclick="revokeKey('${k.key}')" style="width:auto; background:red; padding:2px 8px; font-size:12px;">Xóa</button>
                    </div>`;
                });
                document.getElementById('keys').innerHTML = html;
            }

            async function revokeKey(key) {
                if(!confirm('Bạn chắc chắn xóa key này?')) return;
                const token = document.getElementById('token').value;
                await fetch('/api/revoke_key', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ admin_token: token, key })
                });
                loadKeys();
            }
        </script>
    </body>
    </html>
    """
    return render_template_string(html)

@app.route("/api/create_key", methods=["POST"])
def create_key():
    data = request.json or {}
    if data.get("admin_token") != ADMIN_TOKEN:
        return jsonify({"success": False, "error": "Sai ADMIN_TOKEN"}), 401

    try:
        days = float(data.get("days", 1))
        amount = int(data.get("amount", 1))
    except (TypeError, ValueError):
        return jsonify({"success": False, "error": "Tham số không hợp lệ"})

    if days <= 0 or amount <= 0 or amount > 100:
        return jsonify({"success": False, "error": "Số ngày > 0, số lượng 1-100"})

    now = time.time()
    created = []
    
    with get_db() as conn:
        c = conn.cursor()
        for _ in range(amount):
            k = gen_key()
            while True:
                c.execute("SELECT 1 FROM keys WHERE key=?", (k,))
                if not c.fetchone(): break
                k = gen_key()
                
            c.execute("INSERT INTO keys (key, created_at, duration_seconds, expires_at, note) VALUES (?, ?, ?, ?, ?)",
                      (k, now, int(days * 86400), now + days * 86400, data.get("note", "")))
            created.append(k)
        conn.commit()

    return jsonify({"success": True, "keys": created, "days": days})

@app.route("/api/verify_key", methods=["POST"])
def verify_key():
    data = request.json or {}
    key    = (data.get("key") or "").strip().upper()
    device = (data.get("device") or "").strip()

    if not key or not device:
        return jsonify({"success": False, "error": "Thiếu key hoặc device"})

    now = time.time()
    with get_db() as conn:
        c = conn.cursor()
        c.execute("SELECT * FROM keys WHERE key=?", (key,))
        info = c.fetchone()

        if not info:
            return jsonify({"success": False, "error": "Key không tồn tại"})

        if now > info["expires_at"]:
            return jsonify({"success": False, "error": "Key đã hết hạn", "expired": True})

        # Bind device
        if not info["bound_device"]:
            c.execute("UPDATE keys SET bound_device=? WHERE key=?", (device, key))
            conn.commit()
            logger.info(f"Key {key} bound to {device[:16]}")
        elif info["bound_device"] != device:
            return jsonify({"success": False, "error": "Key đã khóa trên thiết bị khác"})

        return jsonify({
            "success": True,
            "expires_at": info["expires_at"],
            "remaining": max(0, info["expires_at"] - now)
        })

@app.route("/api/check_key", methods=["POST"])
def check_key():
    data = request.json or {}
    key    = (data.get("key") or "").strip().upper()
    device = (data.get("device") or "").strip()

    now = time.time()
    with get_db() as conn:
        c = conn.cursor()
        c.execute("SELECT * FROM keys WHERE key=?", (key,))
        info = c.fetchone()

        if not info:
            return jsonify({"success": False, "error": "Key không tồn tại"})
        if now > info["expires_at"]:
            return jsonify({"success": False, "error": "Key đã hết hạn", "expired": True})
        if info["bound_device"] != device:
            return jsonify({"success": False, "error": "Sai thiết bị"})

        return jsonify({"success": True, "expires_at": info["expires_at"], "remaining": max(0, info["expires_at"] - now)})

@app.route("/api/list_keys", methods=["POST"])
def list_keys():
    data = request.json or {}
    if data.get("admin_token") != ADMIN_TOKEN:
        return jsonify({"success": False, "error": "Sai ADMIN_TOKEN"}), 401

    now = time.time()
    items = []
    with get_db() as conn:
        c = conn.cursor()
        c.execute("SELECT * FROM keys ORDER BY created_at DESC")
        for row in c.fetchall():
            items.append({
                "key": row["key"],
                "expires_at": row["expires_at"],
                "remaining": max(0, row["expires_at"] - now),
                "expired": now > row["expires_at"],
                "bound": bool(row["bound_device"]),
                "bound_device_prefix": (row["bound_device"] or "")[:16]
            })
    return jsonify({"success": True, "keys": items})

@app.route("/api/revoke_key", methods=["POST"])
def revoke_key():
    data = request.json or {}
    if data.get("admin_token") != ADMIN_TOKEN:
        return jsonify({"success": False, "error": "Sai ADMIN_TOKEN"}), 401

    key = (data.get("key") or "").strip().upper()
    with get_db() as conn:
        c = conn.cursor()
        c.execute("DELETE FROM keys WHERE key=?", (key,))
        conn.commit()
        if c.rowcount > 0:
            return jsonify({"success": True})
    return jsonify({"success": False, "error": "Key không tồn tại"})

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port)
