/**
 * ============================================================================
 * Project: Madmax IoT Environmental Platform
 * Designed and Developed by: Dalinderz
 * 
 * Hardware Setup:
 * - Microcontroller: ESP8266 (NodeMCU / Wemos D1 Mini / ESP-12E)
 * - Sensor: DHT11 connected to Pin D4 (GPIO2)
 * - LED: Connected to Pin D0 (GPIO16)
 * - LCD 16x2 I2C: D1 (SCL / GPIO5), D2 (SDA / GPIO4)
 *   Standard I2C Address: 0x27 (or 0x3F)
 * 
 * Network Configuration:
 * - WiFi SSID: SPIDERMAN
 * - WiFi Password: 000000000
 * 
 * Required Arduino Libraries (Install via Arduino Library Manager):
 * 1. "DHT sensor library" by Adafruit (plus Adafruit Unified Sensor dependency)
 * 2. "LiquidCrystal I2C" by Frank de Brabander or Marco Schwartz
 * 3. "ArduinoJson" (v6 or v7) by Benoit Blanchon
 * 4. "ESP8266WiFi" & "ESP8266HTTPClient" (Built-in with ESP8266 board package)
 * ============================================================================
 */

#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>
#include <WiFiClientSecure.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <DHT.h>
#include <ArduinoJson.h>

// ==========================================
// 1. PIN DEFINITIONS & HARDWARE CONFIG
// ==========================================
#define DHTPIN D4         // DHT11 Data Pin connected to D4 (GPIO2)
#define DHTTYPE DHT11     // DHT 11 sensor model

#define LED_PIN D0        // LED Pin connected to D0 (GPIO16)

// LCD 16x2 I2C Configuration (SCL -> D1, SDA -> D2)
// Change 0x27 to 0x3F if your I2C module uses address 0x3F
#define LCD_I2C_ADDR 0x27 
#define LCD_COLS 16
#define LCD_ROWS 2

// Initialize Hardware Objects
DHT dht(DHTPIN, DHTTYPE);
LiquidCrystal_I2C lcd(LCD_I2C_ADDR, LCD_COLS, LCD_ROWS);

// ==========================================
// 2. NETWORK & SERVER SETTINGS
// ==========================================
const char* ssid     = "SPIDERMAN";
const char* password = "000000000";

/**
 * SERVER CONFIGURATION:
 * 
 * A) Local Testing (On same WiFi network as your PC):
 *    Example: "http://192.168.1.100:3000/api/device/sync"
 *    (Replace 192.168.1.100 with your computer's local IPv4 address)
 * 
 * B) Render Production Cloud Deployment:
 *    Example: "https://your-madmax-app.onrender.com/api/device/sync"
 */
const char* serverUrl = "http://192.168.1.100:3000/api/device/sync";

// Polling interval: Every 10 seconds as specified in requirements
const unsigned long SYNC_INTERVAL = 10000; 
unsigned long lastSyncTime = 0;

// Cached LCD lines to prevent flickering
String currentLcdRow1 = "";
String currentLcdRow2 = "";

// ==========================================
// 3. LCD HELPER FUNCTIONS
// ==========================================
void updateDisplay(String row1, String row2) {
  // Pad or trim strings to exactly 16 characters
  while (row1.length() < 16) row1 += " ";
  while (row2.length() < 16) row2 += " ";
  row1 = row1.substring(0, 16);
  row2 = row2.substring(0, 16);

  // Only update if text has changed to prevent screen flicker
  if (row1 != currentLcdRow1 || row2 != currentLcdRow2) {
    currentLcdRow1 = row1;
    currentLcdRow2 = row2;
    
    lcd.setCursor(0, 0);
    lcd.print(currentLcdRow1);
    
    lcd.setCursor(0, 1);
    lcd.print(currentLcdRow2);
  }
}

// ==========================================
// 4. WIFI CONNECTION
// ==========================================
void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  Serial.println();
  Serial.print("[WiFi] Connecting to: ");
  Serial.println(ssid);

  updateDisplay("Connecting WiFi", ssid);

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi] Connected Successfully!");
    Serial.print("[WiFi] IP Address: ");
    Serial.println(WiFi.localIP());
    updateDisplay("WiFi Connected", WiFi.localIP().toString());
    delay(1500);
  } else {
    Serial.println("\n[WiFi] Connection Failed! Retrying in loop...");
    updateDisplay("WiFi Error", "Retrying...");
  }
}

