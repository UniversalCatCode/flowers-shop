import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

const apiClient = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

let isRefreshing = false;
let failedQueue: { resolve: (value?: any) => void; reject: (reason?: any) => void }[] = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach(prom => {
    if (error) prom.reject(error);
    else prom.resolve(token);
  });
  failedQueue = [];
};

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // 1. Сначала логируем ЛЮБУЮ ошибку
    console.log('🔴 API Error пойман:', {
      url: originalRequest?.url,
      status: error.response?.status,
      method: originalRequest?.method,
    });

    // 2. Обрабатываем только 401 и только если это не повторный запрос
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      console.log('🔄 Обнаружен 401, пытаемся обновить токен для:', originalRequest.url);
      
      if (isRefreshing) {
        console.log('⏳ Обновление уже идет, ставим запрос в очередь');
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(token => {
          originalRequest.headers['Authorization'] = 'Bearer ' + token;
          return apiClient(originalRequest);
        }).catch(err => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;
      const refreshToken = localStorage.getItem('refresh_token');

      if (!refreshToken) {
        console.log('❌ Нет refresh_token, редирект на логин');
        localStorage.clear();
        window.location.href = '/login';
        return Promise.reject(error);
      }

      try {
        console.log('📤 Отправляем запрос на /users/refresh');
        const response = await apiClient.post('/users/refresh', { 
          refresh_token: refreshToken 
        });
        
        const { access_token, refresh_token: new_refresh_token } = response.data;
        console.log('✅ Токен успешно обновлен!');

        localStorage.setItem('access_token', access_token);
        localStorage.setItem('refresh_token', new_refresh_token);

        processQueue(null, access_token);
        originalRequest.headers['Authorization'] = 'Bearer ' + access_token;
        
        console.log('🔁 Повторяем исходный запрос:', originalRequest.url);
        return apiClient(originalRequest);
        
      } catch (refreshError) {
        console.log('❌ Не удалось обновить токен (refresh тоже протух):', refreshError);
        processQueue(refreshError, null);
        localStorage.clear();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }
    
    // Если это не 401 или запрос уже был повторен, просто отклоняем
    return Promise.reject(error);
  }
);

export default apiClient;
