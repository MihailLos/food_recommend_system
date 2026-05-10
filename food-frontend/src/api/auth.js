import client from "./client";

export async function fetchCsrfCookie() {
  return client.get("/api/auth/csrf/").then((r) => r.data);
}

export async function fetchCurrentUser() {
  return client.get("/api/auth/me/").then((r) => r.data);
}

export async function registerUser(payload) {
  return client.post("/api/auth/register/", payload).then((r) => r.data);
}

export async function loginUser(payload) {
  return client.post("/api/auth/login/", payload).then((r) => r.data);
}

export async function logoutUser() {
  return client.post("/api/auth/logout/").then((r) => r.data);
}
