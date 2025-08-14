// Minimal stub definitions to satisfy references from other modules when contentmanager is removed
#ifndef CONTENTMANAGER_STUB_DEFS_H
#define CONTENTMANAGER_STUB_DEFS_H

#include <Arduino.h>

#include "tag_db.h"

// EPD LUT constants (define only if not already defined as macros elsewhere)
#ifndef EPD_LUT_NO_REPEATS
constexpr int EPD_LUT_NO_REPEATS = 0;
#endif
#ifndef EPD_LUT_FAST_NO_REDS
constexpr int EPD_LUT_FAST_NO_REDS = 1;
#endif
#ifndef EPD_LUT_FAST
constexpr int EPD_LUT_FAST = 2;
#endif
#ifndef EPD_LUT_DEFAULT
constexpr int EPD_LUT_DEFAULT = 3;
#endif

// Data type constants used in contentmanager (guarded)
#ifndef DATATYPE_IMG_RAW_1BPP
constexpr int DATATYPE_IMG_RAW_1BPP = 1;
#endif
#ifndef DATATYPE_IMG_RAW_2BPP
constexpr int DATATYPE_IMG_RAW_2BPP = 2;
#endif
#ifndef DATATYPE_IMG_RAW_3BPP
constexpr int DATATYPE_IMG_RAW_3BPP = 3;
#endif
#ifndef DATATYPE_IMG_RAW_4BPP
constexpr int DATATYPE_IMG_RAW_4BPP = 4;
#endif
#ifndef DATATYPE_IMG_ZLIB
constexpr int DATATYPE_IMG_ZLIB = 5;
#endif
#ifndef DATATYPE_IMG_G5
constexpr int DATATYPE_IMG_G5 = 6;
#endif
#ifndef DATATYPE_FW_UPDATE
constexpr int DATATYPE_FW_UPDATE = 100;
#endif

// SHORTLUT constants (guard macros from other headers)
#ifndef SHORTLUT_DISABLED
constexpr int SHORTLUT_DISABLED = 0;
#endif
#ifndef SHORTLUT_ONLY_BLACK
constexpr int SHORTLUT_ONLY_BLACK = 1;
#endif

// NOTE: util functions, contentFS, and logging helpers are defined elsewhere in the project
// to avoid duplicate symbol/macro conflicts. Only declare externs here if they are not
// already provided by other headers.

// contentFS is provided by the main project; declare if missing.
#ifndef CONTENTFS_EXTERN_DECLARED
extern fs::FS *contentFS;
#endif

// Provide minimal wsErr/wsLog only if not already defined
#ifndef WSLOG_DEFINED
inline void wsErr(const String &s) { (void)s; }
inline void wsLog(const String &s) { (void)s; }
#endif

#endif  // CONTENTMANAGER_STUB_DEFS_H
