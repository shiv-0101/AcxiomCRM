import axios from 'axios';
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor — attach JWT token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('acxiom_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor — handle 401/403 globally
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('acxiom_token');
      localStorage.removeItem('acxiom_user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// ─── Auth API ─────────────────────────────────────────────────────────────────
export const authApi = {
  login: (data: { username: string; password: string }) =>
    apiClient.post<{ success: boolean; message?: string; token: string; user: any }>('/auth/login', data),

  logout: () => apiClient.post('/auth/logout'),

  register: (data: any) => apiClient.post('/auth/register', data),

  getMe: () => apiClient.get('/auth/me'),
};

// ─── Dashboard API ────────────────────────────────────────────────────────────
export const dashboardApi = {
  getDashboard: () => apiClient.get('/dashboard'),
};

// ─── Customers API ────────────────────────────────────────────────────────────
export const customersApi = {
  list: (params?: any) => apiClient.get('/customers', { params }),
  get: (id: string) => apiClient.get(`/customers/${id}`),
  create: (data: any) => apiClient.post('/customers', data),
  update: (id: string, data: any) => apiClient.put(`/customers/${id}`, data),
  delete: (id: string) => apiClient.delete(`/customers/${id}`),
};

// ─── Leads API ────────────────────────────────────────────────────────────────
export const leadsApi = {
  list: (params?: any) => apiClient.get('/leads', { params }),
  get: (id: string) => apiClient.get(`/leads/${id}`),
  create: (data: any) => apiClient.post('/leads', data),
  update: (id: string, data: any) => apiClient.put(`/leads/${id}`, data),
  delete: (id: string) => apiClient.delete(`/leads/${id}`),
  convert: (id: string) => apiClient.post(`/leads/${id}/convert`),
};

// ─── Opportunities API ────────────────────────────────────────────────────────
export const opportunitiesApi = {
  list: (params?: any) => apiClient.get('/opportunities', { params }),
  get: (id: string) => apiClient.get(`/opportunities/${id}`),
  create: (data: any) => apiClient.post('/opportunities', data),
  update: (id: string, data: any) => apiClient.put(`/opportunities/${id}`, data),
  delete: (id: string) => apiClient.delete(`/opportunities/${id}`),
};

// ─── Follow-Ups API ───────────────────────────────────────────────────────────
export const followUpsApi = {
  list: (params?: any) => apiClient.get('/followups', { params }),
  get: (id: string) => apiClient.get(`/followups/${id}`),
  create: (data: any) => apiClient.post('/followups', data),
  update: (id: string, data: any) => apiClient.put(`/followups/${id}`, data),
  delete: (id: string) => apiClient.delete(`/followups/${id}`),
};

// ─── Activities API ───────────────────────────────────────────────────────────
export const activitiesApi = {
  list: (params?: any) => apiClient.get('/activities', { params }),
  create: (data: any) => apiClient.post('/activities', data),
  update: (id: string, data: any) => apiClient.put(`/activities/${id}`, data),
  delete: (id: string) => apiClient.delete(`/activities/${id}`),
};

// ─── Users API ────────────────────────────────────────────────────────────────
export const usersApi = {
  list: (params?: any) => apiClient.get('/users', { params }),
  get: (id: string) => apiClient.get(`/users/${id}`),
  create: (data: any) => apiClient.post('/users', data),
  update: (id: string, data: any) => apiClient.put(`/users/${id}`, data),
  getRoles: () => apiClient.get('/users/roles/list'),
  getSalesExecutives: () => apiClient.get('/users/sales-executives'),
  resetPassword: (id: string, newPassword: string) => apiClient.post(`/users/${id}/reset-password`, { newPassword }),
  unlock: (id: string) => apiClient.post(`/users/${id}/unlock`),
};

// ─── Reports API ──────────────────────────────────────────────────────────────
export const reportsApi = {
  customers: (params?: any) => apiClient.get('/reports/customers', { params }),
  leads: (params?: any) => apiClient.get('/reports/leads', { params }),
  opportunities: (params?: any) => apiClient.get('/reports/opportunities', { params }),
  pipeline: () => apiClient.get('/reports/pipeline'),
  followups: (params?: any) => apiClient.get('/reports/followups', { params }),
  conversion: () => apiClient.get('/reports/conversion'),
  audit: (params?: any) => apiClient.get('/reports/audit', { params }),
  userActivity: () => apiClient.get('/reports/user-activity'),
};

export default apiClient;
