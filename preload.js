const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    send: (channel, data) => {
        // whitelist channels
        let validChannels = ['start-paqet', 'stop-paqet', 'save-settings'];
        if (validChannels.includes(channel)) {
            ipcRenderer.send(channel, data);
        }
    },
    invoke: (channel, data) => {
        let validChannels = ['get-settings', 'get-network-info', 'get-elevation-status'];
        if (validChannels.includes(channel)) {
            return ipcRenderer.invoke(channel, data);
        }
    },
    receive: (channel, func) => {
        let validChannels = ['paqet-log', 'paqet-status'];
        if (validChannels.includes(channel)) {
            // Deliberately strip event as it includes `sender` 
            ipcRenderer.on(channel, (event, ...args) => func(...args));
        }
    }
});
