/**
 * Madmax IoT Web Application
 * Frontend Logic, Real-Time Polling, Gauges, Chart.js & API Integration
 * Designed and Developed by Dalinderz
 */

// Application State
const state = {
  token: localStorage.getItem('madmax_token') || null,
  user: null,
  activeTab: 'tab-environment',
  currentPage: 1,
  totalPages: 1,
  limit: 20,
  sensorPollInterval: null,
  ledPollInterval: null,
  chartInstance: null,
  latestData: {
    temperature: 26.5,
    humidity: 58.0,
    time: '--:--:--',
    date: '--/--/----'
  },
  ledStatus: 'OFF'
};

// API Helper
const api = {
  getHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (state.token) {
      headers['Authorization'] = `Bearer ${state.token}`;
    }
    return headers;
  },

  async request(endpoint, options = {}) {
    const defaultOptions = {
      headers: this.getHeaders()
    };
    const merged = { ...defaultOptions, ...options };
    if (options.body && typeof options.body === 'object') {
      merged.body = JSON.stringify(options.body);
    }

    try {
      const res = await fetch(endpoint, merged);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Server error occurred');
      }
      return data;
    } catch (err) {
      console.error(`API Error on [${endpoint}]:`, err.message);
      throw err;
    }
  }
};

// Toast Notifications
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  const bgColor = type === 'success' ? 'bg-emerald-900/90 border-emerald-500 text-emerald-100' :
                  type === 'error' ? 'bg-red-900/90 border-red-500 text-red-100' :
                  'bg-teal-900/90 border-teal-500 text-teal-100';

  const iconName = type === 'success' ? 'check-circle' : type === 'error' ? 'alert-circle' : 'info';

  toast.className = `flex items-center gap-3 px-4 py-3 rounded-xl border shadow-xl backdrop-blur-md transition-all duration-300 transform translate-y-2 opacity-0 ${bgColor}`;
  toast.innerHTML = `
    <i data-lucide="${iconName}" class="w-5 h-5 flex-shrink-0"></i>
    <span class="text-sm font-medium">${message}</span>
  `;

  container.appendChild(toast);
  lucide.createIcons();

  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  });

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ==========================================
// AUTHENTICATION
// ==========================================
async function checkAuth() {
  if (!state.token) {
    showAuthView();
    return;
  }

  try {
    const data = await api.request('/api/auth/me');
    state.user = data.user;
    showDashboardView();
  } catch (err) {
    localStorage.removeItem('madmax_token');
    state.token = null;
    state.user = null;
    showAuthView();
  }
}

function showAuthView() {
  document.getElementById('auth-section').classList.remove('hidden');
  document.getElementById('dashboard-section').classList.add('hidden');
  stopPolling();
}

function showDashboardView() {
  document.getElementById('auth-section').classList.add('hidden');
  document.getElementById('dashboard-section').classList.remove('hidden');

  if (state.user) {
    document.getElementById('header-user-name').textContent = state.user.name;
    document.getElementById('header-user-email').textContent = state.user.email;
  }

  initDashboard();
}

function logout() {
  localStorage.removeItem('madmax_token');
  state.token = null;
  state.user = null;
  showToast('Logged out successfully', 'info');
  showAuthView();
}

// ==========================================
// DASHBOARD INITIALIZATION
// ==========================================
function initDashboard() {
  setupTabs();
  setupLcdInputs();
  setupLedAutomation();
  initChart();
  
  // Initial data fetch
  fetchLatestSensorData();
  fetchSensorHistory(1);
  fetchLcdData();
  fetchLedStatus();

  // Start polling
  startPolling();
  lucide.createIcons();
}

