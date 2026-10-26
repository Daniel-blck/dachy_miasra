// LOLIN/Wemos D1 Mini ESP8266 + INA219 + optional SSD1306 128x64 I2C.
// Power the D1 Mini from USB. Both I2C modules must use 3.3 V logic.
// SDA = D2/GPIO4, SCL = D1/GPIO5. Never connect the panel to a GPIO.
#include <ESP8266WiFi.h>
#include <Wire.h>
#include <Adafruit_INA219.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <math.h>

constexpr uint8_t SDA_PIN = 4;
constexpr uint8_t SCL_PIN = 5;
constexpr uint8_t INA_ADDRESS = 0x40;
constexpr uint32_t SAMPLE_INTERVAL_MS = 1000;
constexpr uint32_t MAX_ENERGY_INTERVAL_MS = 3000;

Adafruit_INA219 meter(INA_ADDRESS);
Adafruit_SSD1306 display(128, 64, &Wire, -1, 100000, 100000);
bool displayReady = false;
bool meterReady = false;
bool previousValid = false;
uint32_t lastSampleAt = 0;
uint32_t previousAt = 0;
float previousPowerW = 0;
double energyWh = 0;

bool devicePresent(uint8_t address) {
  Wire.beginTransmission(address);
  return Wire.endTransmission() == 0;
}

void showMessage(const __FlashStringHelper *first, const __FlashStringHelper *second) {
  if (!displayReady) return;
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println(first);
  display.setCursor(0, 18);
  display.println(second);
  display.display();
}

void setup() {
  Serial.begin(115200);
  WiFi.persistent(false);
  WiFi.mode(WIFI_OFF); // USB-only demonstration; no network credentials.
  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(100000);

  const uint8_t oledAddress = devicePresent(0x3C) ? 0x3C : devicePresent(0x3D) ? 0x3D : 0;
  if (oledAddress) {
    // Wire is already configured, so do not reinitialize its pins.
    displayReady = display.begin(SSD1306_SWITCHCAPVCC, oledAddress, false, false);
  }

  meterReady = meter.begin(&Wire);
  if (meterReady) {
    // This calibration assumes the INA219 board has a 0.1-ohm (R100) shunt.
    meter.setCalibration_32V_2A();
    showMessage(F("PV bench / USB"), F("Waiting for readings"));
  } else {
    showMessage(F("INA219 not found"), F("Check 3V3, SDA, SCL"));
  }
}

void loop() {
  const uint32_t now = millis();
  if (static_cast<uint32_t>(now - lastSampleAt) < SAMPLE_INTERVAL_MS) {
    delay(5);
    return;
  }
  lastSampleAt = now;

  if (!meterReady || !devicePresent(INA_ADDRESS)) {
    previousValid = false;
    Serial.println(F("{\"error\":\"INA219-not-found\"}"));
    showMessage(F("INA219 unavailable"), F("Check wiring; reset"));
    return;
  }

  // INA219 bus voltage is measured at VIN-: the external load voltage.
  const float voltageV = meter.getBusVoltage_V();
  const float currentA = meter.getCurrent_mA() / 1000.0f;
  if (!isfinite(voltageV) || !isfinite(currentA) || voltageV < 0 || voltageV > 26 || currentA < 0 || currentA > 3.2f) {
    previousValid = false;
    Serial.println(F("{\"error\":\"invalid-or-reversed-reading\"}"));
    showMessage(F("Invalid measurement"), F("Check VIN+ / VIN-"));
    return;
  }

  const float powerW = voltageV * currentA;
  const uint32_t elapsed = static_cast<uint32_t>(now - previousAt);
  if (previousValid && elapsed <= MAX_ENERGY_INTERVAL_MS) {
    energyWh += (previousPowerW + powerW) * 0.5 * elapsed / 3600000.0;
  }
  previousValid = true;
  previousAt = now;
  previousPowerW = powerW;

  Serial.print(F("{\"voltageV\":"));
  Serial.print(voltageV, 4);
  Serial.print(F(",\"currentA\":"));
  Serial.print(currentA, 6);
  Serial.println('}');

  if (displayReady) {
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(1);
    display.setCursor(0, 0);
    display.println(F("PV bench / USB"));
    display.setCursor(0, 14);
    display.print(voltageV, 2);
    display.print(F(" V  "));
    display.print(currentA * 1000, 1);
    display.println(F(" mA"));
    display.setTextSize(2);
    display.setCursor(0, 30);
    display.print(powerW, 3);
    display.println(F(" W"));
    display.setTextSize(1);
    display.setCursor(0, 54);
    display.print(energyWh, 4);
    display.println(F(" Wh since reset"));
    display.display();
  }
}
