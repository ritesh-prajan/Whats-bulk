// Preload script - runs in renderer context with Node integration disabled
// Exposes only safe APIs via contextBridge if needed in the future
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('electronApp', {
  isElectron: true,
  platform: process.platform,
});
