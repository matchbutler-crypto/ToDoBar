"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("todo", {
  getState: () => ipcRenderer.invoke("state:get"),
  dispatch: (action) => ipcRenderer.invoke("state:dispatch", action),
  onState: (fn) => {
    const handler = (_e, state) => fn(state);
    ipcRenderer.on("state:changed", handler);
    return () => ipcRenderer.removeListener("state:changed", handler);
  },
  onShown: (fn) => {
    const handler = () => fn();
    ipcRenderer.on("popover:shown", handler);
    return () => ipcRenderer.removeListener("popover:shown", handler);
  },
  onTab: (fn) => {
    const handler = (_e, tab) => fn(tab);
    ipcRenderer.on("ui:tab", handler);
    return () => ipcRenderer.removeListener("ui:tab", handler);
  },
  hidePopover: () => ipcRenderer.send("popover:hide"),
  resizePopover: (height) => ipcRenderer.send("popover:resize", height),
  openWindow: (tab) => ipcRenderer.send("window:open", tab)
});