function setupTabs() {
  const tabs = [
    { id: 'tab-btn-environment', target: 'tab-environment' },
    { id: 'tab-btn-lcd', target: 'tab-lcd' },
    { id: 'tab-btn-led', target: 'tab-led' }
  ];

  tabs.forEach(tab => {
    const btn = document.getElementById(tab.id);
    if (!btn) return;
    btn.addEventListener('click', () => {
      // Toggle button styles
      tabs.forEach(t => {
        const b = document.getElementById(t.id);
        const section = document.getElementById(t.target);
        if (t.id === tab.id) {
          b.classList.add('bg-emerald-600', 'text-white', 'shadow-lg', 'shadow-emerald-900/40');
          b.classList.remove('text-emerald-300', 'hover:bg-emerald-950/60');
          section.classList.remove('hidden');
        } else {
          b.classList.remove('bg-emerald-600', 'text-white', 'shadow-lg', 'shadow-emerald-900/40');
          b.classList.add('text-emerald-300', 'hover:bg-emerald-950/60');
          section.classList.add('hidden');
        }
      });

      state.activeTab = tab.target;
      lucide.createIcons();

      // Refresh specific tab data
      if (tab.target === 'tab-lcd') fetchLcdData();
      if (tab.target === 'tab-led') fetchLedStatus();
      if (tab.target === 'tab-environment') {
        fetchLatestSensorData();
        fetchSensorHistory(state.currentPage);
      }
    });
  });
}

// ==========================================
// POLLING ENGINE (Every 10s for DHT11)
// ==========================================
function startPolling() {
  stopPolling();

  // Sensor data every 10 seconds as strictly requested
  state.sensorPollInterval = setInterval(() => {
    fetchLatestSensorData(true);
    if (state.activeTab === 'tab-environment') {
      fetchSensorHistory(state.currentPage, true);
    }
  }, 10000);

  // LED state sync every 3 seconds for snappy control feedback
  state.ledPollInterval = setInterval(() => {
    if (state.activeTab === 'tab-led') {
      fetchLedStatus(true);
    }
  }, 3000);
}

function stopPolling() {
  if (state.sensorPollInterval) clearInterval(state.sensorPollInterval);
  if (state.ledPollInterval) clearInterval(state.ledPollInterval);
}

// ==========================================
// TAB 1: ENVIRONMENT MONITORING
// ==========================================

async function fetchLatestSensorData(isPoll = false) {
  try {
    const data = await api.request('/api/sensor/latest');
    state.latestData = data;
    renderGauges(data.temperature, data.humidity);

    // Update timestamps & chips
    document.getElementById('last-sync-time').textContent = `${data.date} | ${data.time}`;
    document.getElementById('esp-status-chip').innerHTML = `
      <span class="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
      <span class="text-xs font-semibold text-emerald-300">ESP8266 Live Active</span>
    `;

    // Update Chart with new data point
    updateChart(data);
  } catch (err) {
    if (!isPoll) showToast('Failed to fetch sensor data', 'error');
  }
}

