import axios from 'axios';

const BASE_URL = localStorage.getItem('pos_server_url') || 'http://localhost:3000/api/v1';

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 8000,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const currentBase = localStorage.getItem('pos_server_url');
  if (currentBase && config.baseURL !== currentBase) {
    config.baseURL = currentBase;
  }
  const token = localStorage.getItem('pos_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('pos_token');
      localStorage.removeItem('pos_user');
      if (window.location.hash !== '#/login') {
        window.location.hash = '#/login';
      }
    }
    return Promise.reject(err);
  }
);
