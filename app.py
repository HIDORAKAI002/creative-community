import os
import json
import time
import requests
import logging
from flask import Flask, render_template, Blueprint, request, jsonify
from werkzeug.utils import secure_filename

log = logging.getLogger('werkzeug')
log.setLevel(logging.ERROR)

import mysql.connector
from mysql.connector import Error

from dotenv import load_dotenv

load_dotenv()

DB_CONFIG = {
    'host': os.environ.get('DB_HOST', '127.0.0.1'),
    'port': int(os.environ.get('DB_PORT', 3306)),
    'user': os.environ.get('DB_USER', 'root'),
    'password': os.environ.get('DB_PASS', ''),
    'database': os.environ.get('DB_NAME', 'creative_community_db'),
    'autocommit': True
}

def get_db_connection():
    try:
        connection = mysql.connector.connect(**DB_CONFIG)
        if connection.is_connected():
            return connection
    except Error as e:
        print(f"Error connecting to MySQL: {e}")
    return None

def get_client_ip():
    """Get the real client IP, handling Cloudflare proxy headers."""
    ip = request.headers.get('CF-Connecting-IP')
    if ip:
        return ip.strip()
    xff = request.headers.get('X-Forwarded-For')
    if xff:
        return xff.split(',')[0].strip()
    return request.remote_addr

def init_db():
    conn = get_db_connection()
    if not conn: return
    cursor = conn.cursor()
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS members (
            id VARCHAR(50) PRIMARY KEY,
            name VARCHAR(100),
            rollNo VARCHAR(50),
            clgEmail VARCHAR(100) UNIQUE,
            persEmail VARCHAR(100),
            phone VARCHAR(20),
            altPhone VARCHAR(20),
            password VARCHAR(255),
            isAdmin BOOLEAN DEFAULT FALSE,
            isVerified BOOLEAN DEFAULT FALSE,
            pfp VARCHAR(255)
        )
    """)
    
    try:
        cursor.execute("SELECT clgEmail FROM members LIMIT 1")
        cursor.fetchall() # Consume the unread result so the next query works
    except Exception:
        cursor.execute("DROP TABLE IF EXISTS members")
        cursor.execute("""
            CREATE TABLE members (
                id VARCHAR(50) PRIMARY KEY,
                name VARCHAR(100),
                rollNo VARCHAR(50),
                clgEmail VARCHAR(100) UNIQUE,
                persEmail VARCHAR(100),
                phone VARCHAR(20),
                altPhone VARCHAR(20),
                password VARCHAR(255),
                isAdmin BOOLEAN DEFAULT FALSE,
                isVerified BOOLEAN DEFAULT FALSE,
                pfp VARCHAR(255)
            )
        """)
    
    admin_email = os.environ.get('ADMIN_EMAIL', 'admin@example.edu')
    cursor.execute("SELECT * FROM members WHERE clgEmail = %s", (admin_email,))
    if not cursor.fetchone():
        cursor.execute("""
            INSERT INTO members (id, name, rollNo, clgEmail, persEmail, phone, altPhone, password, isAdmin, isVerified)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            os.environ.get('ADMIN_ID', 'm-admin-01'),
            os.environ.get('ADMIN_NAME', 'Admin Name'),
            os.environ.get('ADMIN_ROLLNO', 'ADMIN-001'),
            admin_email,
            os.environ.get('ADMIN_PERSEMAIL', 'personal@example.com'),
            os.environ.get('ADMIN_PHONE', '1234567890'),
            '',
            os.environ.get('ADMIN_PASS', 'securelogin'),
            True, True
        ))
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS attendance_info (
            id INT PRIMARY KEY DEFAULT 1,
            active_until FLOAT DEFAULT 0,
            session_count INT DEFAULT 0
        )
    """)
    cursor.execute("INSERT IGNORE INTO attendance_info (id, active_until, session_count) VALUES (1, 0, 0)")
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS attendance_members (
            email VARCHAR(100) PRIMARY KEY,
            attended INT DEFAULT 0,
            eligible_from_session INT DEFAULT 0,
            join_date VARCHAR(20),
            remarks TEXT,
            last_checkin VARCHAR(20)
        )
    """)
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS venue (
            id INT PRIMARY KEY DEFAULT 1,
            name VARCHAR(255)
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS blocked_devices (
            id VARCHAR(100) PRIMARY KEY,
            device_name VARCHAR(255),
            ip_address VARCHAR(50),
            blocked_at FLOAT,
            active BOOLEAN DEFAULT TRUE
        )
    """)
    try:
        cursor.execute("ALTER TABLE blocked_devices ADD COLUMN ip_address VARCHAR(50) AFTER device_name")
    except Exception:
        pass # Column likely already exists
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS resources (
            id VARCHAR(50) PRIMARY KEY,
            url VARCHAR(255),
            type VARCHAR(50),
            title VARCHAR(255),
            description TEXT,
            author VARCHAR(100),
            author_email VARCHAR(100),
            stars INT DEFAULT 0,
            forks INT DEFAULT 0,
            language VARCHAR(50),
            avatar VARCHAR(255),
            is_pinned BOOLEAN DEFAULT FALSE,
            timestamp FLOAT
        )
    """)
    
    cursor.close()
    conn.close()

