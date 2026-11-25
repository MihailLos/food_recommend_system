import client from "./client";

const base = "/api/technology";

export function getTechnologyOptions(signal) {
  return client.get(`${base}/options/`, { signal }).then(({ data }) => data);
}

export function getTechnologyMatches(path, signal) {
  return client.get(`${base}/${path}`, { signal }).then(({ data }) => data.results ?? data);
}

export function listTechnologyRecords(page, signal) {
  return client.get(`${base}/records/`, { params: { page }, signal }).then(({ data }) => data);
}

export function getTechnologyRecord(id, signal) {
  return client.get(`${base}/records/${id}/`, { signal }).then(({ data }) => data);
}

export function createTechnologyRecord(record) {
  return client.post(`${base}/records/`, record).then(({ data }) => data);
}
