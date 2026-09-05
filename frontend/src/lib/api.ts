import axios from 'axios';
import { auth } from './firebase';

// Validate API URL
const apiUrl = process.env.NEXT_PUBLIC_API_URL;
if (!apiUrl) {
  console.error('❌ NEXT_PUBLIC_API_URL is not defined in .env.local');
  console.error('Please create frontend/.env.local with:');
  console.error('NEXT_PUBLIC_API_URL=http://localhost:3000/api');
}

console.log('🔗 API URL:', apiUrl);

const api = axios.create({
  baseURL: apiUrl,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000, // 10 seconds timeout
});

// Add auth token to requests
api.interceptors.request.use(async (config) => {
  const user = auth.currentUser;
  if (user) {
    const token = await user.getIdToken();
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Log detailed error information
    if (error.code === 'ERR_NETWORK' || error.code === 'ECONNREFUSED') {
      console.error('❌ Cannot connect to backend API');
      console.error('Backend URL:', apiUrl);
      console.error('Make sure the backend is running: cd backend && npm run dev');
    }
    
    if (error.response?.status === 401) {
      // Redirect to login
      window.location.href = '/login';
    }
    
    return Promise.reject(error);
  }
);

export default api;
