/**
 * @file storage.cpp
 * @brief Legacy Storage System - Minimal Compatibility Layer
 *
 * This file provides minimal backward compatibility for existing code.
 * New code should use json_config.h directly.
 *
 * @version 5.0 - Minimal Legacy Support
 */

#include "storage.h"

// ============================================================================
// Legacy DynStorage - Minimal Redirects to Modern System
// ============================================================================

DynStorage::DynStorage() : isInited(false) {}

uint64_t DynStorage::freeSpace() {
    return FileSystemManager::getFreeSpace();
}

void DynStorage::begin() {
    if (!isInited) {
        isInited = CONFIG.initialize();
    }
}

void DynStorage::end() {
    CONFIG.cleanup();
    isInited = false;
}

// Global storage instance for backward compatibility
DynStorage Storage;
