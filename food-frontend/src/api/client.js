import axios from "axios";

const api = axios.create({
  baseURL: "",
  timeout: 20000,
});

export default api;
