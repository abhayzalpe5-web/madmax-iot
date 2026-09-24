require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { run, get, all, initDb, formatKolkataDateTime } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'madmax-nature-iot-secret-2026';

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// JWT Auth Middleware for Protected Routes
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access denied. Token missing.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token.' });
    }
    req.user = user;
    next();
  });
};

// ==========================================
// 1. SYSTEM HEALTH & METADATA
// ==========================================
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    app: 'Madmax IoT System',
    version: '1.0.0',
    developer: 'Dalinderz',
    timezone: '+5:30 Asia/Kolkata',
    currentTime: formatKolkataDateTime(new Date().toISOString())
  });
});

// ==========================================
// 2. AUTHENTICATION ROUTES
// ==========================================

// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'All fields (Name, Email, Password) are required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const existingUser = await get('SELECT id FROM users WHERE email = ?', [cleanEmail]);
    if (existingUser) {
      return res.status(400).json({ error: 'An account with this email already exists.' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const result = await run(
      'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
      [name.trim(), cleanEmail, passwordHash]
    );

    const token = jwt.sign(
      { id: result.lastID, name: name.trim(), email: cleanEmail },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'Account created successfully',
      token,
      user: { id: result.lastID, name: name.trim(), email: cleanEmail }
    });
  } catch (err) {
    console.error('[Auth Error]', err);
    res.status(500).json({ error: 'Internal server error while creating account.' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = await get('SELECT * FROM users WHERE email = ?', [cleanEmail]);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Logged in successfully',
      token,
      user: { id: user.id, name: user.name, email: user.email }
    });
  } catch (err) {
    console.error('[Auth Error]', err);
    res.status(500).json({ error: 'Internal server error during login.' });
  }
});

// Quick Demo Login (Seamless 1-click test)
app.post('/api/auth/demo', async (req, res) => {
  try {
    const demoEmail = 'demo@madmax.iot';
    let user = await get('SELECT * FROM users WHERE email = ?', [demoEmail]);
    if (!user) {
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash('demo12345', salt);
      const result = await run(
        'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
        ['Nature Explorer', demoEmail, hash]
      );
      user = { id: result.lastID, name: 'Nature Explorer', email: demoEmail };
    }

    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Demo login successful',
      token,
      user: { id: user.id, name: user.name, email: user.email }
    });
  } catch (err) {
    console.error('[Demo Auth Error]', err);
    res.status(500).json({ error: 'Demo login failed.' });
  }
});

// Current User verification
app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

// ==========================================
// 3. TAB 1: ENVIRONMENT MONITORING (DHT11)
// ==========================================

// Add sensor reading (Used by ESP8266 or simulator)
app.post('/api/sensor/data', async (req, res) => {
  try {
    let { temperature, humidity } = req.body;
    if (temperature === undefined || humidity === undefined) {
      return res.status(400).json({ error: 'temperature and humidity values are required.' });
    }

    const tempNum = parseFloat(temperature);
    const humNum = parseFloat(humidity);

    if (isNaN(tempNum) || isNaN(humNum)) {
      return res.status(400).json({ error: 'Valid numeric sensor values required.' });
    }

    const result = await run(
      'INSERT INTO sensor_readings (temperature, humidity) VALUES (?, ?)',
      [tempNum, humNum]
    );

    res.status(201).json({
      success: true,
      id: result.lastID,
      message: 'Reading recorded successfully',
      data: {
        id: result.lastID,
        temperature: tempNum,
        humidity: humNum
      }
    });
  } catch (err) {
    console.error('[Sensor Data POST Error]', err);
    res.status(500).json({ error: 'Failed to record sensor data.' });
  }
});

// Get latest sensor reading
app.get('/api/sensor/latest', async (req, res) => {
  try {
    const latest = await get('SELECT * FROM sensor_readings ORDER BY id DESC LIMIT 1');
    if (!latest) {
      return res.json({
        hasData: false,
        temperature: 26.5,
        humidity: 58.0,
        time: 'Waiting...',
        date: 'No records yet',
        rawTimestamp: new Date().toISOString()
      });
    }

    const formatted = formatKolkataDateTime(latest.created_at);
    res.json({
      hasData: true,
      id: latest.id,
      temperature: latest.temperature,
      humidity: latest.humidity,
      time: formatted.time,
      date: formatted.date,
      rawTimestamp: formatted.iso
    });
  } catch (err) {
    console.error('[Latest Sensor Error]', err);
    res.status(500).json({ error: 'Failed to fetch latest sensor reading.' });
  }
});

