"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var emessageClient_exports = {};
__export(emessageClient_exports, {
  EMessageClient: () => EMessageClient
});
module.exports = __toCommonJS(emessageClient_exports);
var import_axios = __toESM(require("axios"));
function formatAxiosError(error) {
  var _a, _b, _c, _d, _e, _f;
  if (import_axios.default.isAxiosError(error)) {
    const axiosError = error;
    const method = ((_b = (_a = axiosError.config) == null ? void 0 : _a.method) == null ? void 0 : _b.toUpperCase()) || "UNKNOWN";
    const baseURL = ((_c = axiosError.config) == null ? void 0 : _c.baseURL) || "";
    const url = ((_d = axiosError.config) == null ? void 0 : _d.url) || "";
    const fullUrl = `${baseURL}${url}`;
    const status = (_e = axiosError.response) == null ? void 0 : _e.status;
    const responseData = (_f = axiosError.response) == null ? void 0 : _f.data;
    return [
      "HTTP-Fehler bei e*Message",
      `Methode: ${method}`,
      `URL: ${fullUrl}`,
      `Status: ${status != null ? status : "unbekannt"}`,
      `Antwort: ${JSON.stringify(responseData)}`
    ].join(" | ");
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
class EMessageClient {
  username;
  password;
  jwt = null;
  authHttp;
  rsHttp;
  constructor(options) {
    this.username = options.username;
    this.password = options.password;
    this.authHttp = import_axios.default.create({
      baseURL: "https://api.emessage.de/auth",
      timeout: 15e3
    });
    this.rsHttp = import_axios.default.create({
      baseURL: "https://api.emessage.de/rs",
      timeout: 15e3
    });
  }
  async login() {
    var _a, _b;
    try {
      const response = await this.authHttp.post(
        "/login",
        {
          username: this.username,
          password: this.password
        },
        {
          headers: {
            Authorization: "Basic Og==",
            "Content-Type": "application/json"
          }
        }
      );
      const jwt = (_b = (_a = response == null ? void 0 : response.data) == null ? void 0 : _a.data) == null ? void 0 : _b.jwt;
      if (!jwt) {
        throw new Error(`Kein JWT von e*Message erhalten. Antwort: ${JSON.stringify(response == null ? void 0 : response.data)}`);
      }
      this.jwt = jwt;
      return jwt;
    } catch (error) {
      throw new Error(formatAxiosError(error));
    }
  }
  async ensureJwt() {
    if (this.jwt) {
      return this.jwt;
    }
    return this.login();
  }
  async sendMessage(messageText, recipients) {
    var _a, _b;
    try {
      const jwt = await this.ensureJwt();
      const response = await this.rsHttp.post(
        "/eSendMessages",
        {
          messageText,
          recipients
        },
        {
          headers: {
            Authorization: `Bearer ${jwt}`,
            "Content-Type": "application/json"
          }
        }
      );
      return {
        trackingId: (_b = (_a = response == null ? void 0 : response.data) == null ? void 0 : _a.data) == null ? void 0 : _b.trackingId,
        raw: response == null ? void 0 : response.data
      };
    } catch (error) {
      throw new Error(formatAxiosError(error));
    }
  }
  async getMessageStatus(trackingId) {
    var _a, _b, _c, _d;
    if (!trackingId) {
      throw new Error("trackingId fehlt");
    }
    try {
      const jwt = await this.ensureJwt();
      const response = await this.rsHttp.get(`/eGetMessages/External/${encodeURIComponent(trackingId)}`, {
        headers: {
          Authorization: `Bearer ${jwt}`
        }
      });
      return {
        messageContent: (_b = (_a = response == null ? void 0 : response.data) == null ? void 0 : _a.data) == null ? void 0 : _b.messageContent,
        recipients: Array.isArray((_d = (_c = response == null ? void 0 : response.data) == null ? void 0 : _c.data) == null ? void 0 : _d.recipients) ? response.data.data.recipients : [],
        raw: response == null ? void 0 : response.data
      };
    } catch (error) {
      throw new Error(formatAxiosError(error));
    }
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  EMessageClient
});
//# sourceMappingURL=emessageClient.js.map
