# Creative Community @ VVITU

![Creative Community Logo](/creative-community/static/favicon.png)

A comprehensive platform designed for the Creative Community club at VVITU. The platform serves as the center for student activities, managing attendance, resources, internal notifications, and member registration. It features a robust, secure backend and a retro-futuristic, "hacker-themed" user interface.

## 🚀 Features

- **Secure Member Authentication & Management**: Role-based access control (Admin/Member) with specialized dashboards.
- **Hardware-Level Ban Enforcement**: Advanced fingerprinting (`canvas` + `hardware` metrics) paired with a server-side IP firewall blocks malicious users across refreshes, incognito modes, and Cloudflare layers.
- **Live Attendance Checking**: Real-time polling with an active countdown for club checking mechanisms.
- **Resource Vault**: A curated library of links, GitHub repositories, and tools for students with GitHub API integration for stars and forks.
- **Dynamic Profile Avatars**: Users can upload and customize their PFPs.

## 🛠 Tech Stack

- **Backend**: Python 3.10+, Flask, Waitress/Gunicorn (for prod).
- **Database**: MySQL / MariaDB (via `mysql-connector-python`).
- **Frontend**: Vanilla JS (ES6+), CSS3 with Custom Variables, HTML5.
- **Infrastructure Context**: Specifically built to run behind Cloudflare and within Pterodactyl container environments.

## 💻 Getting Started (Local Development)

### 1. Prerequisites
- Python 3.8 or higher
- MySQL / MariaDB installed and running.
- `pip`

### 2. Installation Setup
1. Clone the repository:
   ```bash
   git clone https://github.com/your-org/creative-community.git
   cd creative-community
   ```

2. Create a virtual environment and install dependencies:
   ```bash
   python -m venv venv
   source venv/bin/activate  # Or `venv\Scripts\activate` on Windows
   pip install Flask mysql-connector-python requests python-dotenv
   ```

3. Configure Environment Variables:
   - Copy the example config: `cp .env.example .env`
   - Edit `.env` to match your local database instance. 
   - Define your `ADMIN_*` variables. The first time the server boots, it will use these settings to auto-generate the root Administrator account.

### 3. Running the Server

Run the Flask application:
```bash
python app.py
```
> **Note**: The application defaults to port `10018`. Visit `http://127.0.0.1:10018/creative-community/` to view the site.

## 🔒 Security Architecture

This application employs a highly aggressive auto-banning mechanism targeting malicious inspectors (e.g., users trying to bypass the client flow using `Ctrl+U` or `F12`).
1. **Frontend Fingerprinting**: `main.js` generates an immutable hardware/canvas fingerprint (`getDeviceId()`).
2. **Event Listeners**: Context menus and common inspector hotkeys are blocked. Triggering them executes a POST to `/api/security/block`.
3. **Database Logging**: Both the generated Device ID and the real client IP (via `CF-Connecting-IP` / `X-Forwarded-For`) are saved.
4. **Server Intercept**: The core Flask app uses an `@app.before_request` hook (`check_ip_ban()`) to intercept and drop requests matching the banned IPs, falling back to Device ID checks if the IP floats.

*If you lock yourself out locally, remove your IP/ID from the `blocked_devices` table.*
