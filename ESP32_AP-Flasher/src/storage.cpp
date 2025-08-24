#include "storage.h"

#include <ArduinoJson.h>
#ifdef HAS_SDCARD
#include "FS.h"
#ifdef SD_CARD_SDMMC
#include "SD_MMC.h"
#define SDCARD SD_MMC
#else
#include "SD.h"
#include "SPI.h"
#define SDCARD SD
#endif
#endif

#ifndef SD_CARD_ONLY
#include "LittleFS.h"
#endif

// Track whether LittleFS mounted successfully so higher layers can skip bootstrap actions
static bool littlefs_mounted = false;

DynStorage::DynStorage() : isInited(0) {}

SemaphoreHandle_t fsMutex = NULL;

#ifndef SD_CARD_ONLY
static void initLittleFS()
{
    // Attempt to mount LittleFS; on failure try a one-time format+remount.
    static bool formatAttempted = false; // ensure we don't loop formatting repeatedly
    if (LittleFS.begin())
    {
        littlefs_mounted = true;
        contentFS = &LittleFS;
        return;
    }

    Serial.println("[FS][WARN] LittleFS.begin() failed – filesystem not mounted (will attempt recovery)");

    if (!formatAttempted)
    {
        formatAttempted = true;
        Serial.println("[FS][RECOVERY] Formatting LittleFS due to initial mount failure (possible corruption)");
        if (LittleFS.format())
        {
            Serial.println("[FS][RECOVERY] Format completed, retrying mount...");
            if (LittleFS.begin())
            {
                Serial.println("[FS][RECOVERY] LittleFS mount after format succeeded");
                littlefs_mounted = true;
                contentFS = &LittleFS;
                return;
            }
            else
            {
                Serial.println("[FS][ERROR] LittleFS mount still failing after format – filesystem unavailable");
            }
        }
        else
        {
            Serial.println("[FS][ERROR] LittleFS.format() failed – cannot recover filesystem");
        }
    }
    else
    {
        Serial.println("[FS][WARN] Skipping additional format attempt (already tried)");
    }

    // Still set pointer so higher layers can attempt lazy recovery / respond with proper status
    contentFS = &LittleFS; // pointer for callers; littlefs_mounted remains false
}
#endif

#ifdef HAS_SDCARD
static bool sd_init_done = false;
#ifdef SD_CARD_SDMMC
static void initSDCard()
{
    if (!SD_MMC.begin("/sdcard", true, true, BOARD_MAX_SDMMC_FREQ, 5))
    {
        Serial.println("Card Mount Failed");
        return;
    }
    uint8_t cardType = SD_MMC.cardType();

    if (cardType == CARD_NONE)
    {
        Serial.println("No SD_MMC card attached");
        return;
    }

    Serial.print("SD_MMC Card Type: ");
    if (cardType == CARD_MMC)
    {
        Serial.println("MMC");
    }
    else if (cardType == CARD_SD)
    {
        Serial.println("SDSC");
    }
    else if (cardType == CARD_SDHC)
    {
        Serial.println("SDHC");
    }
    else
    {
        Serial.println("UNKNOWN");
    }

    uint64_t cardSize = SD_MMC.cardSize() / (1024 * 1024);
    Serial.printf("SD_MMC Card Size: %lluMB\n", cardSize);

    contentFS = &SD_MMC;
}
#else
static SPIClass *spi;

static void initSDCard()
{
    uint8_t spi_bus = VSPI;

    // SD.begin and spi.begin are allocating memory so we dont want to do that
    if (!spi)
    {
        spi = new SPIClass(spi_bus);
        spi->begin(SD_CARD_CLK, SD_CARD_MISO, SD_CARD_MOSI, SD_CARD_SS);

        bool res = SD.begin(SD_CARD_SS, *spi, 40000000);
        if (!res)
        {
            Serial.println("Card Mount Failed");
            return;
        }
    }

    uint8_t cardType = SD.cardType();

    if (cardType == CARD_NONE)
    {
        Serial.println("No SD card attached");
        return;
    }

    contentFS = &SD;
}
#endif
#endif

uint64_t DynStorage::freeSpace()
{
    this->begin();
#ifdef HAS_SDCARD
    return SDCARD.totalBytes() - SDCARD.usedBytes();
#endif
#ifndef SD_CARD_ONLY
    return LittleFS.totalBytes() - LittleFS.usedBytes();
#endif
}