def load_members():
    conn = get_db_connection()
    if not conn: return []
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM members")
    members = cursor.fetchall()
    for m in members:
        m['isAdmin'] = bool(m['isAdmin'])
        m['isVerified'] = bool(m['isVerified'])
    cursor.close()
    conn.close()
    return members

def save_members(members):
    conn = get_db_connection()
    if not conn: return
    cursor = conn.cursor()
    for m in members:
        cursor.execute("""
            INSERT INTO members (id, name, rollNo, clgEmail, persEmail, phone, altPhone, password, isAdmin, isVerified, pfp)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
            name=VALUES(name), rollNo=VALUES(rollNo), persEmail=VALUES(persEmail), phone=VALUES(phone), altPhone=VALUES(altPhone),
            password=VALUES(password), isAdmin=VALUES(isAdmin), isVerified=VALUES(isVerified), pfp=VALUES(pfp)
        """, (m['id'], m.get('name'), m.get('rollNo'), m.get('clgEmail'), m.get('persEmail'), m.get('phone'), m.get('altPhone'), m.get('password'), m.get('isAdmin', False), m.get('isVerified', False), m.get('pfp')))
    
    current_ids = [m['id'] for m in members]
    if current_ids:
        format_strings = ','.join(['%s'] * len(current_ids))
        cursor.execute(f"DELETE FROM members WHERE id NOT IN ({format_strings})", tuple(current_ids))
    else:
        cursor.execute("DELETE FROM members")
        
    cursor.close()
    conn.close()

def load_venue():
    conn = get_db_connection()
    if not conn: return {"venue": ""}
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT name FROM venue WHERE id=1")
    row = cursor.fetchone()
    cursor.close()
    conn.close()
    return {"venue": row['name'] if row else ""}

def save_venue(data):
    conn = get_db_connection()
    if not conn: return
    cursor = conn.cursor()
    cursor.execute("UPDATE venue SET name=%s WHERE id=1", (data.get('venue', ''),))
    cursor.close()
    conn.close()

def load_resources():
    conn = get_db_connection()
    if not conn: return []
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM resources")
    res = cursor.fetchall()
    for r in res:
        r['is_pinned'] = bool(r['is_pinned'])
        r['stats'] = {'stars': r['stars'], 'forks': r['forks'], 'language': r['language'], 'avatar': r['avatar']}
    cursor.close()
    conn.close()
    return res

def save_resources(data):
    conn = get_db_connection()
    if not conn: return
    cursor = conn.cursor()
    current_ids = []
    for r in data:
        current_ids.append(r['id'])
        cursor.execute("""
            INSERT INTO resources (id, url, type, title, description, author, author_email, stars, forks, language, avatar, is_pinned, timestamp)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE url=VALUES(url), type=VALUES(type), title=VALUES(title), description=VALUES(description),
            author=VALUES(author), author_email=VALUES(author_email), stars=VALUES(stars), forks=VALUES(forks), language=VALUES(language),
            avatar=VALUES(avatar), is_pinned=VALUES(is_pinned)
        """, (r['id'], r.get('url'), r.get('type'), r.get('title'), r.get('description'), r.get('author'), r.get('author_email'),
              r.get('stats', {}).get('stars', 0), r.get('stats', {}).get('forks', 0), r.get('stats', {}).get('language', ''),
              r.get('stats', {}).get('avatar', ''), r.get('is_pinned', False), r.get('timestamp', 0)))
              
    if current_ids:
        format_strings = ','.join(['%s'] * len(current_ids))
        cursor.execute(f"DELETE FROM resources WHERE id NOT IN ({format_strings})", tuple(current_ids))
    else:
        cursor.execute("DELETE FROM resources")
        
    cursor.close()
    conn.close()

