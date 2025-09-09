// Project UDP wrapper header (distinct from Arduino core Udp.h)
#ifndef OEPL_OEPL_UDP_H
#define OEPL_OEPL_UDP_H

#include <Arduino.h>
#include "AsyncUDP.h"
#include "tag_db.h"

extern Config config;

class UDPcomm
{
public:
  UDPcomm();
  ~UDPcomm();
  void init();
  void getAPList();
  void netProcessDataReq(struct espAvailDataReq *eadr);
  void netProcessXferComplete(struct espXferComplete *xfc);
  void netProcessXferTimeout(struct espXferComplete *xfc);
  void netSendDataAvail(struct pendingData *pending);
  void netTaginfo(struct TagInfo *taginfoitem);

private:
  AsyncUDP udp;
  void processPacket(AsyncUDPPacket packet);
  void writeUdpPacket(uint8_t *buffer, uint16_t len, IPAddress senderIP);
};

#endif // OEPL_OEPL_UDP_H

void init_udp();