// Innovative Circular Gauges & Seek Bars
function renderGauges(temp, hum) {
  const temperature = parseFloat(temp) || 0;
  const humidity = parseFloat(hum) || 0;

  // Temperature Elements
  const tempValEl = document.getElementById('temp-gauge-val');
  const tempFahrEl = document.getElementById('temp-fahr-val');
  const tempCircle = document.getElementById('temp-gauge-circle');
  const tempSeekMarker = document.getElementById('temp-seek-marker');
  const tempStatusChip = document.getElementById('temp-status-chip');

  // Convert to Fahrenheit
  const fahr = (temperature * 9 / 5 + 32).toFixed(1);
  if (tempValEl) tempValEl.textContent = `${temperature.toFixed(1)}°C`;
  if (tempFahrEl) tempFahrEl.textContent = `${fahr}°F`;

  // Circumference = 2 * π * r (r = 54 => 339.29)
  const maxTemp = 50; // 0 to 50 °C scale
  const tempPercent = Math.min(Math.max(temperature / maxTemp, 0), 1);
  const tempCircumference = 339.29;
  const tempOffset = tempCircumference - (tempPercent * tempCircumference);

  if (tempCircle) {
    tempCircle.style.strokeDasharray = `${tempCircumference}`;
    tempCircle.style.strokeDashoffset = `${tempOffset}`;

    // Color adaptation based on climate
    if (temperature < 18) {
      tempCircle.setAttribute('stroke', '#38bdf8'); // Sky blue (Cool)
    } else if (temperature <= 28) {
      tempCircle.setAttribute('stroke', '#10b981'); // Emerald (Ideal)
    } else if (temperature <= 35) {
      tempCircle.setAttribute('stroke', '#f59e0b'); // Amber (Warm)
    } else {
      tempCircle.setAttribute('stroke', '#ef4444'); // Coral red (Hot)
    }
  }

  // Linear Seek Bar
  if (tempSeekMarker) {
    tempSeekMarker.style.left = `${(tempPercent * 100).toFixed(1)}%`;
  }

  // Status Badge
  if (tempStatusChip) {
    if (temperature < 18) {
      tempStatusChip.textContent = '❄️ Cool Environment';
      tempStatusChip.className = 'px-3 py-1 rounded-full text-xs font-medium bg-sky-900/60 text-sky-200 border border-sky-500/30';
    } else if (temperature <= 28) {
      tempStatusChip.textContent = '🌿 Optimal & Comfortable';
      tempStatusChip.className = 'px-3 py-1 rounded-full text-xs font-medium bg-emerald-900/60 text-emerald-200 border border-emerald-500/30';
    } else if (temperature <= 35) {
      tempStatusChip.textContent = '☀️ Warm Temperature';
      tempStatusChip.className = 'px-3 py-1 rounded-full text-xs font-medium bg-amber-900/60 text-amber-200 border border-amber-500/30';
    } else {
      tempStatusChip.textContent = '🔥 High Heat Warning';
      tempStatusChip.className = 'px-3 py-1 rounded-full text-xs font-medium bg-rose-900/60 text-rose-200 border border-rose-500/30';
    }
  }

  // Humidity Elements
  const humValEl = document.getElementById('hum-gauge-val');
  const humCircle = document.getElementById('hum-gauge-circle');
  const humSeekMarker = document.getElementById('hum-seek-marker');
  const humStatusChip = document.getElementById('hum-status-chip');

  if (humValEl) humValEl.textContent = `${humidity.toFixed(1)}%`;

  // Scale: 0 to 100%
  const humPercent = Math.min(Math.max(humidity / 100, 0), 1);
  const humCircumference = 339.29;
  const humOffset = humCircumference - (humPercent * humCircumference);

  if (humCircle) {
    humCircle.style.strokeDasharray = `${humCircumference}`;
    humCircle.style.strokeDashoffset = `${humOffset}`;

    if (humidity < 35) {
      humCircle.setAttribute('stroke', '#f97316'); // Dry orange
    } else if (humidity <= 65) {
      humCircle.setAttribute('stroke', '#34d399'); // Mint emerald (Ideal)
    } else {
      humCircle.setAttribute('stroke', '#06b6d4'); // Deep Cyan (High moisture)
    }
  }

  // Linear Seek Bar
  if (humSeekMarker) {
    humSeekMarker.style.left = `${(humPercent * 100).toFixed(1)}%`;
  }

  // Humidity Status Badge
  if (humStatusChip) {
    if (humidity < 35) {
      humStatusChip.textContent = '🌵 Dry Air Condition';
      humStatusChip.className = 'px-3 py-1 rounded-full text-xs font-medium bg-orange-900/60 text-orange-200 border border-orange-500/30';
    } else if (humidity <= 65) {
      humStatusChip.textContent = '💧 Optimal Moisture (40-60%)';
      humStatusChip.className = 'px-3 py-1 rounded-full text-xs font-medium bg-teal-900/60 text-teal-200 border border-teal-500/30';
    } else {
      humStatusChip.textContent = '🌧️ High Humidity';
      humStatusChip.className = 'px-3 py-1 rounded-full text-xs font-medium bg-cyan-900/60 text-cyan-200 border border-cyan-500/30';
    }
  }
}

