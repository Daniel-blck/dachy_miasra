// Arduino Nano/Uno (ATmega328P) + INA219; USB power for the controller.
// INA219 VIN- voltage is the voltage across the external demonstration load.
#include <Wire.h>
#include <Adafruit_INA219.h>
#include <math.h>

Adafruit_INA219 meter;

void setup() {
  Serial.begin(115200);
  if (!meter.begin()) {
    Serial.println("{\"error\":\"INA219-not-found\"}");
    while (true) { delay(1000); }
  }
  meter.setCalibration_32V_2A();
}

void loop() {
  const float voltageV = meter.getBusVoltage_V();
  const float currentA = meter.getCurrent_mA() / 1000.0;
  if (isfinite(voltageV) && isfinite(currentA) && voltageV >= 0 && currentA >= 0) {
    Serial.print("{\"voltageV\":");
    Serial.print(voltageV, 4);
    Serial.print(",\"currentA\":");
    Serial.print(currentA, 6);
    Serial.println("}");
  } else {
    // Do not convert reversed or invalid measurements into generated energy.
    Serial.println("{\"error\":\"invalid-or-reversed-reading\"}");
  }
  delay(1000);
}
