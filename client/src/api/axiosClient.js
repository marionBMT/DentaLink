import axios from 'axios';

const api = axios.create({ baseURL: 'https://dentalink-backend-34zx.onrender.com/api' });


api.interceptors.request.use(config => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`; 
    }
    return config;
});


api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    
    if (error.response && error.response.status === 403 && error.response.data.forceLogout) {
      
      localStorage.clear();
      
      alert("Your session has been terminated because your account was archived.");
      window.location.href = '/login'; 
    }
    return Promise.reject(error);
  }
);

export default api;