// Section 2: Show saved records # | Temperature | Humidity | Time | Date | Action (Delete)
async function fetchSensorHistory(page = 1, isBackground = false) {
  try {
    const data = await api.request(`/api/sensor/history?page=${page}&limit=${state.limit}`);
    state.currentPage = data.pagination.page;
    state.totalPages = data.pagination.totalPages;

    renderRecordsTable(data.records);
    renderPagination(data.pagination);
  } catch (err) {
    if (!isBackground) showToast('Could not load sensor history', 'error');
  }
}

function renderRecordsTable(records) {
  const tbody = document.getElementById('records-table-body');
  if (!tbody) return;

  if (!records || records.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="px-6 py-8 text-center text-emerald-400/60">
          <i data-lucide="inbox" class="w-8 h-8 mx-auto mb-2 opacity-50"></i>
          <p>No sensor readings recorded yet. Plug in your ESP8266 or click "Simulate Data" above!</p>
        </td>
      </tr>
    `;
    lucide.createIcons();
    return;
  }

  tbody.innerHTML = records.map((rec) => `
    <tr class="border-b border-emerald-900/40 hover:bg-emerald-950/40 transition-colors">
      <td class="px-6 py-4 font-mono text-xs text-emerald-400 font-semibold">#${rec.rowNumber}</td>
      <td class="px-6 py-4">
        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-900/50 border border-emerald-500/30 text-emerald-200 font-mono font-bold text-sm">
          <i data-lucide="thermometer" class="w-3.5 h-3.5 text-emerald-400"></i>
          ${rec.temperature} °C
        </span>
      </td>
      <td class="px-6 py-4">
        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-teal-900/50 border border-teal-500/30 text-teal-200 font-mono font-bold text-sm">
          <i data-lucide="droplets" class="w-3.5 h-3.5 text-teal-400"></i>
          ${rec.humidity} %
        </span>
      </td>
      <td class="px-6 py-4 font-mono text-sm text-emerald-100">${rec.time}</td>
      <td class="px-6 py-4 font-mono text-sm text-emerald-300/80">${rec.date}</td>
      <td class="px-6 py-4 text-right">
        <button 
          onclick="deleteRecord(${rec.id})" 
          class="p-2 text-rose-400 hover:text-rose-200 hover:bg-rose-950/60 rounded-lg transition-colors"
          title="Delete Record #${rec.id}">
          <i data-lucide="trash-2" class="w-4 h-4"></i>
        </button>
      </td>
    </tr>
  `).join('');

  lucide.createIcons();
}

function renderPagination(pagination) {
  const container = document.getElementById('pagination-container');
  const infoEl = document.getElementById('pagination-info');
  if (!container || !infoEl) return;

  const startRecord = (pagination.page - 1) * pagination.limit + 1;
  const endRecord = Math.min(pagination.page * pagination.limit, pagination.totalRecords);

  infoEl.textContent = pagination.totalRecords > 0 
    ? `Showing ${startRecord}–${endRecord} of ${pagination.totalRecords} records (Page ${pagination.page} of ${pagination.totalPages})`
    : 'No records to display';

  container.innerHTML = `
    <button 
      id="btn-prev-page" 
      ${!pagination.hasPrev ? 'disabled' : ''} 
      class="px-3 py-1.5 rounded-lg border border-emerald-700/60 text-sm font-medium text-emerald-200 hover:bg-emerald-800/40 disabled:opacity-40 disabled:pointer-events-none transition-colors">
      &larr; Previous
    </button>
    <span class="px-3 py-1.5 text-xs font-mono font-bold text-emerald-300 bg-emerald-950/80 rounded-lg border border-emerald-800/50">
      ${pagination.page} / ${pagination.totalPages || 1}
    </span>
    <button 
      id="btn-next-page" 
      ${!pagination.hasNext ? 'disabled' : ''} 
      class="px-3 py-1.5 rounded-lg border border-emerald-700/60 text-sm font-medium text-emerald-200 hover:bg-emerald-800/40 disabled:opacity-40 disabled:pointer-events-none transition-colors">
      Next &rarr;
    </button>
  `;

  document.getElementById('btn-prev-page')?.addEventListener('click', () => {
    if (state.currentPage > 1) fetchSensorHistory(state.currentPage - 1);
  });

  document.getElementById('btn-next-page')?.addEventListener('click', () => {
    if (state.currentPage < state.totalPages) fetchSensorHistory(state.currentPage + 1);
  });
}

async function deleteRecord(id) {
  if (!confirm(`Are you sure you want to delete sensor record #${id}?`)) return;

  try {
    await api.request(`/api/sensor/data/${id}`, { method: 'DELETE' });
    showToast(`Record #${id} deleted`, 'success');
    fetchSensorHistory(state.currentPage);
    fetchChartData();
  } catch (err) {
    showToast('Failed to delete record', 'error');
  }
}

async function clearAllRecords() {
  if (!confirm('Warning: Are you sure you want to delete ALL sensor history? This cannot be undone.')) return;

  try {
    await api.request('/api/sensor/data/bulk/clear-all', { method: 'DELETE' });
    showToast('All records cleared successfully', 'success');
    fetchSensorHistory(1);
    fetchChartData();
  } catch (err) {
    showToast('Failed to clear records', 'error');
  }
}

async function exportCSV() {
  try {
    const data = await api.request(`/api/sensor/history?page=1&limit=1000`);
    if (!data.records || data.records.length === 0) {
      showToast('No records available to export', 'info');
      return;
    }

    let csv = 'Record_ID,Temperature_C,Humidity_Percent,Time,Date,Timezone\n';
    data.records.forEach(r => {
      csv += `${r.id},${r.temperature},${r.humidity},"${r.time}","${r.date}","Asia/Kolkata (+5:30)"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `madmax_dht11_records_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('CSV downloaded successfully!', 'success');
  } catch (err) {
    showToast('Export failed', 'error');
  }
}

// Quick Simulator: Add realistic sample reading
async function simulateReading() {
  try {
    const data = await api.request('/api/sensor/simulate', { method: 'POST' });
    showToast(`Simulation added: ${data.temperature}°C, ${data.humidity}% RH`, 'success');
    fetchLatestSensorData();
    fetchSensorHistory(state.currentPage);
    fetchChartData();
  } catch (err) {
    showToast('Simulation failed', 'error');
  }
}

// ==========================================
// REAL-TIME NATURE CHARTS (Chart.js)
// ==========================================
async function initChart() {
  const ctx = document.getElementById('natureSensorChart');
  if (!ctx) return;

  state.chartInstance = new Chart(ctx.getContext('2d'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Temperature (°C)',
          data: [],
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.15)',
          borderWidth: 2.5,
          tension: 0.35,
          pointRadius: 4,
          pointBackgroundColor: '#34d399',
          fill: true,
          yAxisID: 'y'
        },
        {
          label: 'Humidity (%RH)',
          data: [],
          borderColor: '#06b6d4',
          backgroundColor: 'rgba(6, 182, 212, 0.1)',
          borderWidth: 2,
          tension: 0.35,
          pointRadius: 4,
          pointBackgroundColor: '#22d3ee',
          fill: true,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          labels: {
            color: '#a7f3d0',
            font: { family: 'Outfit', size: 12, weight: '500' }
          }
        },
        tooltip: {
          backgroundColor: 'rgba(7, 25, 18, 0.95)',
          borderColor: 'rgba(52, 211, 153, 0.3)',
          borderWidth: 1,
          titleColor: '#6ee7b7',
          bodyColor: '#ecfdf5',
          titleFont: { family: 'Outfit', size: 13, weight: 'bold' },
          bodyFont: { family: 'JetBrains Mono', size: 12 }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(52, 211, 153, 0.08)' },
          ticks: { color: '#6ee7b7', font: { family: 'JetBrains Mono', size: 10 } }
        },
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          title: { display: true, text: 'Temp (°C)', color: '#10b981' },
          grid: { color: 'rgba(52, 211, 153, 0.08)' },
          ticks: { color: '#10b981', font: { family: 'JetBrains Mono', size: 11 } },
          suggestedMin: 15,
          suggestedMax: 45
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          title: { display: true, text: 'Humidity (%RH)', color: '#06b6d4' },
          grid: { drawOnChartArea: false },
          ticks: { color: '#06b6d4', font: { family: 'JetBrains Mono', size: 11 } },
          suggestedMin: 20,
          suggestedMax: 100
        }
      }
    }
  });

  fetchChartData();
}

