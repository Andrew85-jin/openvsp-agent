import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('openvspAgent', {
  runDesignStudy: ({ runId, prompt }) =>
    ipcRenderer.invoke('openvsp-agent:run-design-study', { runId, prompt }),
  onRunEvent: (callback) => {
    const listener = (_event, payload) => callback(payload);

    ipcRenderer.on('openvsp-agent:run-event', listener);

    return () => {
      ipcRenderer.removeListener('openvsp-agent:run-event', listener);
    };
  },
});