// Get paginated history (20 records at a time, latest records first)
// Section 2: Show saved records # | Temperature | Humidity | Time | Date | Action (Delete)
app.get('/api/sensor/history', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, parseInt(req.query.limit) || 20);
    const offset = (page - 1) * limit;

    const countRow = await get('SELECT COUNT(*) as total FROM sensor_readings');
    const totalRecords = countRow ? countRow.total : 0;
    const totalPages = Math.ceil(totalRecords / limit) || 1;

    // Fetch latest records first
    const rows = await all(
      'SELECT * FROM sensor_readings ORDER BY id DESC LIMIT ? OFFSET ?',
      [limit, offset]
    );

    const formattedRows = rows.map((r, index) => {
      const dt = formatKolkataDateTime(r.created_at);
      return {
        rowNumber: offset + index + 1,
        id: r.id,
        temperature: Number(r.temperature).toFixed(1),
        humidity: Number(r.humidity).toFixed(1),
        time: dt.time,
        date: dt.date,
        rawTimestamp: dt.iso
      };
    });

    res.json({
      records: formattedRows,
      pagination: {
        page,
        limit,
        totalRecords,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (err) {
    console.error('[Sensor History Error]', err);
    res.status(500).json({ error: 'Failed to fetch sensor records.' });
  }
});

// Delete specific sensor record
app.delete('/api/sensor/data/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'Valid record ID required.' });

    const result = await run('DELETE FROM sensor_readings WHERE id = ?', [id]);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Record not found.' });
    }

    res.json({ success: true, message: `Record #${id} deleted successfully.` });
  } catch (err) {
    console.error('[Sensor Delete Error]', err);
    res.status(500).json({ error: 'Failed to delete record.' });
  }
});

// Clear all sensor records (utility)
app.delete('/api/sensor/data/bulk/clear-all', async (req, res) => {
  try {
    await run('DELETE FROM sensor_readings');
    res.json({ success: true, message: 'All sensor records cleared successfully.' });
  } catch (err) {
    console.error('[Sensor Bulk Delete Error]', err);
    res.status(500).json({ error: 'Failed to clear records.' });
  }
});

// Chart data: Last 25 records in chronological order
app.get('/api/sensor/chart', async (req, res) => {
  try {
    const rows = await all('SELECT * FROM sensor_readings ORDER BY id DESC LIMIT 25');
    // Reverse to chronological order for charts (left-to-right)
    rows.reverse();

    const chartData = rows.map(r => {
      const dt = formatKolkataDateTime(r.created_at);
      return {
        id: r.id,
        temperature: r.temperature,
        humidity: r.humidity,
        time: dt.time,
        date: dt.date
      };
    });

    res.json(chartData);
  } catch (err) {
    console.error('[Sensor Chart Error]', err);
    res.status(500).json({ error: 'Failed to fetch chart data.' });
  }
});

// Simulated reading (Generates realistic DHT11 data for immediate testing)
app.post('/api/sensor/simulate', async (req, res) => {
  try {
    // Generate realistic room climate (24 - 31 °C, 45 - 75 % RH)
    const randomTemp = (24 + Math.random() * 8).toFixed(1);
    const randomHum = (45 + Math.random() * 30).toFixed(1);

    const result = await run(
      'INSERT INTO sensor_readings (temperature, humidity) VALUES (?, ?)',
      [parseFloat(randomTemp), parseFloat(randomHum)]
    );

    res.status(201).json({
      success: true,
      id: result.lastID,
      temperature: parseFloat(randomTemp),
      humidity: parseFloat(randomHum),
      message: 'Simulated reading added successfully.'
    });
  } catch (err) {
    res.status(500).json({ error: 'Simulation failed.' });
  }
});

// ==========================================
// 4. TAB 2: SMART LCD (16x2 I2C)
// ==========================================

// Get current LCD text
app.get('/api/lcd', async (req, res) => {
  try {
    const row1Setting = await get("SELECT value, updated_at FROM device_settings WHERE key = 'lcd_row1'");
    const row2Setting = await get("SELECT value, updated_at FROM device_settings WHERE key = 'lcd_row2'");

    const row1 = row1Setting ? row1Setting.value : 'Madmax System';
    const row2 = row2Setting ? row2Setting.value : 'Online & Ready';
    const lastUpdate = row1Setting ? formatKolkataDateTime(row1Setting.updated_at) : null;

    res.json({
      row1,
      row2,
      lastUpdated: lastUpdate ? `${lastUpdate.date} ${lastUpdate.time}` : 'N/A'
    });
  } catch (err) {
    console.error('[LCD GET Error]', err);
    res.status(500).json({ error: 'Failed to fetch LCD settings.' });
  }
});

