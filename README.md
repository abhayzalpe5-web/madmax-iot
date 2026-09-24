# 🌿 Madmax - Smart IoT Environmental Platform

> **Designed and Developed by Dalinderz**  
> Render-Deployable IoT Web Application + ESP8266 Firmware  
> Tech Stack: HTML, Tailwind CSS, Node.js, Express, SQLite

---

## 🌟 Overview

**Madmax** is an IoT Environmental Monitoring and Control System that connects physical hardware (ESP8266, DHT11 sensor, 16x2 I2C LCD, and Automation LED) to a web application styled with a nature theme (forest greens, emerald tones, glassmorphic cards, and real-time gauges).

### Key Features
1. **User Authentication**:
   - Secure Registration (`Name`, `Email`, `Password`) with bcrypt hashing.
   - Login with JWT token authentication.
   - 1-Click Quick Demo Login for instant testing.
2. **Dashboard - Tab 1: Environment Monitoring**:
   - **Real-Time DHT11 Polling**: Pulls and streams data every 10 seconds.
   - **Innovative Climate Gauges**: Circular SVG animated gauges and linear seek-bars for Temperature (°C and °F) and Relative Humidity (%RH).
   - **Dynamic Trends**: Chart.js time-series area graph showing historical temperature and humidity changes.
   - **Saved Records Table**:
     - Columns: `# | Temperature | Humidity | Time | Date | Action (Delete)`
     - Sort: Latest records first.
     - Pagination: 20 records at a time.
     - Timezone: **+5:30 Asia/Kolkata**.
     - Individual record deletion and CSV export.
3. **Dashboard - Tab 2: Smart LCD Controller**:
   - Inputs for **Row 1** and **Row 2** (maximum 16 characters each) with live character counters.
   - **Virtual 16x2 LCD Simulation**: Dot-matrix backlit green screen displays exactly what appears on the physical LCD.
   - Upon clicking **Update LCD Display**, sends commands to the database for the ESP8266 to render on the physical screen.
4. **Dashboard - Tab 3: LED Automation**:
   - Single-click interactive toggle switch.
   - Glowing emerald bulb visualization with status indicator (ACTIVE HIGH / STANDBY LOW).
   - Connected to **Pin D0 (GPIO16)**.
5. **Render Ready**:
   - Bound to `0.0.0.0` and `process.env.PORT`.
   - Includes `render.yaml` for 1-click cloud deployment.
   - SQLite lightweight zero-config persistence.

---

## 🔌 Hardware Circuit & Pin Mapping

### Component Wiring to ESP8266 (NodeMCU / Wemos D1)

| Component | Pin on Component | ESP8266 Pin | ESP8266 GPIO | Description / Notes |
| :--- | :--- | :--- | :--- | :--- |
| **DHT11 Sensor** | VCC | 3.3V or 5V (VIN) | - | Power Supply |
| | GND | GND | - | Ground |
| | DATA | **D4** | GPIO2 | Pull-up 10k resistor (built-in on most modules) |
| **LED** | Anode (+) | **D0** | GPIO16 | Connect in series with 220Ω resistor |
| | Cathode (-) | GND | - | Ground |
| **LCD 16x2 I2C** | VCC | 5V (VIN) | - | Power (Backlight needs 5V) |
| | GND | GND | - | Ground |
| | SCL | **D1** | GPIO5 | I2C Clock Line |
| | SDA | **D2** | GPIO4 | I2C Data Line |

> **Note on LCD I2C Address**: Most modules use address `0x27`. If your screen shows blank black boxes, adjust the blue potentiometer contrast screw on the back of the I2C backpack or change address to `0x3F` in `esp8266_madmax.ino`.

---

## 📶 WiFi & Firmware Configuration

The ESP8266 firmware is located at:  
`firmware/esp8266_madmax/esp8266_madmax.ino`

Pre-configured credentials:
```cpp
const char* ssid     = "SPIDERMAN";
const char* password = "000000000";
```

### Server Endpoint Setup in Arduino Code:
- **Local Testing**:
  Find your computer's local IP address (e.g. `ipconfig` -> `192.168.1.100`):
  ```cpp
  const char* serverUrl = "http://192.168.1.100:3000/api/device/sync";
  ```
- **Render Production Deployment**:
  Once deployed to Render, paste your live Render URL:
  ```cpp
  const char* serverUrl = "https://your-app-name.onrender.com/api/device/sync";
  ```
  *(The code automatically uses `WiFiClientSecure` with `setInsecure()` for HTTPS on Render without needing SSL thumbprints!)*

---

## 💻 Running the Web Application Locally

### Prerequisites
- Node.js LTS (v18+)

### Steps
1. Open PowerShell or Terminal in this folder:
   ```powershell
   npm install
   ```

2. Start the server:
   ```powershell
   npm start
   ```

3. Open your browser:
   ```
   http://localhost:3000
   ```

4. Quick Test:
   - Click **"One-Click Quick Demo Login"** on the login page.
   - Click **"Simulate Sensor"** in the top bar to generate realistic temperature and humidity data points and see the gauges, seek-bars, and history table animate immediately!

---

## 🚀 Deploying to Render

Render is a modern cloud hosting platform. This repository is already pre-configured for Render.

### Option 1: Deploy with Git / GitHub (Recommended)
1. Push this directory to your GitHub repository:
   ```bash
   git init
   git add .
   git commit -m "Initial commit for Madmax IoT"
   git branch -M main
   git remote add origin https://github.com/your-username/madmax-iot.git
   git push -u origin main
   ```
2. Go to [https://render.com](https://render.com) and log in.
3. Click **"New +"** -> **"Web Service"**.
4. Connect your GitHub repository.
5. Render will automatically detect the project settings from `render.yaml` or you can verify:
   - **Environment**: `Node`
   - **Build Command**: `npm install && npm rebuild sqlite3 --build-from-source`
   - **Start Command**: `node server.js`
   - **Health Check Path**: `/api/health`
6. Click **"Deploy Web Service"**.
7. Once deployment finishes, Render provides you with a public URL:  
   `https://madmax-iot.onrender.com`
8. Copy this URL and paste it into `serverUrl` in `esp8266_madmax.ino`.

---

## 📡 API Endpoints Summary

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Health check & system time in Asia/Kolkata |
| `POST` | `/api/auth/register` | Register new user |
| `POST` | `/api/auth/login` | Login user and issue JWT |
| `POST` | `/api/auth/demo` | Quick 1-click test login |
| `POST` | `/api/sensor/data` | Insert reading: `{ temperature, humidity }` |
| `GET` | `/api/sensor/latest` | Get latest sensor reading |
| `GET` | `/api/sensor/history?page=1&limit=20` | Paginated records (20/page, latest first, IST) |
| `DELETE` | `/api/sensor/data/:id` | Delete specific record |
| `GET` | `/api/sensor/chart` | Get last 25 readings for Chart.js |
| `POST` | `/api/sensor/simulate` | Insert simulated DHT11 reading |
| `GET` | `/api/lcd` | Get current LCD row 1 and row 2 |
| `POST` | `/api/lcd` | Update LCD row 1 and row 2 (max 16 chars) |
| `GET` | `/api/led` | Get current LED status (`ON`/`OFF`) |
| `POST` | `/api/led` | Set or toggle LED status |
| `ALL` | `/api/device/sync` | **ESP8266 Unified Sync**: Sends DHT11 data, receives LED & LCD status in 1 request |

---

## 📜 Credits & License
- **Application Name**: Madmax
- **Footer**: `Designed and Developed by Dalinderz`
- **License**: ISC