async function fetchChartData() {
  if (!state.chartInstance) return;
  try {
    const data = await api.request('/api/sensor/chart');
    state.chartInstance.data.labels = data.map(d => d.time);
    state.chartInstance.data.datasets[0].data = data.map(d => d.temperature);
    state.chartInstance.data.datasets[1].data = data.map(d => d.humidity);
    state.chartInstance.update();
  } catch (err) {
    console.error('Chart fetch error:', err);
  }
}

function updateChart(reading) {
  if (!state.chartInstance || !reading.time) return;

  const labels = state.chartInstance.data.labels;
  if (labels[labels.length - 1] === reading.time) return; // avoid duplicate

  labels.push(reading.time);
  state.chartInstance.data.datasets[0].data.push(reading.temperature);
  state.chartInstance.data.datasets[1].data.push(reading.humidity);

  // Keep last 25 points
  if (labels.length > 25) {
    labels.shift();
    state.chartInstance.data.datasets[0].data.shift();
    state.chartInstance.data.datasets[1].data.shift();
  }

  state.chartInstance.update('none');
}

// ==========================================
// TAB 2: SMART LCD (16x2 I2C)
// ==========================================
function setupLcdInputs() {
  const row1Input = document.getElementById('lcd-row1-input');
  const row2Input = document.getElementById('lcd-row2-input');
  const row1Count = document.getElementById('lcd-row1-count');
  const row2Count = document.getElementById('lcd-row2-count');
  const previewRow1 = document.getElementById('lcd-preview-row1');
  const previewRow2 = document.getElementById('lcd-preview-row2');

  const updatePreview = () => {
    const r1 = row1Input.value.slice(0, 16);
    const r2 = row2Input.value.slice(0, 16);

    row1Count.textContent = `${r1.length}/16`;
    row2Count.textContent = `${r2.length}/16`;

    previewRow1.textContent = r1.padEnd(16, ' ');
    previewRow2.textContent = r2.padEnd(16, ' ');
  };

  row1Input?.addEventListener('input', updatePreview);
  row2Input?.addEventListener('input', updatePreview);

  document.getElementById('lcd-update-btn')?.addEventListener('click', updateLcd);

  // Presets
  document.querySelectorAll('[data-lcd-preset]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const p = e.currentTarget.getAttribute('data-lcd-preset');
      if (p === 'welcome') {
        row1Input.value = 'Welcome to';
        row2Input.value = 'Madmax IoT System';
      } else if (p === 'temp') {
        row1Input.value = `Temp: ${state.latestData.temperature}°C`;
        row2Input.value = `Hum:  ${state.latestData.humidity}%`;
      } else if (p === 'dalinderz') {
        row1Input.value = 'Madmax Project';
        row2Input.value = 'By Dalinderz';
      }
      updatePreview();
    });
  });
}

