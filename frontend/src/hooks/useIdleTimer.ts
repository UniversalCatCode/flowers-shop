import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { message } from 'antd';

const REDIRECT_MIN = 10;
const LOGOUT_MIN = 20;
const HOME_PATH = '/';

export const useIdleTimer = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const navigateRef = useRef(navigate);
  const pathRef = useRef(location.pathname);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  navigateRef.current = navigate;
  pathRef.current = location.pathname;

  useEffect(() => {
    const resetTimers = () => {
      // Сброс обоих таймеров при любой активности
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
      if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);

      // Таймер редиректа (только если не на главной)
      redirectTimerRef.current = setTimeout(() => {
        if (pathRef.current !== HOME_PATH && pathRef.current !== '/login') {
          navigateRef.current(HOME_PATH);
        }
      }, REDIRECT_MIN * 60 * 1000);

      // Таймер логаута (всегда)
      logoutTimerRef.current = setTimeout(() => {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        message.warning('Сессия завершена из-за неактивности');
        navigateRef.current('/login');
      }, LOGOUT_MIN * 60 * 1000);
    };

    const events = ['mousemove', 'keydown', 'touchstart'];
    events.forEach(e => window.addEventListener(e, resetTimers));
    resetTimers();

    return () => {
      events.forEach(e => window.removeEventListener(e, resetTimers));
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
      if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    };
  }, []);
};
