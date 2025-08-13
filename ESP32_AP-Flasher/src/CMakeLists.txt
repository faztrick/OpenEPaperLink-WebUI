# ESP32 AP-Flasher CMakeLists.txt
# Optimized build configuration

# Collect all source files
FILE(GLOB_RECURSE app_sources
    ${CMAKE_SOURCE_DIR}/src/*.cpp
    ${CMAKE_SOURCE_DIR}/src/*.c
)

# Exclude backup files and temporary files
list(FILTER app_sources EXCLUDE REGEX ".*backup.*")
list(FILTER app_sources EXCLUDE REGEX ".*temp.*")
list(FILTER app_sources EXCLUDE REGEX ".*\\.old")

# Include directories
set(app_includes
    ${CMAKE_SOURCE_DIR}/include
    ${CMAKE_SOURCE_DIR}/src
    ${CMAKE_SOURCE_DIR}/src/g5
)

# Register component with optimized settings
idf_component_register(
    SRCS ${app_sources}
    INCLUDE_DIRS ${app_includes}
    REQUIRES
        esp_common
        esp_wifi
        esp_http_server
        esp_https_server
        nvs_flash
        spiffs
        fatfs
        json
        driver
        esp_timer
        esp_netif
        esp_eth
        mbedtls
        esp_tls
        esp_websocket_client
        freertos
        spi_flash
        app_update
        bootloader_support
)