async function fetchLcdData() {
  try {
    const data = await api.request('/api/lcd');
    const row1Input = document.getElementById('lcd-row1-input');
    const row2Input = document.getElementById('lcd-row2-input');
    const previewRow1 = document.getElementById('lcd-preview-row1');
    const previewRow2 = document.getElementById('lcd-preview-row2');
    const lastUpdatedEl = document.getElementById('lcd-last-updated');

    if (row1Input) row1Input.value = data.row1 || '';
    if (row2Input) row2Input.value = data.row2 || '';

    if (previewRow1) previewRow1.textContent = (data.row1 || '').slice(0, 16).padEnd(16, ' ');
    if (previewRow2) previewRow2.textContent = (data.row2 || '').slice(0, 16).padEnd(16, ' ');

    document.getElementById('lcd-row1-count').textContent = `${(data.row1 || '').length}/16`;
    document.getElementById('lcd-row2-count').textContent = `${(data.row2 || '').length}/16`;

    if (lastUpdatedEl) lastUpdatedEl.textContent = `Last synchronized: ${data.lastUpdated}`;
  } catch (err) {
    console.error('Failed to load LCD data', err);
  }
}

async function updateLcd() {
  const row1 = document.getElementById('lcd-row1-input').value.slice(0, 16);
  const row2 = document.getElementById('lcd-row2-input').value.slice(0, 16);

  try {
    const btn = document.getElementById('lcd-update-btn');
    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin"></i> Updating LCD...`;
    lucide.createIcons();

    const data = await api.request('/api/lcd', {
      method: 'POST',
      body: { row1, row2 }
    });

    showToast('LCD updated! ESP8266 will display this message.', 'success');
    document.getElementById('lcd-last-updated').textContent = `Last synchronized: Just now`;
  } catch (err) {
    showToast(err.message || 'Failed to update LCD', 'error');
  } finally {
    const btn = document.getElementById('lcd-update-btn');
    btn.disabled = false;
    btn.innerHTML = `<i data-lucide="send" class="w-4 h-4"></i> Update LCD Display`;
    lucide.createIcons();
  }
}