def load_attendance():
    conn = get_db_connection()
    if not conn: return {"active_until": 0, "session_count": 0, "members": {}, "history": []}
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM attendance_info WHERE id=1")
    info = cursor.fetchone()
    
    cursor.execute("SELECT * FROM attendance_members")
    members_list = cursor.fetchall()
    
    members_dict = {}
    for m in members_list:
        members_dict[m['email']] = {
            "attended": m['attended'],
            "eligible_from_session": m['eligible_from_session'],
            "join_date": m['join_date'],
            "remarks": m['remarks'],
            "last_checkin": m['last_checkin']
        }
        
    cursor.close()
    conn.close()
    return {
        "active_until": info['active_until'] if info else 0,
        "session_count": info['session_count'] if info else 0,
        "members": members_dict,
        "history": []
    }

def save_attendance(data):
    conn = get_db_connection()
    if not conn: return
    cursor = conn.cursor()
    cursor.execute("UPDATE attendance_info SET active_until=%s, session_count=%s WHERE id=1", 
                   (data.get('active_until', 0), data.get('session_count', 0)))
                   
    for email, m in data['members'].items():
        cursor.execute("""
            INSERT INTO attendance_members (email, attended, eligible_from_session, join_date, remarks, last_checkin)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE attended=VALUES(attended), remarks=VALUES(remarks), last_checkin=VALUES(last_checkin)
        """, (email, m.get('attended'), m.get('eligible_from_session'), m.get('join_date'), m.get('remarks'), m.get('last_checkin')))
        
    cursor.close()
    conn.close()

init_db()

app = Flask(__name__, static_url_path='/creative-community/static')
app.config['UPLOAD_FOLDER'] = 'static/userpfp'
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

bp = Blueprint('creative_community', __name__, url_prefix='/creative-community')

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@bp.route('/upload_pfp', methods=['POST'])
def upload_pfp():
    if 'pfp' not in request.files:
        return jsonify(success=False, error="No file part"), 400
    
    file = request.files['pfp']
    email = request.form.get('email', 'unknown')
    
    if file.filename == '':
        return jsonify(success=False, error="No selected file"), 400
    
    try:
        if file and allowed_file(file.filename):
            filename = secure_filename(f"{email.replace('@','_').replace('.','_')}_{file.filename}")
            filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            file.save(filepath)
            
            members = load_members()
            for m in members:
                if m.get('clgEmail', '').lower() == email.lower():
                    m['pfp'] = f"/creative-community/static/userpfp/{filename}"
                    break
            save_members(members)
            
            return jsonify(success=True, url=f"/creative-community/static/userpfp/{filename}")
    except Exception as e:
        return jsonify(success=False, error=str(e)), 500
    return jsonify(success=False, error="Invalid file type"), 400

@bp.route('/', strict_slashes=False)
@bp.route('', strict_slashes=False)
def index():
    return render_template('index.html')

@bp.route('/login', strict_slashes=False)
def login():
    return render_template('login.html')

@bp.route('/signup', strict_slashes=False)
def signup():
    return render_template('signup.html')

@bp.route('/admin', strict_slashes=False)
def admin():
    return render_template('admin.html')

@bp.route('/profile', strict_slashes=False)
def profile():
    return render_template('profile.html')

@bp.route('/resources_page', strict_slashes=False)
def resources_page():
    return render_template('resources.html')


@bp.route('/api/resources', methods=['GET'])
def get_resources():
    res = load_resources()
    res.sort(key=lambda x: (not x.get('is_pinned', False), -x.get('timestamp', 0)))
    return jsonify(res)

