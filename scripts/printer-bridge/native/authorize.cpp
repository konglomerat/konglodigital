// Camera authorization and illumination using the original Bambu networking plugin.
#include "light-state.hpp"
#include <dlfcn.h>
#ifdef __APPLE__
#include <CoreFoundation/CoreFoundation.h>
#endif
#include <deque>
#include <unistd.h>
#include <sys/stat.h>
#include <iostream>
#include <fstream>
#include <string>
#include <vector>
#include <map>
#include <functional>
#include <thread>
#include <chrono>
#include <mutex>
#include <atomic>
#include <regex>
using namespace std::chrono_literals;
static std::mutex reportMutex, queueMutex;
static std::deque<std::function<void()>> callbacks;
void pump(){ std::deque<std::function<void()>> ready; {std::lock_guard<std::mutex> lock(queueMutex);ready.swap(callbacks);}for(auto& fn:ready)fn();
#ifdef __APPLE__
CFRunLoopRunInMode(kCFRunLoopDefaultMode,0.05,true);
std::this_thread::sleep_for(50ms);}
#else
std::this_thread::sleep_for(100ms);}
#endif
void report(const std::string& key, long long value) { std::lock_guard<std::mutex> lock(reportMutex); auto s=key+"="+std::to_string(value)+"\n"; write(3,s.data(),s.size()); }
void reportVersion(const std::string& value) { if(std::regex_match(value,std::regex("[0-9.]+"))) { auto s="network_version="+value+"\n"; write(3,s.data(),s.size()); } }
template<class T> T sym(void* lib,const char* name) { auto p=dlsym(lib,name);if(!p){report("missing_symbol",1);std::_Exit(10);}return reinterpret_cast<T>(p);}
struct StreamInfo {int type,sub_type;union {struct {int width,height,frame_rate;} video;struct {int sample_rate,channel_count,sample_size;} audio;} format; int format_type,format_size,max_frame_size;const unsigned char* format_buffer;};
struct Sample {int itrack,size,flags;const unsigned char* buffer;unsigned long long decode_time;};
int main(){
 umask(0077);
 alarm(85);
 std::string libPath,sourcePath,config,userInfo,device,firmware,outPath,version;
 for(auto p:{&libPath,&sourcePath,&config,&userInfo,&device,&firmware,&outPath,&version}) if(!std::getline(std::cin,*p))return 11;
 void* lib=dlopen(libPath.c_str(),RTLD_NOW|RTLD_LOCAL);if(!lib){report("network_load_failed",1);return 12;}
 reportVersion(sym<std::string(*)()>(lib,"bambu_network_get_version")());
 auto agent=sym<void*(*)(std::string)>(lib,"bambu_network_create_agent")(config);
 if(!agent)return 13;
 sym<int(*)(void*,std::string)>(lib,"bambu_network_set_config_dir")(agent,config);
 sym<int(*)(void*)>(lib,"bambu_network_init_log")(agent);
#ifdef __APPLE__
 report("cert_setup",sym<int(*)(void*,std::string,std::string)>(lib,"bambu_network_set_cert_file")(agent,"/Applications/BambuStudio.app/Contents/Resources/cert","slicer_base64.cer"));
#else
 report("cert_setup",sym<int(*)(void*,std::string,std::string)>(lib,"bambu_network_set_cert_file")(agent,"/etc/ssl/certs","ca-certificates.crt"));
#endif
#ifdef __APPLE__
 const std::string osType="macos";
#else
 const std::string osType="linux";
#endif
 sym<int(*)(void*,std::map<std::string,std::string>)>(lib,"bambu_network_set_extra_http_header")(agent,{{"X-BBL-Client-Name","BambuStudio"},{"X-BBL-Client-Type","slicer"},{"X-BBL-Client-Version",version},{"X-BBL-OS-Type",osType},{"X-BBL-Language","en-US"}});
 sym<int(*)(void*,std::string)>(lib,"bambu_network_set_country_code")(agent,"DE");
 sym<int(*)(void*,std::function<std::string()>)>(lib,"bambu_network_set_get_country_code_fn")(agent,[]{return std::string("DE");});
 sym<int(*)(void*,std::function<void(std::function<void()>)>)>(lib,"bambu_network_set_queue_on_main_fn")(agent,[](std::function<void()> fn){std::lock_guard<std::mutex> lock(queueMutex);callbacks.push_back(fn);});
 std::atomic<bool> connected=false;
 sym<int(*)(void*,std::function<void(int,int)>)>(lib,"bambu_network_set_on_server_connected_fn")(agent,[&](int rc,int reason){report("cloud_callback",rc);report("cloud_reason",reason);connected=rc==0;});
 std::mutex firmwareMutex;
 std::atomic<bool> lightRequested=false, lightConfirmed=false;
 auto message=[&](std::string id,std::string msg){if(msg=="wait_info"){report("waiting_device_info",1);return;}if(id!=device)return;
  if(lightRequested) {
   auto parsed=nlohmann::json::parse(msg,nullptr,false);
   if(!parsed.is_discarded()) { auto state=chamberLightState(parsed); if(state.has_value()) { lightConfirmed=*state; report("light_state_on",*state); } }
  }
  {std::smatch ota; std::regex object(R"(\{[^{}]*\})"); for(auto it=std::sregex_iterator(msg.begin(),msg.end(),object);it!=std::sregex_iterator();++it){auto part=it->str(); if(std::regex_search(part,std::regex("\"name\"\\s*:\\s*\"ota\"")) && std::regex_search(part,ota,std::regex("\"sw_ver\"\\s*:\\s*\"([0-9.]+)\""))){std::lock_guard<std::mutex> lock(firmwareMutex);firmware=ota[1];}}} if(msg.find("gcode_state")!=std::string::npos)report("full_status",1);if(msg.find("app_cert_install")!=std::string::npos){report("device_cert_reply",1);if(msg.find("SUCCESS")!=std::string::npos)report("device_cert_ready",1);} if(msg.find("liveview")!=std::string::npos){report("liveview_message",1);std::smatch match;if(std::regex_search(msg,match,std::regex("\"err_code\"\\s*:\\s*([0-9]+)")))report("liveview_error",std::stoll(match[1]));if(msg.find("succeed")!=std::string::npos||msg.find("SUCCESS")!=std::string::npos)report("liveview_ready",1);} };
 sym<int(*)(void*,std::function<void(std::string,std::string)>)>(lib,"bambu_network_set_on_message_fn")(agent,message);
 sym<int(*)(void*,std::function<void(std::string,std::string)>)>(lib,"bambu_network_set_on_user_message_fn")(agent,message);
 sym<int(*)(void*,std::function<void(unsigned,std::string)>)>(lib,"bambu_network_set_on_http_error_fn")(agent,[](unsigned code,std::string){report("http_error",code);});
 report("start",sym<int(*)(void*)>(lib,"bambu_network_start")(agent));
 report("login",sym<int(*)(void*,std::string)>(lib,"bambu_network_change_user")(agent,userInfo));userInfo.clear();
 report("logged_in",sym<bool(*)(void*)>(lib,"bambu_network_is_user_login")(agent));
 report("cert_refresh_begin",1);
 report("cert_refresh",sym<int(*)(void*)>(lib,"bambu_network_update_cert")(agent));for(int i=0;i<50;i++)pump();
 report("connect",sym<int(*)(void*)>(lib,"bambu_network_connect_server")(agent));
 for(int i=0;i<150&&!connected;i++)pump();
 report("connected",connected);if(!connected)std::_Exit(14);
 sym<void(*)(void*,bool)>(lib,"bambu_network_enable_multi_machine")(agent,true);
 report("subscribe_start",sym<int(*)(void*,std::string)>(lib,"bambu_network_start_subscribe")(agent,"app"));
 report("subscribe",sym<int(*)(void*,std::vector<std::string>)>(lib,"bambu_network_add_subscribe")(agent,{device}));
 report("select",sym<int(*)(void*,std::string)>(lib,"bambu_network_set_user_selected_machine")(agent,device));
 for(int i=0;i<20;i++)pump();
 auto send=sym<int(*)(void*,std::string,std::string,int,int)>(lib,"bambu_network_send_message");
 for(const auto* msg:{R"({"pushing":{"sequence_id":"30101","command":"pushall","version":1,"push_target":1}})",R"({"info":{"sequence_id":"30102","command":"get_version"}})",R"({"system":{"sequence_id":"30103","command":"get_access_code"}})"})report("metadata_request",send(agent,device,msg,0,0));
 // Standard Studio session initialization; no print, movement or heater entry points.
 sym<void(*)(void*,std::string,bool)>(lib,"bambu_network_install_device_cert")(agent,device,false);
 for(int i=0;i<30;i++)pump();
 // Match Studio's chamber-light control, including the secondary H-series lamp.
 lightRequested=true;
 report("light_primary_request",send(agent,device,lightOnCommand("chamber_light","30110"),0,0));
 report("light_secondary_request",send(agent,device,lightOnCommand("chamber_light2","30111"),0,0));
 for(int i=0;i<100&&!lightConfirmed;i++){
  if(i%20==0) send(agent,device,R"({"pushing":{"sequence_id":"30112","command":"pushall","version":1,"push_target":1}})",0,0);
  pump();
 }
 if(!lightConfirmed){report("light_confirmation_timeout",1);std::_Exit(18);}
 // Let exposure settle, continuing to process a possible light-off report.
 for(int i=0;i<10;i++)pump();
 if(!lightConfirmed){report("light_confirmation_lost",1);std::_Exit(18);}
 report("lights_on_confirmed",1);
 std::mutex urlMutex;std::string url;std::atomic<bool> urlReceived=false;
 for(int attempt=0;attempt<4&&!urlReceived;attempt++){
  report("camera_attempt",attempt+1);
  report("camera_request",sym<int(*)(void*,std::string,std::function<void(std::string)>)>(lib,"bambu_network_get_camera_url")(agent,device+"|"+([&](){std::lock_guard<std::mutex> lock(firmwareMutex);return firmware;})()+"|\"tutk\"",[&](std::string value){std::lock_guard<std::mutex> lock(urlMutex);url=value;urlReceived=true;}));
  for(int i=0;i<80&&!urlReceived;i++){if(i%10==0){sym<int(*)(void*)>(lib,"bambu_network_refresh_connection")(agent);sym<void(*)(void*,std::string,bool)>(lib,"bambu_network_install_device_cert")(agent,device,false);}pump();}
 }
 if(!urlReceived){report("camera_url_timeout",1);std::_Exit(15);}
 if(!lightConfirmed){report("light_confirmation_lost",1);std::_Exit(18);}
 std::string cameraUrl;{std::lock_guard<std::mutex> lock(urlMutex);cameraUrl=url;}
 bool remote=cameraUrl.rfind("bambu:///tutk?",0)==0||cameraUrl.rfind("bambu:///agora?",0)==0;
 report("remote_camera_url",remote);if(!remote){std::smatch match;if(std::regex_search(cameraUrl,match,std::regex("\\[(-?[0-9]+)\\]")))report("camera_url_error",std::stoll(match[1]));std::_Exit(16);}
 std::lock_guard<std::mutex> firmwareLock(firmwareMutex);
 cameraUrl+="&device="+device+"&dev_ver="+firmware+"&cli_id=bambu-studio&cli_ver="+version;
 if(true){std::ofstream handoff(config+"/camera-url",std::ios::binary);handoff<<cameraUrl;handoff.close();report("camera_url_saved",1);std::_Exit(0);}

 return 21;
}