// ==========================================
// TAB 3: LED AUTOMATION (D0)
// ==========================================
function setupLedAutomation() {
  const toggleBtn = document.getElementById('led-toggle-btn');
  toggleBtn?.addEventListener('click', toggleLed);
}

async function fetchLedStatus(isBackground = false) {
  try {
    const data = await api.request('/api/led');
    state.ledStatus = data.status;
    renderLedUI(data.status, data.lastUpdated);
  } catch (err) {
    if (!isBackground) console.error('Failed to fetch LED status', err);
  }
}

function renderLedUI(status, lastUpdated) {
  const isOn = status === 'ON';
  const bulb = document.getElementById('led-bulb-visual');
  const statusText = document.getElementById('led-status-display');
  const toggleBtn = document.getElementById('led-toggle-btn');
  const toggleText = document.getElementById('led-toggle-btn-text');
  const pinBadge = document.getElementById('led-pin-badge');
  const lastUpdatedEl = document.getElementById('led-last-updated');

  if (isOn) {
    bulb?.classList.add('text-emerald-400', 'led-on-glow');
    bulb?.classList.remove('text-emerald-950/70');
    statusText.textContent = 'LED Status: ACTIVE (HIGH)';
    statusText.className = 'text-2xl font-extrabold text-emerald-300 font-mono tracking-wide';
    toggleText.textContent = 'Turn LED OFF';
    toggleBtn.className = 'w-full py-4 px-6 rounded-2xl font-bold flex items-center justify-center gap-3 transition-all transform hover:scale-[1.02] shadow-xl bg-gradient-to-r from-rose-600 to-red-700 text-white shadow-rose-950/50';
    pinBadge.textContent = 'Pin D0 (GPIO16): Output HIGH (3.3V)';
    pinBadge.className = 'text-xs font-mono px-3 py-1 rounded-full bg-emerald-900/60 text-emerald-300 border border-emerald-500/30';
  } else {
    bulb?.classList.remove('text-emerald-400', 'led-on-glow');
    bulb?.classList.add('text-emerald-950/70');
    statusText.textContent = 'LED Status: STANDBY (LOW)';
    statusText.className = 'text-2xl font-extrabold text-slate-400 font-mono tracking-wide';
    toggleText.textContent = 'Turn LED ON';
    toggleBtn.className = 'w-full py-4 px-6 rounded-2xl font-bold flex items-center justify-center gap-3 transition-all transform hover:scale-[1.02] shadow-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-emerald-950/50';
    pinBadge.textContent = 'Pin D0 (GPIO16): Output LOW (0V)';
    pinBadge.className = 'text-xs font-mono px-3 py-1 rounded-full bg-slate-900/60 text-slate-400 border border-slate-700/30';
  }

  if (lastUpdated && lastUpdatedEl) {
    lastUpdatedEl.textContent = `Last toggled: ${lastUpdated}`;
  }
}

