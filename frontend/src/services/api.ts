
import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:5001/api",
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 15000,
});

// Attach JWT token automatically to protected requests.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("evidencevault_token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

// Handle expired or invalid authentication.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("evidencevault_token");
    }

    return Promise.reject(error);
  }
);

export default api;
