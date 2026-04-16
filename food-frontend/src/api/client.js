import axios from "axios";

const api = axios.create({
  baseURL: "http://127.0.0.1:8000",
  timeout: 20000,
});

// если Django на другом домене/порте — не забудь CORS в Django
export default api;