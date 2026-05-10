import axios from "axios";

const api = axios.create({
  baseURL: "",
  timeout: 20000,
  withCredentials: true,
  xsrfCookieName: "csrftoken",
  xsrfHeaderName: "X-CSRFToken",
});

export default api;
