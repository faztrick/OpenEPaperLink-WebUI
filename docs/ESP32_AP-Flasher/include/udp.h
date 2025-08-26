// Shim header to avoid collision with Arduino core Udp.h on case-insensitive filesystems.
// Always defer to the next header named <Udp.h> found in the include search path (the Arduino core one).
#pragma once
#include_next <Udp.h>
