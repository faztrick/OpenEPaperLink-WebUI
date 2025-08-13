/**
 * @file storage.h
 * @brief Legacy Storage System - Minimal Compatibility Layer
 *
 * This file provides minimal backward compatibility for existing code.
 * New code should use json_config.h directly.
 *
 * @version 5.0 - Minimal Legacy Support
 */

#ifndef _DYN_STORAGE_H_
#define _DYN_STORAGE_H_

#include "json_config.h"

// Legacy compatibility class - minimal implementation
class DynStorage {
   public:
    DynStorage();
    void begin();
    void end();
    uint64_t freeSpace();

   private:
    bool isInited;
};

// Global instances for backward compatibility
extern DynStorage Storage;

// Re-export necessary globals from json_config
using ::contentFS;
using ::fsMutex;

#endif  // _DYN_STORAGE_H_
