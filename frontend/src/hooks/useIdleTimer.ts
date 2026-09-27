import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { message } from 'antd';

export const useIdleTimer = (timeoutMinutes: number = 30) => {
  const navigate = useNavigate();
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Функция выхода из системы
  const handleLogout = useCallback(() => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    message.warning('Сессия завершена из-за неактивности');
    navigate('/login');
  }, [navigate]);

  // Функция сброса таймера
  const resetTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    // Устанавливаем новый таймер (минуты * 60 секунд * 1000 миллисекунд)
    timerRef.current = setTimeout(handleLogout, timeoutMinutes * 60 * 1000);
  }, [handleLogout, timeoutMinutes]);

  useEffect(() => {
    // События, которые считаются "активностью" пользователя
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    
    // При любом из этих событий сбрасываем таймер
    events.forEach(event => window.addEventListener(event, resetTimer));
    
    // Запускаем таймер при первом рендере компонента
    resetTimer();

    // Очистка при закрытии/размонтировании компонента (чтобы не было утечек памяти)
    return () => {
      events.forEach(event => window.removeEventListener(event, resetTimer));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [resetTimer]);
};
