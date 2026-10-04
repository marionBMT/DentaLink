import axios from 'axios';

const api = axios.create({ baseURL: 'http://localhost:5000/api' });

api.interceptors.request.use(config => {
    const token = localStorage.getItem('token');
    if (token) {
        // Using backticks here to properly inject the token!
        config.headers.Authorization = `Bearer ${token}`; 
    }
    return config;
});

export default api;