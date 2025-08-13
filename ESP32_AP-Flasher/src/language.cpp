/**
 * @file language.cpp
 * @brief Language support for ESP32 AP-Flasher
 */

#include "language.h"

#include <Preferences.h>

#include "storage.h"

// Default language arrays (English)
String languageDaysShort[7] = {"Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"};
String languageDays[7] = {"Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"};
String languageMonth[12] = {"January", "February", "March", "April", "May", "June",
                            "July", "August", "September", "October", "November", "December"};
String languageDateFormat[5] = {"%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d.%m.%Y", "%Y年%m月%d日"};

void updateLanguageFromConfig() {
    // This function would typically load language settings from configuration
    // For now, we'll keep the default English values

    // Example implementation that could be extended:
    Preferences prefs;
    if (prefs.begin("language", true)) {
        String langCode = prefs.getString("code", "en");
        prefs.end();

        // Could load different language arrays based on langCode
        // For now, keep defaults
    }
}
