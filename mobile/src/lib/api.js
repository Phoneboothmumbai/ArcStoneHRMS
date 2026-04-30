import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

const BASE_URL =
  Constants.expoConfig?.extra?.apiBaseUrl ||
  "http://138.199.146.191";

export const api = axios.create({
  baseURL: `${BASE_URL}/api`,
  timeout: 20000,
});

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem("access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  async (err) => {
    if (err.response?.status === 401) {
      await AsyncStorage.multiRemove(["access_token", "refresh_token", "user"]);
    }
    return Promise.reject(err);
  },
);

export const formatError = (err) => {
  const d = err?.response?.data;
  if (typeof d === "string") return d;
  if (d?.detail) {
    if (typeof d.detail === "string") return d.detail;
    if (typeof d.detail?.message === "string") return d.detail.message;
  }
  // Axios "Network Error" → unhelpful by itself. Surface the actual URL we
  // tried to reach so users / support can immediately tell wifi-block vs
  // cleartext-block vs server-down.
  const msg = err?.message || "Something went wrong";
  if (/network/i.test(msg)) {
    const url = err?.config?.baseURL || BASE_URL;
    return `Cannot reach server at ${url}. Check Wi-Fi / mobile data and try again. (If this keeps happening, contact HR.)`;
  }
  return msg;
};
