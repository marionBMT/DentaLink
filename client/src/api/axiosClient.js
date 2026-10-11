import axios from 'axios';

const api = axios.create({ baseURL: 'http://localhost:5000/api' });

// Request Interceptor: Attach token to every request
api.interceptors.request.use(config => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`; 
    }
    return config;
});

// --- NEW: Response Interceptor for Global Error Handling ---
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // Check if the backend sent our specific 403 forceLogout flag
    if (error.response && error.response.status === 403 && error.response.data.forceLogout) {
      // Clear their token and session data
      localStorage.clear();
      // Alert them and force a redirect to login
      alert("Your session has been terminated because your account was archived.");
      window.location.href = '/login'; 
    }
    return Promise.reject(error);
  }
);

export default api;