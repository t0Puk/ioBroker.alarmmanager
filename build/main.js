"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var utils = __toESM(require("@iobroker/adapter-core"));
var import_emessageClient = require("./lib/emessageClient");
class Alarmmanager extends utils.Adapter {
  pollTimer;
  emessageClient;
  constructor(options = {}) {
    super({
      ...options,
      name: "alarmmanager"
    });
    this.emessageClient = new import_emessageClient.EMessageClient("https://api.emessage.de");
    this.on("ready", this.onReady.bind(this));
    this.on("stateChange", this.onStateChange.bind(this));
    this.on("unload", this.onUnload.bind(this));
  }
  async onReady() {
    this.log.info("AlarmManager startet ...");
    await this.setState("info.connection", false, true);
    await this.extendObject("info.lastLogin", {
      type: "state",
      common: {
        name: "Zeitpunkt des letzten erfolgreichen API-Logins",
        type: "string",
        role: "text",
        read: true,
        write: false
      },
      native: {}
    });
    await this.extendObject("info.lastError", {
      type: "state",
      common: {
        name: "Letzter Fehler",
        type: "string",
        role: "text",
        read: true,
        write: false
      },
      native: {}
    });
    await this.extendObject("info.queueLength", {
      type: "state",
      common: {
        name: "Anzahl wartender Alarme",
        type: "number",
        role: "value",
        read: true,
        write: false,
        def: 0
      },
      native: {}
    });
    await this.extendObject("actions.testLogin", {
      type: "state",
      common: {
        name: "Testet den Login zur e*Message API",
        type: "boolean",
        role: "button",
        read: false,
        write: true,
        def: false
      },
      native: {}
    });
    await this.extendObject("actions.testSend", {
      type: "state",
      common: {
        name: "Sendet eine Testnachricht",
        type: "boolean",
        role: "button",
        read: false,
        write: true,
        def: false
      },
      native: {}
    });
    await this.extendObject("actions.testMessage", {
      type: "state",
      common: {
        name: "Text f\xFCr Testnachricht",
        type: "string",
        role: "text",
        read: true,
        write: true,
        def: "AlarmManager Testnachricht"
      },
      native: {}
    });
    await this.extendObject("actions.lastSendResult", {
      type: "state",
      common: {
        name: "Ergebnis der letzten Testsendung",
        type: "string",
        role: "json",
        read: true,
        write: false
      },
      native: {}
    });
    await this.subscribeStates("actions.testLogin");
    await this.subscribeStates("actions.testSend");
    await this.setState("info.queueLength", 0, true);
    this.startPollingInfoLog();
    this.log.info("AlarmManager wurde initialisiert.");
  }
  startPollingInfoLog() {
    const intervalSec = Number(this.config.pollIntervalSec) || 30;
    this.pollTimer = this.setInterval(() => {
      this.log.debug(`Polling aktiv. Intervall: ${intervalSec} Sekunden`);
    }, intervalSec * 1e3);
  }
  async onStateChange(id, state) {
    if (!state || state.ack) {
      return;
    }
    if (id === `${this.namespace}.actions.testLogin` && state.val === true) {
      await this.handleTestLogin();
      await this.setState("actions.testLogin", false, true);
    }
    if (id === `${this.namespace}.actions.testSend` && state.val === true) {
      await this.handleTestSend();
      await this.setState("actions.testSend", false, true);
    }
  }
  async handleTestLogin() {
    try {
      const apiUserId = String(this.config.apiUserId || "").trim();
      const apiPassword = String(this.config.apiPassword || "").trim();
      if (!apiUserId || !apiPassword) {
        throw new Error("apiUserId oder apiPassword ist nicht gesetzt.");
      }
      await this.emessageClient.login(apiUserId, apiPassword);
      await this.setState("info.connection", true, true);
      await this.setState("info.lastLogin", (/* @__PURE__ */ new Date()).toISOString(), true);
      await this.setState("info.lastError", "", true);
      this.log.info("Login zur e*Message API erfolgreich.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.setState("info.connection", false, true);
      await this.setState("info.lastError", message, true);
      this.log.error(`Test-Login fehlgeschlagen: ${message}`);
    }
  }
  async handleTestSend() {
    try {
      const apiUserId = String(this.config.apiUserId || "").trim();
      const apiPassword = String(this.config.apiPassword || "").trim();
      const senderAddress = String(this.config.senderAddress || "").trim();
      const testRecipientService = String(this.config.testRecipientService || "2wayS").trim();
      const testRecipientIdentifier = String(this.config.testRecipientIdentifier || "").trim();
      if (!apiUserId || !apiPassword) {
        throw new Error("apiUserId oder apiPassword ist nicht gesetzt.");
      }
      if (!senderAddress) {
        throw new Error("senderAddress ist nicht gesetzt.");
      }
      if (!testRecipientIdentifier) {
        throw new Error("testRecipientIdentifier ist nicht gesetzt.");
      }
      const messageState = await this.getStateAsync("actions.testMessage");
      const messageText = String((messageState == null ? void 0 : messageState.val) || "AlarmManager Testnachricht");
      await this.emessageClient.login(apiUserId, apiPassword);
      const result = await this.emessageClient.sendMessage({
        test: true,
        senderAddress,
        message: messageText,
        recipients: [
          {
            serviceName: testRecipientService,
            identifier: testRecipientIdentifier
          }
        ]
      });
      await this.setState("info.connection", true, true);
      await this.setState("info.lastError", "", true);
      await this.setState("actions.lastSendResult", JSON.stringify(result, null, 2), true);
      this.log.info("Testnachricht erfolgreich gesendet.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.setState("info.connection", false, true);
      await this.setState("info.lastError", message, true);
      this.log.error(`Testsendung fehlgeschlagen: ${message}`);
    }
  }
  onUnload(callback) {
    try {
      if (this.pollTimer) {
        this.clearInterval(this.pollTimer);
        this.pollTimer = void 0;
      }
      callback();
    } catch {
      callback();
    }
  }
}
if (require.main !== module) {
  module.exports = (options) => new Alarmmanager(options);
} else {
  (() => new Alarmmanager())();
}
//# sourceMappingURL=main.js.map