@bp.route('/api/resources/add', methods=['POST'])
def add_resource():
    req_data = request.json
    url = req_data.get('url')
    description = req_data.get('description', '')
    author = req_data.get('author', 'Anonymous')
    author_email = req_data.get('author_email', '')

    if not url:
        return jsonify(success=False, error="URL required"), 400

    stats = {}
    title = url
    res_type = 'link'
    
    if 'github.com' in url:
        res_type = 'github'
        try:
            parts = url.split('github.com/')[-1].split('/')
            if len(parts) >= 2:
                owner, repo = parts[0], parts[1].split('?')[0].split('#')[0]
                if repo.endswith('.git'): repo = repo[:-4]
                gh_res = requests.get(f'https://api.github.com/repos/{owner}/{repo}', timeout=5)
                if gh_res.status_code == 200:
                    gh_data = gh_res.json()
                    stats = {
                        'stars': gh_data.get('stargazers_count', 0),
                        'forks': gh_data.get('forks_count', 0),
                        'language': gh_data.get('language', 'Code'),
                        'avatar': gh_data.get('owner', {}).get('avatar_url', '')
                    }
                    title = gh_data.get('full_name', f"{owner}/{repo}")
                    if not description:
                        description = gh_data.get('description', '')
        except Exception as e:
            print("GitHub Fetch Error:", e)

    resource = {
        'id': f'res-{int(time.time() * 1000)}',
        'url': url,
        'type': res_type,
        'title': title,
        'description': description,
        'author': author,
        'author_email': author_email,
        'stats': stats,
        'is_pinned': False,
        'timestamp': time.time()
    }

    res_list = load_resources()
    res_list.append(resource)
    save_resources(res_list)
    return jsonify(success=True, resource=resource)

@bp.route('/admin/resources/pin', methods=['POST'])
def pin_resource():
    req_data = request.json
    res_id = req_data.get('id')
    res_list = load_resources()
    for r in res_list:
        if r['id'] == res_id:
            r['is_pinned'] = not r.get('is_pinned', False)
            save_resources(res_list)
            return jsonify(success=True)
    return jsonify(success=False, error="Not found"), 404

@bp.route('/admin/resources/delete', methods=['POST'])
def delete_resource():
    req_data = request.json
    res_id = req_data.get('id')
    res_list = load_resources()
    new_list = [r for r in res_list if r['id'] != res_id]
    if len(new_list) != len(res_list):
        save_resources(new_list)
        return jsonify(success=True)
    return jsonify(success=False, error="Not found"), 404


@bp.route('/api/members', methods=['GET'])
def get_members():
    return jsonify(load_members())

@bp.route('/api/members/register', methods=['POST'])
def register_member():
    data = request.json
    members = load_members()
    
    email = data.get('clgEmail', '').lower()
    if any(m.get('clgEmail', '').lower() == email for m in members):
        return jsonify(success=False, error="Email already registered"), 400
        
    new_member = {
        'id': f"m-{int(time.time() * 1000)}",
        'name': data.get('name'),
        'rollNo': data.get('rollNo'),
        'clgEmail': email,
        'password': data.get('password'),
        'persEmail': data.get('persEmail', ''),
        'phone': data.get('phone', 'N/A'),
        'altPhone': data.get('altPhone', ''),
        'isAdmin': False,
        'isVerified': False
    }
    
    if email.startswith('24bq1a05j5@'):
        new_member['isAdmin'] = True
        
    members.append(new_member)
    save_members(members)
    print(f"[SYSTEM] New member registered: {email}")
    return jsonify(success=True, member=new_member)

@bp.route('/api/members/update', methods=['POST'])
def update_member():
    data = request.json
    members = load_members()
    target_id = data.get('id')
    
    found = False
    for i, m in enumerate(members):
        if m['id'] == target_id:
            members[i].update(data)
            found = True
            break
            
    if not found:
        return jsonify(success=False, error="Member not found"), 404
        
    save_members(members)
    return jsonify(success=True)

@bp.route('/api/members/delete', methods=['POST'])
def delete_member_api():
    data = request.json
    target_id = data.get('id')
    members = load_members()
    
    member_to_del = next((m for m in members if m['id'] == target_id), None)
    if member_to_del and member_to_del.get('clgEmail', '').lower().startswith('24bq1a05j5@'):
        return jsonify(success=False, error="Security Block: Cannot delete owner"), 403

    new_list = [m for m in members if m['id'] != target_id]
    if len(new_list) != len(members):
        save_members(new_list)
        return jsonify(success=True)
    return jsonify(success=False, error="Not found"), 404

