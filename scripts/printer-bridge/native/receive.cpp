// Camera reception only; no motion, heater or print commands.
#include <dlfcn.h>
#ifdef __APPLE__
#include <CoreFoundation/CoreFoundation.h>
#else
#include <glib.h>
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
for(int i=0;i<100&&g_main_context_pending(nullptr);i++)g_main_context_iteration(nullptr,false);
std::this_thread::sleep_for(100ms);}
#endif
void report(const std::string& key, long long value) { std::lock_guard<std::mutex> lock(reportMutex); auto s=key+"="+std::to_string(value)+"\n"; write(3,s.data(),s.size()); }
void reportVersion(const std::string& value) { if(std::regex_match(value,std::regex("[0-9.]+"))) { auto s="network_version="+value+"\n"; write(3,s.data(),s.size()); } }
template<class T> T sym(void* lib,const char* name) { auto p=dlsym(lib,name);if(!p){report("missing_symbol",1);std::_Exit(10);}return reinterpret_cast<T>(p);}
struct StreamInfo {int type,sub_type;union {struct {int width,height,frame_rate;} video;struct {int sample_rate,channel_count,sample_size;} audio;} format; int format_type,format_size,max_frame_size;const unsigned char* format_buffer;};
struct Sample {int itrack,size,flags;const unsigned char* buffer;unsigned long long decode_time;};
static void cameraLog(void*, int level, const char* msg) {
 if(!msg)return;
 static std::mutex m;static std::map<std::string,int> counts;
 std::lock_guard<std::mutex> guard(m);
 std::string text(msg);std::string lower=text;for(auto& c:lower)c=std::tolower(static_cast<unsigned char>(c));
 for(auto key:{"timeout","error","failed","busy","session","avclient","connect","stream","frame"})if(lower.find(key)!=std::string::npos&&++counts[key]<=8)report(std::string("log_")+key,level);
 static const std::regex code(R"((?:error|err|return|ret|result|code)\s*[:=]\s*(-?[0-9]{1,8}))",std::regex::icase);
 for(auto i=std::sregex_iterator(text.begin(),text.end(),code);i!=std::sregex_iterator();++i){int n=std::stoi((*i)[1]);auto key=std::to_string(n);if(++counts["code"+key]<=5)report("log_result",n);}
}
int main(){umask(0077);alarm(85);std::string sourcePath,cameraUrl,outPath; for(auto p:{&sourcePath,&cameraUrl,&outPath})if(!std::getline(std::cin,*p))return 11;
 void* src=dlopen(sourcePath.c_str(),RTLD_NOW|RTLD_LOCAL);if(!src){report("source_load_failed",1);std::_Exit(17);}
 sym<int(*)()>(src,"Bambu_Init")();void* tunnel=nullptr;
 int createRc=sym<int(*)(void**,const char*)>(src,"Bambu_Create")(&tunnel,cameraUrl.c_str());report("source_create",createRc);if(createRc!=0||!tunnel)std::_Exit(17);
 auto cleanup=[&](){report("close_begin",1);sym<void(*)(void*)>(src,"Bambu_Close")(tunnel);sym<void(*)(void*)>(src,"Bambu_Destroy")(tunnel);report("close_complete",1);};
 sym<void(*)(void*,void(*)(void*,int,const char*),void*)>(src,"Bambu_SetLogger")(tunnel,cameraLog,nullptr);
 auto open=sym<int(*)(void*)>(src,"Bambu_Open");int rc=2;
 for(int i=0;i<250&&rc==2;i++){rc=open(tunnel);if(rc==2)pump();}
 report("source_open",rc);if(rc!=0){if(rc==2)report("open_timeout",1);cleanup();std::_Exit(18);}
 auto start=sym<int(*)(void*,bool)>(src,"Bambu_StartStream");rc=2;
 const auto startTime=std::chrono::steady_clock::now();
 for(int i=0;i<900&&rc==2;i++){rc=start(tunnel,true);if(rc==2)pump();if(std::chrono::steady_clock::now()-startTime>=45s)break;}
 report("stream_start_ms",std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now()-startTime).count());
 report("stream_start",rc);if(rc!=0){if(rc==2)report("stream_start_timeout",1);cleanup();std::_Exit(19);}
 StreamInfo info{};rc=sym<int(*)(void*,int,StreamInfo*)>(src,"Bambu_GetStreamInfo")(tunnel,0,&info);
 report("stream_info",rc);report("codec",info.sub_type);report("width",info.format.video.width);report("height",info.format.video.height);report("format",info.format_type);
 std::ofstream output(outPath,std::ios::binary);auto read=sym<int(*)(void*,Sample*)>(src,"Bambu_ReadSample");long long count=0,bytes=0,capturedAt=0;
 const auto deadline=std::chrono::steady_clock::now()+15s;
 while(std::chrono::steady_clock::now()<deadline&&count<60&&bytes<25*1024*1024){Sample sample{};rc=read(tunnel,&sample);if(rc==2){pump();continue;}if(rc!=0)break;if(sample.itrack!=0||sample.size<=0||sample.size>4*1024*1024||!sample.buffer)continue;count++;if(info.sub_type==1&&count<2)continue;capturedAt=std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::system_clock::now().time_since_epoch()).count();output.write(reinterpret_cast<const char*>(sample.buffer),sample.size);bytes+=sample.size;if(info.sub_type==1)break;}
 output.close();report("captured_at_ms",capturedAt);report("frames",count);report("bytes",bytes);report("read_result",rc);
 cleanup();
 report("finished",1);std::_Exit(bytes?0:20);
}
