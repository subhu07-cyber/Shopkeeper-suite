import axios from "axios";
import { cacheSet, cacheRead, queueRequest } from "@/lib/offline";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const api = axios.create({ baseURL: `${BACKEND_URL}/api` });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("sk_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const cachedGet = async (url) => {
  try {
    const { data } = await api.get(url);
    cacheSet(url, data);
    return data;
  } catch (e) {
    if (!e.response) {
      const cached = await cacheRead(url);
      if (cached !== undefined && cached !== null) return cached;
    }
    throw e;
  }
};

export const offlinePost = async (url, body) => {
  try {
    const { data } = await api.post(url, body);
    return { data, queued: false };
  } catch (e) {
    if (!e.response) {
      await queueRequest(url, body);
      return { queued: true };
    }
    throw e;
  }
};

export const inr = (n) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0);

export const CAP = 10000000;
export const SOFT_CAP = 8000000;

export const errMsg = (e) => {
  const d = e?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x?.msg || JSON.stringify(x)).join(" ");
  return e?.message || "Something went wrong";
};
