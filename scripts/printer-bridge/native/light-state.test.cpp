#include "light-state.hpp"
#include <cassert>
using nlohmann::json;
int main() {
    // A command/ack alone and unrelated lamps cannot confirm illumination.
    assert(!chamberLightState(json::parse(lightOnCommand("chamber_light", "1"))).has_value());
    assert(!chamberLightState(json::parse(R"({"system":{"command":"ledctrl","result":"SUCCESS"}})")).has_value());
    assert(!chamberLightState(json::parse(R"({"print":{"lights_report":[{"node":"work_light","mode":"on"}]}})")).has_value());
    assert(!chamberLightState(json::parse(R"({"print":{"lights_report":"on"}})")).has_value());
    assert(chamberLightState(json::parse(R"({"print":{"lights_report":[{"node":"chamber_light","mode":"on"}]}})")) == true);
    assert(chamberLightState(json::parse(R"({"print":{"lights_report":[{"node":"chamber_light","mode":"off"}]}})")) == false);
    assert(chamberLightState(json::parse(R"({"print":{"lights_report":[{"node":"chamber_light","mode":"flashing"}]}})")) == false);
    // A later off report invalidates an earlier on report.
    auto state = chamberLightState(json::parse(R"({"print":{"lights_report":[{"node":"chamber_light","mode":"on"}]}})"));
    state = chamberLightState(json::parse(R"({"print":{"lights_report":[{"node":"chamber_light","mode":"off"}]}})"));
    assert(state == false);
    assert(chamberLightState(json::parse(R"({"print":{"cfg":"0080","fun":"0","aux":"0","stat":"0"}})")) == true);
    assert(chamberLightState(json::parse(R"({"print":{"cfg":"0000","fun":"0","aux":"0","stat":"0"}})")) == false);
    assert(!chamberLightState(json::parse(R"({"print":{"cfg":"0080junk","fun":"0","aux":"0","stat":"0"}})")).has_value());
    assert(!chamberLightState(json::parse(R"({"print":{"cfg":"0080"}})")).has_value());
}