#ifndef SD_CARD_ONLY
void copyFile(File in, File out)
{
    Serial.print("Copying ");
    Serial.print(in.path());
    Serial.print(" to ");
    Serial.println(out.path());

    size_t n;
    uint8_t buf[64];
    while ((n = in.read(buf, sizeof(buf))) > 0)
    {
        out.write(buf, n);
    }
}

#ifdef HAS_SDCARD

void copyBetweenFS(FS &sourceFS, const char *source_path, FS &targetFS)
{
    File root = sourceFS.open(source_path);
    char next_path[128];

    if (root.isDirectory())
    {
        if (!contentFS->exists(root.path()))
        {
            if (!contentFS->mkdir(root.path()))
            {
                Serial.print("Failed to create directory ");
                Serial.println(root.path());
                return;
            }
        }
        File file = root.openNextFile();
        while (file)
        {
            if (file.isDirectory())
            {
                char next_path[256]; // Ensure adequate buffer size
                snprintf(next_path, sizeof(next_path), "%s/%s", root.path(), file.path());

                copyBetweenFS(sourceFS, file.path(), targetFS);
            }
            else
            {
                xSemaphoreTake(fsMutex, portMAX_DELAY);
                File target = contentFS->open(file.path(), "w");
                if (target)
                {
                    copyFile(file, target);
                    target.close();
                    file.close();
                    xSemaphoreGive(fsMutex);
                }
                else
                {
                    xSemaphoreGive(fsMutex);
                    Serial.print("Couldn't create high target file");
                    Serial.println(file.path());
                    return;
                }
            }
            file = root.openNextFile();
        }
    }
    else
    {
        xSemaphoreTake(fsMutex, portMAX_DELAY);
        File target = contentFS->open(root.path(), "w");
        if (target)
        {
            copyFile(root, target);
            target.close();
            xSemaphoreGive(fsMutex);
        }
        else
        {
            xSemaphoreGive(fsMutex);
            Serial.print("Couldn't create target file ");
            Serial.println(root.path());
            return;
        }
    }
}

void copyIfNeeded(const char *path)
{
    if (!contentFS->exists(path) && LittleFS.exists(path))
    {
        Serial.printf("SDCard does not contain %s, littleFS does, copying\r\n", path);
        copyBetweenFS(LittleFS, path, *contentFS);
    }
}
#endif
#endif

