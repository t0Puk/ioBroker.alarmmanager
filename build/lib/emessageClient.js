"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var emessageClient_exports = {};
__export(emessageClient_exports, {
  EMessageClient: () => EMessageClient
});
module.exports = __toCommonJS(emessageClient_exports);
class EMessageClient {
  baseUrl;
  token = null;
  constructor(baseUrl) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }
  async login(userId, password) {
    const response = await fetch(`${this.baseUrl}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        userId,
        password
      })
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Login fehlgeschlagen (${response.status}): ${text}`);
    }
    const data = await response.json();
    if (!data.access_token) {
      throw new Error("Kein access_token erhalten");
    }
    this.token = data.access_token;
    return data.access_token;
  }
  async sendMessage(payload) {
    if (!this.token) {
      throw new Error("Kein Token vorhanden. Bitte zuerst einloggen.");
    }
    const response = await fetch(`${this.baseUrl}/api/eSendMessages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`
      },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Sendefehler (${response.status}): ${text}`);
    }
    return response.json();
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  EMessageClient
});
//# sourceMappingURL=emessageClient.js.map
