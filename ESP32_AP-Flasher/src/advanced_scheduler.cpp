#ifdef USE_TASK_SCHEDULER
#include <TaskScheduler.h>

// Global scheduler instance
Scheduler scheduler;

// Task definitions
Task taskHeartbeat(5000, TASK_FOREVER, &heartbeatCallback);
Task taskSensorRead(30000, TASK_FOREVER, &sensorReadCallback);
Task taskNetworkCheck(60000, TASK_FOREVER, &networkCheckCallback);

void setupTaskScheduler() {
    scheduler.init();
    scheduler.addTask(taskHeartbeat);
    scheduler.addTask(taskSensorRead);
    scheduler.addTask(taskNetworkCheck);
    
    taskHeartbeat.enable();
    taskSensorRead.enable();
    taskNetworkCheck.enable();
}

void heartbeatCallback() {
    Serial.println("💓 System heartbeat");
    // LED blink or status update
}

void sensorReadCallback() {
    // Read sensors, update database
    Serial.println("📊 Reading sensors");
}

void networkCheckCallback() {
    // Check network connectivity
    Serial.println("🌐 Network health check");
}
#endif
