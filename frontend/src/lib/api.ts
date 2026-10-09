import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('aegislog_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Handle 401 globally — redirect to login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('aegislog_token');
      localStorage.removeItem('aegislog_user');
      // eslint-disable-next-line @next/next/no-assign-module-variable
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;

// ────────── Auth ──────────
export const authApi = {
  login: (username: string, password: string) =>
    api.post('/api/auth/login', { username, password }),
  logout: () => api.post('/api/auth/logout'),
  me: () => api.get('/api/auth/me'),
};

// ────────── Dashboard ──────────
export const dashboardApi = {
  stats: () => api.get('/api/dashboard/stats'),
  timeline: (hours?: number) => api.get('/api/dashboard/timeline', { params: { hours } }),
  riskDistribution: () => api.get('/api/dashboard/risk-distribution'),
  recentThreats: (limit?: number) => api.get('/api/dashboard/recent-threats', { params: { limit } }),
  eventTypes: () => api.get('/api/dashboard/event-types'),
};

// ────────── Logs ──────────
export const logsApi = {
  upload: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/api/logs/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  list: (params?: Record<string, unknown>) => api.get('/api/logs', { params }),
  get: (id: string) => api.get(`/api/logs/${id}`),
};

// ────────── Anomalies ──────────
export const anomaliesApi = {
  list: (params?: Record<string, unknown>) => api.get('/api/anomalies', { params }),
  get: (id: string) => api.get(`/api/anomalies/${id}`),
};

// ────────── Alerts ──────────
export const alertsApi = {
  list: (params?: Record<string, unknown>) => api.get('/api/alerts', { params }),
  get: (id: string) => api.get(`/api/alerts/${id}`),
  update: (id: string, data: Record<string, unknown>) => api.patch(`/api/alerts/${id}`, data),
};

// ────────── Investigations ──────────
export const investigationsApi = {
  create: (data: { alert_id: string; anomaly_id: string; notes?: string }) =>
    api.post('/api/investigations', data),
  list: (params?: Record<string, unknown>) => api.get('/api/investigations', { params }),
  get: (id: string) => api.get(`/api/investigations/${id}`),
  timeline: (id: string, windowMinutes?: number) =>
    api.get(`/api/investigations/${id}/timeline`, { params: { window_minutes: windowMinutes } }),
  update: (id: string, data: Record<string, unknown>) => api.patch(`/api/investigations/${id}`, data),
};

// ────────── Models ──────────
export const modelsApi = {
  status: () => api.get('/api/models/status'),
  list: () => api.get('/api/models'),
  train: (contamination?: number) => api.post('/api/models/train', { contamination }),
};

// ────────── Users ──────────
export const usersApi = {
  list: () => api.get('/api/users'),
  create: (data: Record<string, unknown>) => api.post('/api/users', data),
  update: (id: string, data: Record<string, unknown>) => api.patch(`/api/users/${id}`, data),
};

// ────────── Audit Logs ──────────
export const auditApi = {
  list: (params?: Record<string, unknown>) => api.get('/api/audit-logs', { params }),
};

// ────────── Reports ──────────
export const reportsApi = {
  summary: (params?: Record<string, unknown>) => api.get('/api/reports/summary', { params }),
  exportCsv: (params?: Record<string, unknown>) =>
    api.get('/api/reports/export/anomalies', { params, responseType: 'blob' }),
};

// ────────── Health ──────────
export const healthApi = {
  check: () => api.get('/api/health'),
};
