import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Shield,
  Settings,
  Plus,
  Server,
  Terminal,
  Power,
  Trash2,
  ChevronDown,
  ChevronUp,
  Sun,
  Moon,
  Info,
  Globe,
  Lock
} from 'lucide-react';

// --- Types ---
type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
type ConnectionMode = 'TUN' | 'SOCKS';

interface AdvancedOptions {
  iface: string;
  guid: string;
  localIp: string;
  routerMac: string;
  kcpMode: 'normal' | 'fast' | 'fast2' | 'fast3' | 'manual';
}

interface VpnServer {
  id: string;
  name: string;
  ip: string;
  port: string;
  secret: string;
  advanced: AdvancedOptions;
}

interface GlobalSocks {
  port: string;
  username: string;
  password: string;
}

interface NetworkInterface {
  name: string;
  address: string;
  mac: string;
}

// --- Types ---
declare global {
  interface Window {
    electron: {
      send: (channel: string, data?: any) => void;
      invoke: (channel: string, data?: any) => Promise<any>;
      receive: (channel: string, func: (...args: any[]) => void) => void;
    }
  }
}

// --- Constants ---
const DEFAULT_ADVANCED: AdvancedOptions = {
  iface: 'Ethernet',
  guid: '',
  localIp: '',
  routerMac: '',
  kcpMode: 'fast'
};

