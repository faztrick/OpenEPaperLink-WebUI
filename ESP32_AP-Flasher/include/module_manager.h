#ifndef MODULE_MANAGER_H
#define MODULE_MANAGER_H

#include <Arduino.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>

#include <functional>
#include <vector>

// Module types enumeration
enum class ModuleType {
    CORE,           // Core system modules
    HARDWARE,       // Hardware interface modules
    COMMUNICATION,  // Network/radio modules
    UI,             // User interface modules
    UTILITY,        // Helper/utility modules
    EXTENSION       // Third-party/plugin modules
};

// Module states enumeration
enum class ModuleState {
    UNINITIALIZED,
    INITIALIZING,
    INITIALIZED,
    ACTIVE,
    SUSPENDED,
    ERROR,
    MODULE_DISABLED
};

// Module capability flags
struct ModuleCapabilities {
    bool hasWebHandlers = false;
    bool hasTaskHandlers = false;
    bool hasEventHandlers = false;
    bool hasConfigInterface = false;
    bool hasStatusInterface = false;
    bool requiresHardware = false;
    bool isOptional = true;
};

// Module information structure
struct ModuleInfo {
    String name;
    String version;
    String description;
    ModuleType type;
    ModuleState state;
    ModuleCapabilities capabilities;
    uint32_t initTime;
    uint32_t lastActivity;
    String errorMessage;
};

// Module interface base class
class ModuleInterface {
   public:
    virtual ~ModuleInterface() = default;

    // Core module lifecycle
    virtual bool initialize() = 0;
    virtual bool start() = 0;
    virtual bool stop() = 0;
    virtual bool cleanup() = 0;

    // Module information
    virtual ModuleInfo getInfo() const = 0;
    virtual ModuleType getType() const = 0;
    virtual ModuleState getState() const = 0;
    virtual bool isHealthy() const = 0;

    // Optional interfaces
    virtual void registerWebHandlers(AsyncWebServer& server) {}
    virtual void handleEvent(const String& event, const String& data) {}
    virtual void update() {}
    virtual void suspend() {}
    virtual void resume() {}

    // Configuration interface
    virtual String getConfig() const { return "{}"; }
    virtual bool setConfig(const String& config) { return true; }
    virtual bool validateConfig(const String& config) const { return true; }

    // Status interface
    virtual String getStatus() const { return "{}"; }
    virtual void getMetrics(JsonObject& metrics) const {}
};

// Module manager class
class ModuleManager {
   public:
    struct RegisteredModule {
        std::unique_ptr<ModuleInterface> instance;
        ModuleInfo info;
        bool autoStart;
        std::vector<String> dependencies;
    };

   private:
    std::vector<RegisteredModule> modules;
    bool initialized = false;
    uint32_t startTime = 0;

   public:
    // Singleton pattern
    static ModuleManager& getInstance() {
        static ModuleManager instance;
        return instance;
    }

    // Module registration
    bool registerModule(std::unique_ptr<ModuleInterface> module,
                        bool autoStart = true,
                        const std::vector<String>& dependencies = {});

    // Module lifecycle management
    bool initializeAll();
    bool startAll();
    bool stopAll();
    bool cleanupAll();

    // Individual module control
    bool initializeModule(const String& name);
    bool startModule(const String& name);
    bool stopModule(const String& name);
    bool restartModule(const String& name);

    // Module discovery and information
    std::vector<String> getModuleNames() const;
    ModuleInfo getModuleInfo(const String& name) const;
    std::vector<ModuleInfo> getAllModuleInfo() const;

    // Health and diagnostics
    bool isModuleHealthy(const String& name) const;
    std::vector<String> getUnhealthyModules() const;
    String getDiagnostics() const;

    // Module instance access (for advanced use cases)
    ModuleInterface* getModuleInstance(const String& name) const;
    ModuleInterface* getModule(const String& name) const { return getModuleInstance(name); }
    const std::vector<RegisteredModule>& getModules() const { return modules; }
    bool isSystemHealthy() const;

    // Web interface
    void registerAllWebHandlers(AsyncWebServer& server);
    void setupModuleManagementAPI(AsyncWebServer& server);

    // Event system
    void broadcastEvent(const String& event, const String& data);

    // Update and maintenance
    void updateAll();
    void suspendAll();
    void resumeAll();

    // Configuration management
    String getSystemConfig() const;
    bool setSystemConfig(const String& config);
    bool saveConfig() const;
    bool loadConfig();

    // Statistics and monitoring
    uint32_t getUptime() const;
    size_t getModuleCount() const;
    size_t getActiveModuleCount() const;

   private:
    // Internal helper methods
    std::vector<RegisteredModule>::iterator findModule(const String& name);
    std::vector<RegisteredModule>::const_iterator findModule(const String& name) const;
    bool resolveDependencies();
    void updateModuleActivity(const String& name);
    void logModuleEvent(const String& name, const String& event, const String& details = "");
};

// Global module manager instance
extern ModuleManager moduleManager;

// Convenience macros for module development
#define DECLARE_MODULE(className) \
    class className : public ModuleInterface

#define REGISTER_MODULE(className, autoStart, ...)                        \
    do {                                                                  \
        auto module = std::make_unique<className>();                      \
        std::vector<String> deps = {__VA_ARGS__};                         \
        moduleManager.registerModule(std::move(module), autoStart, deps); \
    } while (0)

#define MODULE_LOG(name, message) \
    Serial.printf("[MODULE:%s] %s\n", name.c_str(), message.c_str())

#endif  // MODULE_MANAGER_H
