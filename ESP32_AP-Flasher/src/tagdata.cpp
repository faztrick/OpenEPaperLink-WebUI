/**
 * @file tagdata.cpp
 * @brief Custom tag data parser implementation
 * @author Moritz Wirger (contact@wirmo.de)
 */

#ifndef SAVE_SPACE

#include "tagdata.h"

#include "core_utilities.h"
#include "json_config.h"

namespace TagData {

// Global parser map
std::unordered_map<size_t, Parser> parsers;

void loadParsers(const String& filename) {
    // Initialize parsers map if empty
    if (!parsers.empty()) {
        parsers.clear();
    }

    // Check if the file exists using the modern file manager
    if (!FileManager::exists(filename)) {
        LogUtils::logInfo("[TagData] Parser file not found: " + filename);
        return;
    }

    // Load JSON content using the modern file manager
    String jsonString = FileManager::readText(filename);
    if (jsonString.isEmpty()) {
        LogUtils::logError("[TagData] Failed to read parser file: " + filename);
        return;
    }

    // Use heap allocation instead of stack for large JSON
    DynamicJsonDocument* doc = new DynamicJsonDocument(8192);
    if (!doc) {
        LogUtils::logError("[TagData] Failed to allocate memory for JSON parsing");
        return;
    }

    DeserializationError error = deserializeJson(*doc, jsonString);

    if (error) {
        LogUtils::logError("[TagData] Failed to parse JSON: " + String(error.c_str()));
        delete doc;
        return;
    }

    // Parse the JSON structure and populate parsers
    if (doc->is<JsonArray>()) {
        JsonArray parsersArray = doc->as<JsonArray>();
        for (JsonObject parserObj : parsersArray) {
            if (parserObj.containsKey("id") && parserObj.containsKey("name")) {
                size_t id = parserObj["id"];
                Parser parser;
                parser.name = parserObj["name"].as<String>();

                if (parserObj.containsKey("fields")) {
                    JsonArray fieldsArray = parserObj["fields"];
                    for (JsonObject fieldObj : fieldsArray) {
                        String name = fieldObj["name"];
                        String typeStr = fieldObj["type"];
                        uint8_t length = fieldObj["length"];
                        uint8_t decimals = fieldObj.containsKey("decimals") ? fieldObj["decimals"] : 0;

                        Type type = Type::STRING;
                        if (typeStr == "INT")
                            type = Type::INT;
                        else if (typeStr == "UINT")
                            type = Type::UINT;
                        else if (typeStr == "FLOAT")
                            type = Type::FLOAT;

                        std::optional<double> mult = std::nullopt;
                        if (fieldObj.containsKey("mult")) {
                            mult = fieldObj["mult"].as<double>();
                        }

                        parser.fields.emplace_back(name, type, length, decimals, mult);
                    }
                }

                parsers[id] = std::move(parser);
            }
        }
    }

    LogUtils::logInfo("[TagData] Loaded " + String(parsers.size()) + " parsers");
    delete doc;  // Clean up heap allocation
}

void parse(const uint8_t src[8], const size_t id, const uint8_t* data, const uint8_t len) {
    auto it = parsers.find(id);
    if (it == parsers.end()) {
        // No parser found for this ID, just ignore silently
        return;
    }

    const Parser& parser = it->second;

    // Create JSON document on heap to avoid stack overflow
    DynamicJsonDocument* doc = new DynamicJsonDocument(1024);
    if (!doc) {
        LogUtils::logError("[TagData] Failed to allocate memory for parsing");
        return;
    }

    JsonObject root = doc->to<JsonObject>();

    // Add metadata
    root["parser_id"] = id;
    root["parser_name"] = parser.name;

    // Add source MAC
    String macStr = "";
    for (int i = 0; i < 8; i++) {
        if (i > 0) macStr += ":";
        macStr += String(src[i], HEX);
    }
    root["src_mac"] = macStr;

    // Parse fields
    size_t offset = 0;
    JsonObject fields = root.createNestedObject("fields");

    for (const auto& field : parser.fields) {
        if (offset + field.length > len) {
            break;  // Not enough data
        }

        switch (field.type) {
            case Type::INT: {
                if (field.length <= 4) {
                    int32_t value = bytesTo<int32_t>(data + offset, field.length);
                    if (field.mult.has_value()) {
                        value = static_cast<int32_t>(value * field.mult.value());
                    }
                    fields[field.name] = value;
                }
                break;
            }
            case Type::UINT: {
                if (field.length <= 4) {
                    uint32_t value = bytesTo<uint32_t>(data + offset, field.length);
                    if (field.mult.has_value()) {
                        value = static_cast<uint32_t>(value * field.mult.value());
                    }
                    fields[field.name] = value;
                }
                break;
            }
            case Type::FLOAT: {
                if (field.length == 4) {
                    float value = bytesTo<float>(data + offset, field.length);
                    if (field.mult.has_value()) {
                        value *= field.mult.value();
                    }
                    fields[field.name] = value;
                }
                break;
            }
            case Type::STRING: {
                String value = bytesTo<String>(data + offset, field.length);
                fields[field.name] = value;
                break;
            }
            default:
                break;
        }

        offset += field.length;
    }

    // Send parsed data via WebSocket (if web system is available)
    String jsonOutput;
    serializeJson(*doc, jsonOutput);

    // You could send this to the web interface or store it somewhere
    LogUtils::logInfo("[TagData] Parsed: " + jsonOutput);

    delete doc;  // Clean up heap allocation
}

}  // namespace TagData

#endif