// --- App Component ---
const App = () => {
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [activeTab, setActiveTab] = useState<'home' | 'servers' | 'logs' | 'settings'>('home');
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [mode, setMode] = useState<ConnectionMode>('TUN');
  const [servers, setServers] = useState<VpnServer[]>([]);
  const [globalSocks, setGlobalSocks] = useState<GlobalSocks>({ port: '1404', username: '', password: '' });
  const [dns, setDns] = useState<string>('https://1.1.1.1/dns-query');
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>(["[SYSTEM] Candy-Paqet v1.0.4 initialized.", "[SYSTEM] Waiting for user input..."]);
  const [isAddingServer, setIsAddingServer] = useState(false);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [isManualNet, setIsManualNet] = useState(false);
  const [networkInfo, setNetworkInfo] = useState<NetworkInterface[]>([]);

  // Timer for connection
  const [uptime, setUptime] = useState(0);
  const timerRef = useRef<number | null>(null);

  // Persistence via IPC (candy.json)
  useEffect(() => {
    const loadSettings = async () => {
      if (window.electron) {
        const settings = await window.electron.invoke('get-settings');
        if (settings) {
          if (settings.servers) setServers(settings.servers);
          if (settings.mode) setMode(settings.mode);
          if (settings.globalSocks) setGlobalSocks(settings.globalSocks);
          if (settings.dns) setDns(settings.dns);
          if (settings.servers?.length > 0) setSelectedServerId(settings.servers[0].id);
        }

        // Admin check
        const elevated = await window.electron.invoke('get-elevation-status');
        setIsAdmin(elevated);

        // Load network info
        const netInfo = await window.electron.invoke('get-network-info');
        if (netInfo) setNetworkInfo(netInfo);
      }
    };
    loadSettings();
  }, []);

  useEffect(() => {
    if (window.electron) {
      window.electron.send('save-settings', { servers, mode, globalSocks, dns });
    }
  }, [servers, mode, globalSocks, dns]);

  useEffect(() => {
    if (status === 'connected') {
      timerRef.current = window.setInterval(() => {
        setUptime(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setUptime(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [status]);

  // IPC Log Hook
  useEffect(() => {
    if (window.electron) {
      window.electron.receive('paqet-log', (msg: string) => {
        addLog(msg);
      });
      window.electron.receive('paqet-status', (newStatus: ConnectionStatus, errorMsg?: string) => {
        setStatus(newStatus);
        if (errorMsg) addLog(`ERROR: ${errorMsg}`);
      });
    }
  }, []);

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString([], { hour12: false });
    setLogs(prev => [...prev.slice(-100), `[${time}] ${msg}`]);
  };

  const handleConnect = async () => {
    // If already connected or connecting, clicking the button should DISCONNECT/STOP
    if (status === 'connected' || status === 'connecting') {
      if (window.electron) {
        window.electron.send('stop-paqet');
        addLog(status === 'connected' ? "Requesting tunnel termination..." : "Aborting connection attempt...");
      }
      return;
    }

    const selectedServer = servers.find(s => s.id === selectedServerId);
    if (!selectedServer) {
      addLog("ERROR: No server selected.");
      return;
    }

    setStatus('connecting');
    addLog(`INITIATING: Handshake with ${selectedServer.name}...`);

    if (window.electron) {
      window.electron.send('start-paqet', {
        server: selectedServer,
        mode,
        globalSocks,
        dns
      });
    } else {
      addLog("ERROR: Electron bridge not found. Are you running in a browser?");
      setTimeout(() => setStatus('disconnected'), 1000);
    }
  };

  const deleteServer = (id: string) => {
    setServers(prev => prev.filter(s => s.id !== id));
    if (selectedServerId === id) setSelectedServerId(null);
    addLog("Server configuration removed.");
  };

  const formatUptime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // --- Styled Components ---
  const themeClass = isDarkMode
    ? "bg-[#0a0a0c] text-cyan-400 border-cyan-900"
    : "bg-gray-100 text-gray-800 border-gray-400";

  return (
    <div className={`flex flex-col h-screen w-full max-w-md mx-auto relative overflow-hidden transition-colors duration-300 ${themeClass}`}>

      {/* Header */}
      <header className={`p-4 border-b flex justify-between items-center ${isDarkMode ? 'border-cyan-900/50' : 'border-gray-300'}`}>
        <div className="flex items-center gap-2">
          <Shield className={status === 'connected' ? 'text-green-500' : (status === 'connecting' ? 'animate-pulse text-yellow-500' : '')} />
          <h1 className="font-bold tracking-widest text-lg font-['Share_Tech_Mono']">Candy-Paqet</h1>
        </div>
        <button
          onClick={() => setIsDarkMode(!isDarkMode)}
          className={`p-2 rounded-lg border ${isDarkMode ? 'border-cyan-900 hover:bg-cyan-900/20' : 'border-gray-400 hover:bg-gray-200'}`}
        >
          {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
        </button>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-6">
        {activeTab === 'home' && (
          <div className="space-y-8 flex flex-col items-center">
            {/* Status Visual */}
            <div className="relative w-48 h-48 flex items-center justify-center">
              <div className={`absolute inset-0 rounded-full border-4 border-dashed animate-[spin_10s_linear_infinite] ${status === 'connected' ? 'border-green-500/50' : (isDarkMode ? 'border-cyan-900/30' : 'border-gray-300')}`} />
              <div className={`absolute inset-4 rounded-full border-2 ${status === 'connected' ? 'border-green-500 animate-pulse' : (isDarkMode ? 'border-cyan-500/20' : 'border-gray-400')}`} />
              <div className="text-center z-10">
                <p className={`text-xs uppercase tracking-tighter ${isDarkMode ? 'text-cyan-600' : 'text-gray-500'}`}>Uptime</p>
                <p className="text-3xl font-bold font-['Share_Tech_Mono']">
                  {status === 'connected' ? formatUptime(uptime) : "00:00"}
                </p>
                <p className={`text-[10px] uppercase font-bold ${status === 'connected' ? 'text-green-500' : 'text-red-500'}`}>
                  {status.toUpperCase()}
                </p>
              </div>
            </div>

            {/* Mode Switcher */}
            <div className={`w-full p-1 rounded-xl flex gap-1 border ${isDarkMode ? 'bg-black/50 border-cyan-900/30' : 'bg-gray-200 border-gray-300'}`}>
              <button
                onClick={() => setMode('TUN')}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${mode === 'TUN' ? (isDarkMode ? 'bg-cyan-600 text-black shadow-[0_0_15px_rgba(8,145,178,0.5)]' : 'bg-gray-800 text-white') : ''}`}
              >
                TUN MODE
              </button>
              <button
                onClick={() => setMode('SOCKS')}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${mode === 'SOCKS' ? (isDarkMode ? 'bg-cyan-600 text-black shadow-[0_0_15px_rgba(8,145,178,0.5)]' : 'bg-gray-800 text-white') : ''}`}
              >
                SOCKS PROXY
              </button>
            </div>

            {/* Current Server */}
            <div className={`w-full p-4 rounded-xl border ${isDarkMode ? 'bg-cyan-950/20 border-cyan-900/50' : 'bg-white border-gray-200'}`}>
              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] opacity-60 uppercase font-bold tracking-widest">Active Server</span>
                <Globe size={12} className="opacity-60" />
              </div>
              <p className="font-bold flex items-center gap-2">
                <Server size={16} />
                {selectedServerId ? servers.find(s => s.id === selectedServerId)?.name : "No Server Selected"}
              </p>
              <p className="text-xs opacity-60 mt-1">
                {selectedServerId ? `${servers.find(s => s.id === selectedServerId)?.ip}:${servers.find(s => s.id === selectedServerId)?.port}` : "Configure in servers tab"}
              </p>
            </div>

            {/* Big Action Button */}
            <button
              onClick={handleConnect}
              disabled={!selectedServerId && status === 'disconnected'}
              className={`w-full py-6 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all active:scale-95 border-b-8 border-t-2 border-x-2 
                ${status === 'connected' || status === 'connecting'
                  ? 'bg-red-900/20 border-red-600 text-red-500 shadow-[0_0_20px_rgba(239,68,68,0.2)]'
                  : 'bg-cyan-600 border-cyan-800 text-black shadow-[0_10px_0_rgba(8,145,178,1)] hover:shadow-[0_5px_0_rgba(8,145,178,1)] hover:translate-y-[5px]'}
                ${!selectedServerId && status === 'disconnected' ? 'opacity-30 grayscale cursor-not-allowed' : ''}`}
            >
              <Power size={32} className={status === 'connecting' ? 'animate-pulse' : ''} />
              <span className="font-black text-xl tracking-[0.2em] font-['Share_Tech_Mono'] uppercase">
                {status === 'connected' ? 'TERMINATE' : (status === 'connecting' ? 'ABORT' : 'INITIALIZE')}
              </span>
            </button>
          </div>
        )}

        {activeTab === 'servers' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold font-['Share_Tech_Mono'] uppercase tracking-widest">Server List</h2>
              <button
                onClick={() => setIsAddingServer(true)}
                className={`p-2 rounded-lg border ${isDarkMode ? 'border-cyan-600 bg-cyan-900/30' : 'border-gray-800 bg-gray-800 text-white'}`}
              >
                <Plus size={20} />
              </button>
            </div>

            {servers.length === 0 ? (
              <div className={`p-8 rounded-xl border-2 border-dashed flex flex-col items-center justify-center opacity-40 ${isDarkMode ? 'border-cyan-900/50' : 'border-gray-300'}`}>
                <Info className="mb-2" />
                <p className="text-sm">NO CONFIGURED NODES</p>
              </div>
            ) : (
              servers.map(server => (
                <div
                  key={server.id}
                  onClick={() => setSelectedServerId(server.id)}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${selectedServerId === server.id
                    ? (isDarkMode ? 'bg-cyan-900/30 border-cyan-500 shadow-[0_0_15px_rgba(8,145,178,0.3)]' : 'bg-white border-gray-800 ring-2 ring-gray-800')
                    : (isDarkMode ? 'bg-black/40 border-cyan-900/50 opacity-60' : 'bg-gray-200 border-gray-300')}`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-bold flex items-center gap-2">
                        <Server size={14} /> {server.name}
                      </h3>
                      <p className="text-xs opacity-60">{server.ip}:{server.port}</p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteServer(server.id); }}
                      className="p-1 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="h-full flex flex-col">
            <h2 className="text-xl font-bold font-['Share_Tech_Mono'] uppercase tracking-widest mb-4">Terminal Console</h2>
            <div className={`flex-1 p-4 font-mono text-[10px] overflow-y-auto border-2 rounded-xl bg-black ${isDarkMode ? 'border-cyan-900/50 text-cyan-500/80' : 'border-gray-800 text-green-500'}`}>
              {logs.map((log, i) => (
                <div key={i} className="mb-1 leading-relaxed">{log}</div>
              ))}
              <div className="w-2 h-4 bg-cyan-500 inline-block animate-pulse align-middle ml-1" />
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold font-['Share_Tech_Mono'] uppercase tracking-widest mb-4">Global Settings</h2>

            <div className={`p-4 rounded-xl border ${isDarkMode ? 'bg-cyan-950/20 border-cyan-900/50' : 'bg-white border-gray-200'}`}>
              <h3 className="text-xs font-bold uppercase mb-4 opacity-60">SOCKS5 Proxy Configuration</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] uppercase font-bold opacity-60 mb-1 block">Listen Port</label>
                  <input
                    value={globalSocks.port}
                    onChange={(e) => setGlobalSocks({ ...globalSocks, port: e.target.value })}
                    placeholder="1404"
                    className={`w-full p-2 text-xs rounded-lg border bg-transparent outline-none ${isDarkMode ? 'border-cyan-900 text-cyan-300' : 'border-gray-300'}`}
                  />
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-[10px] uppercase font-bold opacity-60 mb-1 block">Username (Optional)</label>
                    <input
                      value={globalSocks.username}
                      onChange={(e) => setGlobalSocks({ ...globalSocks, username: e.target.value })}
                      className={`w-full p-2 text-xs rounded-lg border bg-transparent outline-none ${isDarkMode ? 'border-cyan-900' : 'border-gray-300'}`}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] uppercase font-bold opacity-60 mb-1 block">Password (Optional)</label>
                    <input
                      type="password"
                      value={globalSocks.password}
                      onChange={(e) => setGlobalSocks({ ...globalSocks, password: e.target.value })}
                      className={`w-full p-2 text-xs rounded-lg border bg-transparent outline-none ${isDarkMode ? 'border-cyan-900' : 'border-gray-300'}`}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className={`p-4 rounded-xl border ${isDarkMode ? 'bg-cyan-950/20 border-cyan-900/50' : 'bg-white border-gray-200'}`}>
              <h3 className="text-xs font-bold uppercase mb-4 opacity-60">DNS Configuration</h3>
              <div>
                <label className="text-[10px] uppercase font-bold opacity-60 mb-1 block">DNS Resolver (HTTPS/UDP)</label>
                <input
                  value={dns}
                  onChange={(e) => setDns(e.target.value)}
                  placeholder="https://1.1.1.1/dns-query"
                  className={`w-full p-2 text-xs rounded-lg border bg-transparent outline-none ${isDarkMode ? 'border-cyan-900 text-cyan-300' : 'border-gray-300'}`}
                />
              </div>
            </div>

            <div className="text-[10px] opacity-40 font-mono">
              <p>Storage Path: .../Paqet/candy.json</p>
              <p>Log Path: .../Paqet/candy.log</p>
            </div>
          </div>
        )}
      </main>

      {/* Add Server Modal Overlay */}
      {isAddingServer && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm p-6 flex items-center justify-center">
          <div className={`w-full max-w-sm rounded-2xl border-2 p-6 overflow-y-auto max-h-[90vh] ${themeClass}`}>
            <h2 className="text-xl font-bold font-['Share_Tech_Mono'] uppercase mb-6 flex items-center gap-2">
              <Plus size={20} /> New Connection
            </h2>

            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const isManual = formData.get('isManualNet') === 'on';

              const newServer: VpnServer = {
                id: Math.random().toString(36).substr(2, 9),
                name: formData.get('name') as string || 'Unnamed Node',
                ip: formData.get('ip') as string,
                port: formData.get('port') as string,
                secret: formData.get('secret') as string,
                advanced: {
                  iface: formData.get('iface') as string || DEFAULT_ADVANCED.iface,
                  guid: formData.get('guid') as string || DEFAULT_ADVANCED.guid,
                  localIp: formData.get('localIp') as string || DEFAULT_ADVANCED.localIp,
                  routerMac: formData.get('routerMac') as string || DEFAULT_ADVANCED.routerMac,
                  kcpMode: formData.get('kcpMode') as any || DEFAULT_ADVANCED.kcpMode,
                }
              };
              setServers([...servers, newServer]);
              setSelectedServerId(newServer.id);
              setIsAddingServer(false);
              addLog(`New server configured: ${newServer.name}`);
            }} className="space-y-4">
              <div>
                <label className="text-[10px] uppercase font-bold opacity-60 mb-1 block">Friendly Name</label>
                <input required name="name" placeholder="US East - Node 01" className={`w-full p-3 rounded-lg border bg-transparent focus:ring-1 focus:ring-cyan-500 outline-none ${isDarkMode ? 'border-cyan-900 text-cyan-300' : 'border-gray-300'}`} />
              </div>
              <div className="flex gap-2">
                <div className="flex-[3]">
                  <label className="text-[10px] uppercase font-bold opacity-60 mb-1 block">Server IP / Host</label>
                  <input required name="ip" placeholder="192.168.1.1" className={`w-full p-3 rounded-lg border bg-transparent outline-none ${isDarkMode ? 'border-cyan-900' : 'border-gray-300'}`} />
                </div>
                <div className="flex-[1]">
                  <label className="text-[10px] uppercase font-bold opacity-60 mb-1 block">Port</label>
                  <input required name="port" defaultValue="443" className={`w-full p-3 rounded-lg border bg-transparent outline-none ${isDarkMode ? 'border-cyan-900' : 'border-gray-300'}`} />
                </div>
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold opacity-60 mb-1 block">Secret Key</label>
                <div className="relative">
                  <input required name="secret" type="password" placeholder="••••••••" className={`w-full p-3 rounded-lg border bg-transparent outline-none ${isDarkMode ? 'border-cyan-900' : 'border-gray-300'}`} />
                  <Lock size={16} className="absolute right-3 top-1/2 -translate-y-1/2 opacity-30" />
                </div>
              </div>

              {/* Advanced Collapsible */}
              <div className="pt-2">
                <details className="group">
                  <summary className="cursor-pointer list-none flex items-center justify-between text-[10px] uppercase font-black tracking-widest py-2 border-y border-cyan-900/30">
                    Advanced Parameters
                    <ChevronDown size={14} className="group-open:rotate-180 transition-transform" />
                  </summary>
                  <div className="pt-4 space-y-4">
                    {/* Interface Selection Mode */}
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-[10px] uppercase font-black opacity-60">Network Setup</label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <span className="text-[10px] uppercase font-bold opacity-40">Manual</span>
                        <input type="checkbox" name="isManualNet" checked={isManualNet} className="hidden peer" onChange={(e) => {
                          setIsManualNet(e.target.checked);
                          const form = e.target.closest('form');
                          if (form) {
                            const isManual = e.target.checked;
                            ['iface', 'localIp', 'routerMac', 'guid'].forEach(name => {
                              (form.elements.namedItem(name) as HTMLInputElement).readOnly = !isManual;
                            });
                          }
                        }} />
                        <div className="w-8 h-4 bg-gray-700 rounded-full relative peer-checked:bg-cyan-600 transition-colors">
                          <div className="absolute top-1 left-1 w-2 h-2 bg-white rounded-full transition-all peer-checked:left-5" />
                        </div>
                      </label>
                    </div>

                    {!isManualNet && (
                      <div>
                        <label className="text-[10px] uppercase font-bold opacity-60 mb-1 block">Select Interface ({networkInfo.length})</label>
                        <select
                          className={`w-full p-2 text-xs rounded-lg border bg-black outline-none ${isDarkMode ? 'border-cyan-900 text-cyan-300' : 'border-gray-300'}`}
                          onChange={(e) => {
                            const selected = networkInfo.find(n => n.name === e.target.value);
                            const form = (e.target as any).form;
                            if (selected && form) {
                              (form.elements.namedItem('iface') as HTMLInputElement).value = selected.name;
                              (form.elements.namedItem('localIp') as HTMLInputElement).value = selected.address;
                              (form.elements.namedItem('routerMac') as HTMLInputElement).value = selected.mac;
                              (form.elements.namedItem('guid') as HTMLInputElement).value = selected.guid;
                            }
                          }}
                        >
                          <option value="">-- Choose Interface --</option>
                          {networkInfo.length > 0 ? (
                            networkInfo.map((net, i) => (
                              <option key={i} value={net.name}>{net.name} ({net.address})</option>
                            ))
                          ) : (
                            <option value="" disabled>No Interfaces Discovered</option>
                          )}
                        </select>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="text-[10px] uppercase font-bold opacity-60 mb-1 block">Iface Name</label>
                        <input name="iface" readOnly defaultValue={DEFAULT_ADVANCED.iface} className={`w-full p-2 text-xs rounded-lg border bg-transparent outline-none ${isDarkMode ? 'border-cyan-900' : 'border-gray-300'} read-only:opacity-50`} />
                      </div>
                      <div className="flex-1">
                        <label className="text-[10px] uppercase font-bold opacity-60 mb-1 block">Local IP</label>
                        <input name="localIp" readOnly placeholder="192.168.1.10" className={`w-full p-2 text-xs rounded-lg border bg-transparent outline-none ${isDarkMode ? 'border-cyan-900' : 'border-gray-300'} read-only:opacity-50`} />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold opacity-60 mb-1 block">GUID (Windows Only)</label>
                      <input name="guid" readOnly placeholder="GUID string..." className={`w-full p-2 text-xs rounded-lg border bg-transparent outline-none ${isDarkMode ? 'border-cyan-900' : 'border-gray-300'} read-only:opacity-50`} />
                    </div>
                    <div className="flex gap-2">
                      <div className="flex-[2]">
                        <label className="text-[10px] uppercase font-bold opacity-60 mb-1 block">Router MAC</label>
                        <input name="routerMac" readOnly placeholder="00:00:00:00:00:00" className={`w-full p-2 text-xs rounded-lg border bg-transparent outline-none ${isDarkMode ? 'border-cyan-900' : 'border-gray-300'} read-only:opacity-50`} />
                      </div>
                      <div className="flex-1">
                        <label className="text-[10px] uppercase font-bold opacity-60 mb-1 block">KCP Mode</label>
                        <select name="kcpMode" className={`w-full p-2 text-xs rounded-lg border bg-black outline-none ${isDarkMode ? 'border-cyan-900 text-cyan-300' : 'border-gray-300'}`}>
                          <option value="fast">fast</option>
                          <option value="normal">normal</option>
                          <option value="fast2">fast2</option>
                          <option value="fast3">fast3</option>
                          <option value="manual">manual</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </details>
              </div>

              <div className="flex gap-3 pt-6">
                <button
                  type="button"
                  onClick={() => setIsAddingServer(false)}
                  className={`flex-1 py-3 rounded-xl font-bold text-xs ${isDarkMode ? 'bg-cyan-950/40 text-cyan-600' : 'bg-gray-200 text-gray-600'}`}
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  className={`flex-[2] py-3 rounded-xl font-bold text-xs tracking-widest ${isDarkMode ? 'bg-cyan-600 text-black shadow-[0_0_15px_rgba(8,145,178,0.5)]' : 'bg-gray-800 text-white'}`}
                >
                  SAVE NODE
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Navigation Footer */}
      <nav className={`p-4 border-t flex justify-around items-center ${isDarkMode ? 'border-cyan-900/50 bg-black/40' : 'border-gray-300 bg-gray-50'}`}>
        <button
          onClick={() => setActiveTab('home')}
          className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'home' ? 'text-cyan-500 scale-110 font-bold' : 'opacity-40'}`}
        >
          <Shield size={22} />
          <span className="text-[8px] uppercase tracking-tighter">Portal</span>
        </button>
        <button
          onClick={() => setActiveTab('servers')}
          className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'servers' ? 'text-cyan-500 scale-110 font-bold' : 'opacity-40'}`}
        >
          <Server size={22} />
          <span className="text-[8px] uppercase tracking-tighter">Nodes</span>
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'logs' ? 'text-cyan-500 scale-110 font-bold' : 'opacity-40'}`}
        >
          <Terminal size={22} />
          <span className="text-[8px] uppercase tracking-tighter">Console</span>
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'settings' ? 'text-cyan-500 scale-110 font-bold' : 'opacity-40'}`}
        >
          <Settings size={22} />
          <span className="text-[8px] uppercase tracking-tighter">System</span>
        </button>
      </nav>

      {/* Admin Warning Overlay */}
      {isAdmin === false && (
        <div className="fixed inset-0 z-[200] bg-black/95 backdrop-blur-md p-8 flex flex-col items-center justify-center text-center">
          <Shield size={64} className="text-red-500 mb-6 animate-pulse" />
          <h2 className="text-2xl font-bold font-['Share_Tech_Mono'] text-red-500 mb-4">ADMIN PRIVILEGES REQUIRED</h2>
          <p className="text-sm opacity-80 mb-8 max-w-xs">
            Candy-Paqet needs administrative permissions to create network interfaces and routing tables.
          </p>
          <div className="p-4 border border-red-900/50 bg-red-900/10 rounded-xl text-xs font-mono text-red-400">
            Please close the application and "Run as Administrator" (Windows) or use "sudo" (Linux/Mac).
          </div>
        </div>
      )}

      {/* Retro HUD Elements */}
      <div className="absolute top-0 right-0 p-2 opacity-20 pointer-events-none flex flex-col items-end">
        <span className="text-[8px] font-mono">LAT: 37.7749</span>
        <span className="text-[8px] font-mono">LON: -122.4194</span>
        <span className="text-[8px] font-mono mt-1">ENCR: AES-256</span>
      </div>
    </div>
  );
};

// --- Render ---
const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(<App />);
}