// ==========================================
// 5. SETUP
// ==========================================
void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println("\n============================================");
  Serial.println("🌿 MADMAX IoT System Firmware");
  Serial.println("Designed and Developed by Dalinderz");
  Serial.println("============================================");

  // Initialize LED Pin
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW); // Start with LED OFF

  // Initialize I2C Bus for ESP8266 (D2=SDA, D1=SCL)
  Wire.begin(D2, D1);

  // Initialize LCD
  lcd.init();
  lcd.backlight();
  lcd.clear();
  updateDisplay("Madmax IoT", "Starting up...");

  // Initialize DHT11
  dht.begin();

  // Connect to WiFi
  connectWiFi();

  updateDisplay("Madmax System", "Ready & Online");
}

// ==========================================
// 6. MAIN LOOP
// ==========================================
void loop() {
  // Ensure WiFi remains connected
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  unsigned long currentMillis = millis();

  // Execute sync cycle every 10 seconds
  if (currentMillis - lastSyncTime >= SYNC_INTERVAL || lastSyncTime == 0) {
    lastSyncTime = currentMillis;
    syncWithServer();
  }

  // Small delay for watchdog timer stability
  delay(50);
}

// ==========================================
// 7. SENSOR READING & SERVER SYNC
// ==========================================
void syncWithServer() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[Sync] Skipping: No WiFi connection");
    return;
  }

  // 1. Read DHT11 Sensor Data
  float humidity = dht.readHumidity();
  float temperature = dht.readTemperature(); // Celsius

  if (isnan(humidity) || isnan(temperature)) {
    Serial.println("[DHT11] Warning: Failed to read from DHT11 sensor! Using previous values or default.");
    temperature = 26.5; // Fallback fallback values
    humidity = 55.0;
  } else {
    Serial.print("[DHT11] Temp: ");
    Serial.print(temperature);
    Serial.print(" °C | Humidity: ");
    Serial.print(humidity);
    Serial.println(" %");
  }

  // 2. Build JSON Request Payload
  StaticJsonDocument<256> reqDoc;
  reqDoc["temperature"] = temperature;
  reqDoc["humidity"] = humidity;

  String requestJson;
  serializeJson(reqDoc, requestJson);

  // 3. Send HTTP / HTTPS Request to Backend Server
  HTTPClient http;
  bool isHttps = String(serverUrl).startsWith("https://");

  if (isHttps) {
    WiFiClientSecure secureClient;
    secureClient.setInsecure(); // Allows connecting to Render HTTPS without SSL cert bundle
    http.begin(secureClient, serverUrl);
  } else {
    WiFiClient client;
    http.begin(client, serverUrl);
  }

  http.addHeader("Content-Type", "application/json");

  Serial.print("[Sync] Sending data to: ");
  Serial.println(serverUrl);

  int httpCode = http.POST(requestJson);

  if (httpCode > 0) {
    String response = http.getString();
    Serial.print("[Sync] Server Response (");
    Serial.print(httpCode);
    Serial.println("):");
    Serial.println(response);

    if (httpCode == HTTP_CODE_OK || httpCode == HTTP_CODE_CREATED) {
      // 4. Parse Server Response JSON
      StaticJsonDocument<512> resDoc;
      DeserializationError err = deserializeJson(resDoc, response);

      if (!err) {
        // A) Process LED Automation Command
        const char* ledCmd = resDoc["led"];
        if (ledCmd != nullptr) {
          if (String(ledCmd) == "ON") {
            digitalWrite(LED_PIN, HIGH);
            Serial.println("[LED] State: HIGH (ON)");
          } else {
            digitalWrite(LED_PIN, LOW);
            Serial.println("[LED] State: LOW (OFF)");
          }
        }

        // B) Process Smart LCD Display Text
        JsonObject lcdObj = resDoc["lcd"];
        if (!lcdObj.isNull()) {
          const char* row1 = lcdObj["row1"];
          const char* row2 = lcdObj["row2"];
          
          String r1 = (row1 != nullptr) ? String(row1) : "Madmax IoT";
          String r2 = (row2 != nullptr) ? String(row2) : "Ready";
          
          updateDisplay(r1, r2);
          Serial.println("[LCD] Updated display content");
        }
      } else {
        Serial.print("[Sync] JSON Parse Error: ");
        Serial.println(err.c_str());
      }
    }
  } else {
    Serial.print("[Sync] HTTP POST Failed. Error: ");
    Serial.println(http.errorToString(httpCode).c_str());
  }

  http.end();
}