// Update LCD text (Row1 & Row2, max 16 characters each)
app.post('/api/lcd', async (req, res) => {
  try {
    let { row1, row2 } = req.body;
    row1 = (row1 !== undefined ? String(row1) : '').substring(0, 16);
    row2 = (row2 !== undefined ? String(row2) : '').substring(0, 16);

    await run(
      "INSERT OR REPLACE INTO device_settings (key, value, updated_at) VALUES ('lcd_row1', ?, CURRENT_TIMESTAMP)",
      [row1]
    );
    await run(
      "INSERT OR REPLACE INTO device_settings (key, value, updated_at) VALUES ('lcd_row2', ?, CURRENT_TIMESTAMP)",
      [row2]
    );

    res.json({
      success: true,
      message: 'LCD text updated successfully.',
      row1,
      row2
    });
  } catch (err) {
    console.error('[LCD POST Error]', err);
    res.status(500).json({ error: 'Failed to update LCD text.' });
  }
});

// ==========================================
// 5. TAB 3: LED AUTOMATION (D0)
// ==========================================

// Get current LED status
app.get('/api/led', async (req, res) => {
  try {
    const ledSetting = await get("SELECT value, updated_at FROM device_settings WHERE key = 'led_status'");
    const status = ledSetting ? ledSetting.value : 'OFF';
    const lastUpdate = ledSetting ? formatKolkataDateTime(ledSetting.updated_at) : null;

    res.json({
      status,
      isOn: status === 'ON',
      lastUpdated: lastUpdate ? `${lastUpdate.date} ${lastUpdate.time}` : 'N/A'
    });
  } catch (err) {
    console.error('[LED GET Error]', err);
    res.status(500).json({ error: 'Failed to fetch LED status.' });
  }
});

// Update or Toggle LED status
app.post('/api/led', async (req, res) => {
  try {
    let { status } = req.body;

    if (!status) {
      // Toggle if no status provided
      const current = await get("SELECT value FROM device_settings WHERE key = 'led_status'");
      status = (current && current.value === 'ON') ? 'OFF' : 'ON';
    } else {
      status = status.toUpperCase() === 'ON' ? 'ON' : 'OFF';
    }

    await run(
      "INSERT OR REPLACE INTO device_settings (key, value, updated_at) VALUES ('led_status', ?, CURRENT_TIMESTAMP)",
      [status]
    );

    res.json({
      success: true,
      status,
      isOn: status === 'ON',
      message: `LED turned ${status}`
    });
  } catch (err) {
    console.error('[LED POST Error]', err);
    res.status(500).json({ error: 'Failed to update LED state.' });
  }
});

// ==========================================
// 6. ESP8266 ALL-IN-ONE SYNC ENDPOINT
// ==========================================
// Hardware sends DHT11 readings & receives current LED & LCD state in 1 single HTTP request!
// This optimizes memory, power, and connection latency on the ESP8266.
app.all('/api/device/sync', async (req, res) => {
  try {
    // If ESP8266 posted sensor readings
    if (req.method === 'POST') {
      const { temperature, humidity } = req.body;
      if (temperature !== undefined && humidity !== undefined) {
        const t = parseFloat(temperature);
        const h = parseFloat(humidity);
        if (!isNaN(t) && !isNaN(h)) {
          await run(
            'INSERT INTO sensor_readings (temperature, humidity) VALUES (?, ?)',
            [t, h]
          );
        }
      }
    }

    // Retrieve current commands for hardware
    const ledSetting = await get("SELECT value FROM device_settings WHERE key = 'led_status'");
    const row1Setting = await get("SELECT value FROM device_settings WHERE key = 'lcd_row1'");
    const row2Setting = await get("SELECT value FROM device_settings WHERE key = 'lcd_row2'");

    const led = ledSetting ? ledSetting.value : 'OFF';
    const row1 = row1Setting ? row1Setting.value : 'Madmax System';
    const row2 = row2Setting ? row2Setting.value : 'Online & Ready';

    res.json({
      status: 'ok',
      led,
      lcd: {
        row1,
        row2
      },
      time: formatKolkataDateTime(new Date().toISOString()).time
    });
  } catch (err) {
    console.error('[Device Sync Error]', err);
    res.status(500).json({ error: 'Device sync failed' });
  }
});

// Single Page Application Fallback
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server & Initialize Database
const startServer = async () => {
  await initDb();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`====================================================`);
    console.log(`🌿 MADMAX IoT System Running on http://localhost:${PORT}`);
    console.log(`Designed & Developed by Dalinderz`);
    console.log(`Render Deployment Ready: Bound to 0.0.0.0:${PORT}`);
    console.log(`Timezone: +5:30 Asia/Kolkata`);
    console.log(`====================================================`);
  });
};

startServer();