async function toggleLed() {
  const newStatus = state.ledStatus === 'ON' ? 'OFF' : 'ON';

  try {
    const btn = document.getElementById('led-toggle-btn');
    btn.disabled = true;

    const data = await api.request('/api/led', {
      method: 'POST',
      body: { status: newStatus }
    });

    state.ledStatus = data.status;
    renderLedUI(data.status, 'Just now');
    showToast(`Command sent: LED turned ${data.status}!`, 'success');
  } catch (err) {
    showToast('Failed to toggle LED state', 'error');
  } finally {
    document.getElementById('led-toggle-btn').disabled = false;
  }
}

// ==========================================
// AUTH FORM SUBMISSIONS & EVENT LISTENERS
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  // Lucide Icons
  lucide.createIcons();

  // Auth toggle buttons (Login vs Register tabs)
  const authLoginTab = document.getElementById('auth-tab-login');
  const authRegTab = document.getElementById('auth-tab-register');
  const loginForm = document.getElementById('login-form');
  const regForm = document.getElementById('register-form');

  authLoginTab?.addEventListener('click', () => {
    authLoginTab.classList.add('bg-emerald-600', 'text-white');
    authLoginTab.classList.remove('text-emerald-300', 'hover:bg-emerald-950/40');
    authRegTab.classList.remove('bg-emerald-600', 'text-white');
    authRegTab.classList.add('text-emerald-300', 'hover:bg-emerald-950/40');
    loginForm.classList.remove('hidden');
    regForm.classList.add('hidden');
  });

  authRegTab?.addEventListener('click', () => {
    authRegTab.classList.add('bg-emerald-600', 'text-white');
    authRegTab.classList.remove('text-emerald-300', 'hover:bg-emerald-950/40');
    authLoginTab.classList.remove('bg-emerald-600', 'text-white');
    authLoginTab.classList.add('text-emerald-300', 'hover:bg-emerald-950/40');
    regForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
  });

  // Login Submit
  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    try {
      const data = await api.request('/api/auth/login', {
        method: 'POST',
        body: { email, password }
      });

      state.token = data.token;
      state.user = data.user;
      localStorage.setItem('madmax_token', data.token);
      showToast(`Welcome back, ${data.user.name}!`, 'success');
      showDashboardView();
    } catch (err) {
      showToast(err.message || 'Login failed', 'error');
    }
  });

  // Register Submit
  regForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;

    try {
      const data = await api.request('/api/auth/register', {
        method: 'POST',
        body: { name, email, password }
      });

      state.token = data.token;
      state.user = data.user;
      localStorage.setItem('madmax_token', data.token);
      showToast(`Account created! Welcome, ${data.user.name}!`, 'success');
      showDashboardView();
    } catch (err) {
      showToast(err.message || 'Registration failed', 'error');
    }
  });

  // Demo Login (One-click preview)
  document.getElementById('demo-login-btn')?.addEventListener('click', async () => {
    try {
      const data = await api.request('/api/auth/demo', { method: 'POST' });
      state.token = data.token;
      state.user = data.user;
      localStorage.setItem('madmax_token', data.token);
      showToast('Logged in as Nature Explorer (Demo)', 'success');
      showDashboardView();
    } catch (err) {
      showToast('Demo login failed', 'error');
    }
  });

  // Logout button
  document.getElementById('logout-btn')?.addEventListener('click', logout);

  // Quick Action buttons
  document.getElementById('simulate-data-btn')?.addEventListener('click', simulateReading);
  document.getElementById('export-csv-btn')?.addEventListener('click', exportCSV);
  document.getElementById('clear-records-btn')?.addEventListener('click', clearAllRecords);

  // Check initial authentication
  checkAuth();
});
