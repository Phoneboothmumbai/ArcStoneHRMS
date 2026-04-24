import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

const BASE_URL =
  Constants.expoConfig?.extra?.apiBaseUrl ||
  "https://people-partner-cloud.preview.emergentagent.com";

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
  return err?.message || "Something went wrong";
};