void DynStorage::begin()
{
    if (fsMutex == NULL)
    {
        fsMutex = xSemaphoreCreateMutex();
    }

#ifndef SD_CARD_ONLY
    initLittleFS();
    if (contentFS == &LittleFS)
    {
        uint64_t total = LittleFS.totalBytes();
        uint64_t used = LittleFS.usedBytes();
        Serial.printf("[FS] LittleFS mount OK (used %llu / %llu bytes, free %llu)\n",
                      (unsigned long long)used,
                      (unsigned long long)total,
                      (unsigned long long)(total - used));
    }
    else
    {
        Serial.println("[FS][WARN] LittleFS init did not set contentFS (using fallback) – subsequent open() may fail");
    }
#endif

#ifdef HAS_SDCARD
    if (!sd_init_done)
    {
        xSemaphoreTake(fsMutex, portMAX_DELAY);
        initSDCard();
        xSemaphoreGive(fsMutex);
        sd_init_done = true;
    }
#ifndef SD_CARD_ONLY
    copyIfNeeded("/index.html");
    copyIfNeeded("/fonts");
    copyIfNeeded("/www");
    copyIfNeeded("/tagtypes");
    copyIfNeeded("/AP_FW_Pack.bin");
    copyIfNeeded("/tag_md5_db.json");
    copyIfNeeded("/update_actions.json");
    copyIfNeeded("/content_template.json");
#endif
#endif

    // If LittleFS failed to mount earlier, contentFS points to LittleFS but operations will fail; guard directory creation.
    if (contentFS && littlefs_mounted)
    {
        if (!contentFS->exists("/current"))
        {
            contentFS->mkdir("/current");
            Serial.println("[FS] Created /current directory");
        }
        if (!contentFS->exists("/temp"))
        {
            contentFS->mkdir("/temp");
            Serial.println("[FS] Created /temp directory");
        }
    }
    else
    {
        Serial.println("[FS][WARN] Skipping directory bootstrap (/current,/temp) – filesystem not mounted");
    }

    // Ensure a minimal staconfig.json exists to avoid open() errors elsewhere (STA credentials)
    const char *staconfigPath = "/current/staconfig.json";
    if (contentFS && littlefs_mounted)
    {
        if (!contentFS->exists(staconfigPath))
        {
            xSemaphoreTake(fsMutex, portMAX_DELAY);
            File cfg = contentFS->open(staconfigPath, "w");
            if (cfg)
            {
                // Write a minimal JSON configuration for STA
                const char *defaultCfg = "{\"ssid\":\"\",\"password\":\"\"}";
                cfg.print(defaultCfg);
                cfg.close();
                Serial.println("Created default /current/staconfig.json");
            }
            else
            {
                Serial.println("Warning: Failed to create /current/staconfig.json — storage may be read-only");
            }
            xSemaphoreGive(fsMutex);
        }
    }
    else
    {
        Serial.println("[FS][WARN] Skipping staconfig bootstrap – filesystem not mounted");
    }

    // Maintain legacy/default AP/system config file for AP mode and other settings
    const char *apconfigPath = "/current/apconfig.json";
    if (contentFS && littlefs_mounted)
    {
        if (!contentFS->exists(apconfigPath))
        {
            xSemaphoreTake(fsMutex, portMAX_DELAY);
            File cfg = contentFS->open(apconfigPath, "w");
            if (cfg)
            {
                // Minimal AP/system config
                const char *defaultCfg = "{\"alias\":\"\",\"channel\":0}";
                cfg.print(defaultCfg);
                cfg.close();
                Serial.println("Created default /current/apconfig.json");
            }
            else
            {
                Serial.println("Warning: Failed to create /current/apconfig.json — storage may be read-only");
            }
            xSemaphoreGive(fsMutex);
        }
    }
    else
    {
        Serial.println("[FS][WARN] Skipping apconfig bootstrap – filesystem not mounted");
    }

    // Final summary after begin()
    if (contentFS)
    {
#ifdef HAS_SDCARD
        if (contentFS == &SDCARD)
        {
            Serial.println("[FS] Active contentFS: SD Card");
        }
#endif
#ifndef SD_CARD_ONLY
        if (contentFS == &LittleFS)
        {
            Serial.println("[FS] Active contentFS: LittleFS");
        }
#endif
    }
    else
    {
        Serial.println("[FS][ERROR] contentFS is null after DynStorage::begin – filesystem unavailable");
    }

    // Ensure a default empty tag database exists
    const char *tagdbPath = "/current/tagDB.json";
    if (contentFS && littlefs_mounted)
    {
        if (!contentFS->exists(tagdbPath))
        {
            xSemaphoreTake(fsMutex, portMAX_DELAY);
            File db = contentFS->open(tagdbPath, "w");
            if (db)
            {
                db.print("[]");
                db.close();
                Serial.println("Created default /current/tagDB.json (empty array)");
            }
            else
            {
                Serial.println("Warning: Failed to create /current/tagDB.json — storage may be read-only");
            }
            xSemaphoreGive(fsMutex);
        }
    }
    else
    {
        Serial.println("[FS][WARN] Skipping tagDB bootstrap – filesystem not mounted");
    }
}

void DynStorage::end()
{
#ifdef HAS_SDCARD
#ifndef SD_CARD_ONLY
    initLittleFS();
#endif
#ifdef SD_CARD_SDMMC
#ifndef SD_CARD_ONLY
    contentFS = &LittleFS;
#endif
    SD_MMC.end();
    sd_init_done = false;
#else
#ifndef SD_CARD_ONLY
    if (SD_CARD_CLK == FLASHER_AP_CLK ||
        SD_CARD_MISO == FLASHER_AP_MISO ||
        SD_CARD_MOSI == FLASHER_AP_MOSI)
    {
        Serial.println("Tearing down SD card connection");

        copyBetweenFS(*contentFS, "/tag_md5_db.json", LittleFS);
        copyBetweenFS(*contentFS, "/AP_FW_Pack.bin", LittleFS);
        if (contentFS->exists("/AP_force_flash.bin"))
        {
            copyBetweenFS(*contentFS, "/AP_force_flash.bin", LittleFS);
            contentFS->remove("/AP_force_flash.bin");
        }
        Serial.println("Swapping to LittleFS");

        contentFS = &LittleFS;
    }
#endif
#endif
#endif
}

fs::FS *contentFS;
DynStorage Storage;

// Simple write/delete test to validate filesystem health. Returns true on success.
bool fsHealthTest()
{
    if (!contentFS)
        return false;
    const char *path = "/current/.fs_health_probe";
    File f = contentFS->open(path, "w");
    if (!f)
        return false;
    f.print("probe");
    f.close();
    File r = contentFS->open(path, "r");
    if (!r)
    {
        contentFS->remove(path);
        return false;
    }
    String s = r.readString();
    r.close();
    contentFS->remove(path);
    return s == "probe";
}
