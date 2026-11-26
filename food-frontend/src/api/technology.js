import client from "./client";

const base = "/api/technology";

export function getTechnologyOptions(signal) {
  return client.get(`${base}/options/`, { signal }).then(({ data }) => data);
}

export function createProcessingType(name) {
  return client.post(`${base}/processing-types/`, { name }).then(({ data }) => data);
}

export function getTechnologyMatches(path, signal) {
  return client.get(`${base}/${path}`, { signal }).then(({ data }) => data.results ?? data);
}

export function listTechnologyRecords(page, signal, filters) {
  return client.get(`${base}/records/`, { params: { page, ...filters }, signal }).then(({ data }) => data);
}

export function getTechnologyRecordFilters(signal) {
  return client.get(`${base}/record-filters/`, { signal }).then(({ data }) => data);
}

export function getTechnologyRecord(id, signal) {
  return client.get(`${base}/records/${id}/`, { signal }).then(({ data }) => data);
}

export function createTechnologyRecord(record) {
  return client.post(`${base}/records/`, record).then(({ data }) => data);
}

export function updateTechnologyRecord(id, record) {
  return client.put(`${base}/records/${id}/`, record).then(({ data }) => data);
}
