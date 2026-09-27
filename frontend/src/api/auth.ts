import apiClient from './client';
import { TokenResponse, User } from '../types/api';

export const authApi = {
  // Авторизация
  login: async (username: string, password: string): Promise<TokenResponse> => {
    // Примечание: если твой эндпоинт называется /token и принимает form-data, 
    // код нужно будет чуть изменить. Пока используем стандартный JSON POST.
    const response = await apiClient.post<TokenResponse>('/users/login', {
      username,
      password,
    });
    return response.data;
  },

  // Получение данных текущего пользователя
  getCurrentUser: async (): Promise<User> => {
    const response = await apiClient.get<User>('/users/me');
    return response.data;
  },

  // Выход из системы
  logout: () => {
    localStorage.removeItem('access_token');
    window.location.href = '/login';
  },
};