@bp.route('/api/login', methods=['POST'])
def login_api():
    data = request.json
    email = data.get('email', '').lower()
    password = data.get('password')
    
    members = load_members()
    user = next((m for m in members if m.get('clgEmail', '').lower() == email), None)
    
    if user and (user.get('password') == password or not user.get('password')):
        return jsonify(success=True, user=user)
    
    return jsonify(success=False, error="Invalid Email or Password"), 401

@bp.route('/api/venue', methods=['GET'])
def get_venue():
    return jsonify(load_venue())

@bp.route('/api/venue/update', methods=['POST'])
def update_venue_api():
    data = request.json
    save_venue({"venue": data.get('venue', '')})
    return jsonify(success=True)


@bp.route('/open_attendance', methods=['POST'])
def open_attendance():
    data = load_attendance()
    data['active_until'] = time.time() + 300 # 5 minutes
    data['session_count'] += 1
    save_attendance(data)
    return jsonify(success=True, active_until=data['active_until'])

@bp.route('/api/attendance_status', methods=['GET'])
def attendance_status():
    data = load_attendance()
    now = time.time()
    is_active = now < data['active_until']
    time_left = max(0, int(data['active_until'] - now))
    return jsonify(active=is_active, time_left=time_left)

@bp.route('/checkin', methods=['POST'])
def checkin():
    data = load_attendance()
    now = time.time()
    if now > data['active_until']:
        return jsonify(success=False, error="Attendance gate is closed."), 400
    
    req_data = request.json
    email = req_data.get('email')
    if not email:
        return jsonify(success=False, error="Email required"), 400
    
    if email not in data['members']:
        data['members'][email] = {
            "attended": 1,
            "eligible_from_session": data['session_count'],
            "join_date": time.strftime('%Y-%m-%d'),
            "remarks": "",
            "last_checkin": time.strftime('%Y-%m-%d')
        }
    else:
        member = data['members'][email]
        today = time.strftime('%Y-%m-%d')
        if member.get('last_checkin') == today:
             return jsonify(success=False, error="Already checked in for today."), 400
        
        member['attended'] += 1
        member['last_checkin'] = today
    
    save_attendance(data)
    print(f"[ATTENDANCE] New check-in logged: {email}")
    return jsonify(success=True)

@bp.route('/admin/attendance_report', methods=['GET'])
def attendance_report():
    data = load_attendance()
    report = []
    total_sessions = data['session_count']
    
    for email, info in data['members'].items():
        possible = total_sessions - info['eligible_from_session'] + 1
        percentage = (info['attended'] / possible * 100) if possible > 0 else 0
        report.append({
            "email": email,
            "join_date": info['join_date'],
            "percentage": round(percentage, 1),
            "remarks": info['remarks'],
            "attended": info['attended'],
            "total_possible": possible
        })
    
    return jsonify(report=report)

@bp.route('/admin/update_remarks', methods=['POST'])
def update_remarks():
    req_data = request.json
    email = req_data.get('email')
    new_remarks = req_data.get('remarks', '')
    
    data = load_attendance()
    if email in data['members']:
        data['members'][email]['remarks'] = new_remarks
        save_attendance(data)
    return jsonify(success=True)

