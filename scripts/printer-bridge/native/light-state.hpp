#pragma once
#include <nlohmann/json.hpp>
#include <optional>
#include <regex>
#include <string>

// Only a printer status report proves the light state. An echoed ledctrl
// command or successful publish receipt is not a state confirmation.
inline std::optional<bool> chamberLightState(const nlohmann::json& message) {
    if (!message.is_object() || !message.contains("print")) return std::nullopt;
    const auto& status = message["print"];
    if (!status.is_object()) return std::nullopt;
    // Studio's newer H-series status format encodes chamber light in cfg bit 7.
    if (status.contains("cfg") && status["cfg"].is_string()
        && status.contains("fun") && status.contains("aux") && status.contains("stat")) {
        auto cfg = status["cfg"].get<std::string>();
        if (std::regex_match(cfg, std::regex("[0-9a-fA-F]{1,16}")))
            return (std::stoull(cfg, nullptr, 16) & 0x80) != 0;
    }
    if (status.contains("lights_report") && status["lights_report"].is_array()) {
        for (const auto& light : status["lights_report"]) {
            if (!light.is_object() || !light.contains("node") || light["node"] != "chamber_light") continue;
            if (!light.contains("mode") || !light["mode"].is_string()) return std::nullopt;
            return light["mode"] == "on";
        }
    }
    return std::nullopt;
}

inline std::string lightOnCommand(const std::string& node, const std::string& sequence) {
    return nlohmann::json({{"system", {{"command", "ledctrl"}, {"sequence_id", sequence},
        {"led_node", node}, {"led_mode", "on"}, {"led_on_time", 500},
        {"led_off_time", 500}, {"loop_times", 0}, {"interval_time", 0}}}}).dump();
}
