import React, { useState, useEffect } from 'react';
import { Layout, Menu, Button, Typography, message } from 'antd';
import { 
  AppstoreOutlined, 
  ShoppingOutlined, 
  TeamOutlined, 
  LogoutOutlined,
  DashboardOutlined,
  UserOutlined,
  BellOutlined
} from '@ant-design/icons';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { authApi } from '../api/auth';
import { User } from '../types/api';
import { useIdleTimer } from '../hooks/useIdleTimer';

const { Header, Sider, Content } = Layout;
const { Title, Text } = Typography;

const MainLayout: React.FC = () => {
  useIdleTimer(30); 
  const [user, setUser] = useState<User | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  

  // Загружаем данные пользователя при монтировании
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const userData = await authApi.getCurrentUser();
        setUser(userData);
      } catch (error) {
        message.error('Не удалось загрузить данные пользователя');
        authApi.logout();
      }
    };
    fetchUser();
  }, []);

  const menuItems = [
    {
      key: '/',
      icon: <DashboardOutlined />,
      label: 'Главная',
    },
    {
      key: '/alerts',
      icon: <BellOutlined />,
      label: 'Алерты',
    },    
    {
      key: '/users',
      icon: <UserOutlined />,
      label: 'Пользователи',
    },    
    {
      key: '/sales',
      icon: <ShoppingOutlined />,
      label: 'Продажи',
      children: [
        { key: '/sales/orders', label: 'Заказы' },

      ],
    },
    {
      key: '/catalog',
      icon: <AppstoreOutlined />,
      label: 'Справочники',
      children: [
        { key: '/catalog/categories', label: 'Категории' },
        { key: '/catalog/products', label: 'Товары' },
        { key: '/catalog/suppliers', label: 'Поставщики' },
      ],
    },
    {
      key: '/inventory',
      icon: <ShoppingOutlined />,
      label: 'Склад',
      children: [        { key: '/inventory/purchase-orders', label: 'Заказы поставщикам' },
        { key: '/inventory/batches', label: 'Партии' },
        { key: '/inventory/write-offs', label: 'Списания' },
      ],
    },
    {
      key: 'catalog/recipes',
      icon: <TeamOutlined />,
      label: 'Рецепты',
    },

  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider collapsible>
        <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
          <Title level={4} style={{ color: 'white', margin: 0 }}>🌸 Flower Shop</Title>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          defaultOpenKeys={['/catalog', '/inventory', '/sales']}
          items={menuItems}
          onClick={(e) => navigate(e.key)}
        />
      </Sider>
      
      <Layout>
        <Header style={{ 
          background: '#fff', 
          padding: '0 24px', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
        }}>
          <Title level={4} style={{ margin: 0 }}>Панель управления</Title>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span>
              Привет, {user?.full_name || user?.username}! 
              <Text type="secondary" style={{ marginLeft: 4, fontSize: '0.9em' }}>
                ({user?.role_name || 'Пользователь'})
              </Text>
            </span>
            <Button 
              type="text" 
              danger 
              icon={<LogoutOutlined />} 
              onClick={authApi.logout}
            >
              Выйти
            </Button>
          </div>

        </Header>
        
        <Content style={{ margin: '24px 16px', padding: 24, background: '#fff', borderRadius: 8 }}>
          {/* Здесь будут рендериться дочерние страницы (Outlet) */}
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};

export default MainLayout;