@bp.route('/api/security/block', methods=['POST'])
def block_device():
    req_data = request.json
    device_id = req_data.get('device_id')
    device_name = req_data.get('device_name', 'Unknown Device')
    ip_address = get_client_ip()
    
    if not device_id:
        return jsonify(success=False, error="device_id required"), 400
        
    conn = get_db_connection()
    if not conn: return jsonify(success=False, error="DB error"), 500
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO blocked_devices (id, device_name, ip_address, blocked_at, active)
        VALUES (%s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE active=TRUE, ip_address=%s, blocked_at=%s, device_name=%s
    """, (device_id, device_name, ip_address, time.time(), True, ip_address, time.time(), device_name))
    cursor.close()
    conn.close()
    print(f"[SECURITY LOCKDOWN] Device banned: {device_id} (IP: {ip_address}, UA: {device_name})")
    return jsonify(success=True)

@bp.route('/api/security/check-ban', methods=['POST'])
def check_ban():
    req_data = request.json
    device_id = req_data.get('device_id')
    ip_address = get_client_ip()
    if not device_id:
        return jsonify(success=False, banned=False, known=False)
        
    conn = get_db_connection()
    if not conn: return jsonify(success=False, banned=False, known=False)
    cursor = conn.cursor()
    
    cursor.execute("SELECT active FROM blocked_devices WHERE id=%s AND active=TRUE", (device_id,))
    row = cursor.fetchone()
    if row:
        cursor.close()
        conn.close()
        return jsonify(success=True, banned=True, known=True)
        
    cursor.execute("SELECT active FROM blocked_devices WHERE ip_address=%s AND active=TRUE", (ip_address,))
    row = cursor.fetchone()
    if row:
        cursor.close()
        conn.close()
        return jsonify(success=True, banned=True, known=True)
        
    cursor.execute("SELECT active FROM blocked_devices WHERE id=%s", (device_id,))
    row = cursor.fetchone()
    
    cursor.close()
    conn.close()
    
    if not row:
        return jsonify(success=True, banned=False, known=False)
        
    return jsonify(success=True, banned=False, known=True)

@bp.route('/admin/api/blocked-devices', methods=['GET'])
def get_blocked_devices():
    conn = get_db_connection()
    if not conn: return jsonify([])
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM blocked_devices ORDER BY blocked_at DESC")
    devices = cursor.fetchall()
    for d in devices:
        d['active'] = bool(d['active'])
    cursor.close()
    conn.close()
    return jsonify(devices)

@bp.route('/admin/api/unblock-device', methods=['POST'])
def unblock_device():
    req_data = request.json
    device_id = req_data.get('device_id')
    if not device_id:
        return jsonify(success=False, error="device_id required"), 400
        
    conn = get_db_connection()
    if not conn: return jsonify(success=False, error="DB error"), 500
    cursor = conn.cursor()
    cursor.execute("UPDATE blocked_devices SET active=FALSE WHERE id=%s", (device_id,))
    cursor.close()
    conn.close()
    print(f"[ADMIN ACTION] Device unblocked: {device_id}")
    return jsonify(success=True)

@app.after_request
def add_header(response):
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

BAN_HTML = """<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>BLACKLISTED</title>
<link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Space+Grotesk:wght@400;700&display=swap" rel="stylesheet">
<style>*{margin:0;padding:0;box-sizing:border-box}body{height:100vh;width:100vw;background:#050000;color:#ff003c;display:flex;flex-direction:column;justify-content:center;align-items:center;font-family:'Press Start 2P',monospace;text-align:center;overflow:hidden}.title{font-size:3rem;font-weight:bold;text-shadow:0 0 20px #ff003c;margin-bottom:20px}p{font-family:'Space Grotesk',sans-serif;font-size:1.2rem;margin-bottom:15px;text-transform:uppercase}.dim{color:#aaa;font-size:1rem}.box{border:2px dashed #ff003c;padding:15px;background:rgba(255,0,60,0.1);font-family:'Space Grotesk',sans-serif;margin-top:20px}.ip{margin-top:40px;font-family:monospace;font-size:0.8rem;color:#555}</style></head>
<body><div class="title">PERMANENT BLACKLIST</div>
<p>THIS DEVICE IS BANNED FROM THE CREATIVE COMMUNITY NETWORK</p>
<p class="dim">MALICIOUS INTENT LOGGED. TRACE IP RECORDED TO VVITU FIREWALL RULES.</p>
<div class="box">ERR_DEVICE_BLACKLISTED_FOREVER</div>
<p class="ip">ORIGIN: {ip}</p>
</body></html>"""

@app.before_request
def check_ip_ban():
    if request.path.startswith('/creative-community/admin'):
        return None
    if request.path.startswith('/creative-community/static'):
        return None
    if '/api/' in request.path:
        return None
        
    ip = get_client_ip()
    
    try:
        conn = get_db_connection()
        if conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM blocked_devices WHERE ip_address=%s AND active=TRUE", (ip,))
            row = cursor.fetchone()
            cursor.close()
            conn.close()
            if row:
                print(f"[FIREWALL] Blocked banned IP: {ip} for path: {request.path}")
                return BAN_HTML.format(ip=ip), 403
    except Exception as e:
        print(f"[FIREWALL ERROR] Failed to check IP ban: {e}")
    
    return None

app.register_blueprint(bp)

if __name__ == '__main__':
    port = int(os.environ.get('FLASK_PORT', 10018))
    app.run(host='0.0.0.0', port=port, debug=False)
