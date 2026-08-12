import axios from "axios";
import { getToken } from "./getToken";

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;

if (!backendUrl) {
  console.error("NEXT_PUBLIC_BACKEND_URL is not defined");
}

const api = axios.create({
  baseURL: backendUrl,
  withCredentials: true,
});

// O refreshToken vive num cookie httpOnly, então só o servidor consegue lê-lo.
// getToken é uma server action: em Server Components devolve o token, no
// browser faz um round-trip até o servidor. Por isso o interceptor é async.
api.interceptors.request.use(async (config) => {
  const token = await getToken("refreshToken");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

export default api;
