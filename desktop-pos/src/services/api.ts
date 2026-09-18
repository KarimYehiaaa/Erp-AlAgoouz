import axios from 'axios';
import { getServerUrl, DEFAULT_SERVER_URL } from './config';

export const api = axios.create({
  baseURL: DEFAULT_SERVER_URL,
  timeout: 8000,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const currentBase = getServerUrl();
  config.baseURL = currentBase;

  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('pos_token') : null;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('pos_token');
        localStorage.removeItem('pos_user');
      }
      if (typeof window !== 'undefined' && window.location?.hash !== '#/login') {
        window.location.hash = '#/login';
      }
    }
    return Promise.reject(err);
  }
);
