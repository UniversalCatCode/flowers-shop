import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import ruRU from 'antd/locale/ru_RU';

import Login from './pages/Login';
import MainLayout from './components/MainLayout';
import CategoriesPage from './pages/catalog/Categories';
import ProductsPage from './pages/catalog/Products';
import BatchesPage from './pages/inventory/Batches';
import RecipesPage from './pages/catalog/Recipes';
import OrdersPage from './pages/sales/Orders';
import ReceiptCreatePage from './pages/inventory/ReceiptCreate';
import SuppliersPage from './pages/catalog/Suppliers';
import WriteOffsPage from './pages/inventory/WriteOffs';
import DashboardPage from './pages/Dashboard';
import UsersPage from './pages/users/Users';
import AlertsPage from './pages/alerts/Alerts';
import PurchaseOrdersPage from './pages/inventory/PurchaseOrders';
import PurchaseOrderCreatePage from './pages/inventory/PurchaseOrderCreate';

const Dashboard = () => <h2>Добро пожаловать в систему управления цветочным магазином! 🌸</h2>;

const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const token = localStorage.getItem('access_token');
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

const App: React.FC = () => {
  return (
    <ConfigProvider locale={ruRU}>
      {/* Добавлен параметр future для отключения предупреждений v7 */}
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route
            path="/"
            element={
              <PrivateRoute>
                <MainLayout />
              </PrivateRoute>
            }
          >
            <Route path="/" element={<DashboardPage />} />
            <Route path="catalog/categories" element={<CategoriesPage />} /> 
            <Route path="catalog/products" element={<ProductsPage />} />
            <Route path="inventory/batches" element={<BatchesPage />} />
            <Route path="catalog/recipes" element={<RecipesPage />} />
            <Route path="sales/orders" element={<OrdersPage />} />
            <Route path="inventory/receipts/create" element={<ReceiptCreatePage />} />
            <Route path="catalog/suppliers" element={<SuppliersPage />} />
            <Route path="inventory/write-offs" element={<WriteOffsPage />} />
            <Route path="inventory/purchase-orders" element={<PurchaseOrdersPage />} />
            <Route path="inventory/purchase-orders/create" element={<PurchaseOrderCreatePage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="alerts" element={<AlertsPage />} />

          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  );
};

export default App;
