import axios from "axios";

const rawBaseUrl = process.env.REACT_APP_API_BASE_URL || "http://127.0.0.1:8000";
const baseURL = rawBaseUrl.replace(/\/+$/, "");

const api = axios.create({
  baseURL,
  timeout: 20000,
});

export default api;
