import React, { useEffect, useState } from 'react';
import { 
  Table, Button, Space, Tag, message, Card, Modal, Form, 
  Input, Select, InputNumber, Tabs, Typography, Descriptions,
  Popconfirm, Alert, Badge, Tooltip
} from 'antd';
import { 
  PlusOutlined, ReloadOutlined, EyeOutlined, 
  CheckCircleOutlined, CloseCircleOutlined, 
  SendOutlined, RollbackOutlined, WarningOutlined
} from '@ant-design/icons';
import apiClient from '../../api/client';
import { Product } from '../../types/api';
import { authApi } from '../../api/auth';
import dayjs from 'dayjs';

const { Text, Title } = Typography;
const { Option } = Select;
const { TextArea } = Input;

interface SaleItem {
  id: number;
  product_id: number;
  quantity: number;
  unit_price: number;
  total_price: number;
  status: string;
  batch_id: number | null;
}

interface Sale {
  id: number;
  sale_number: string;
  status: string;
  total_amount: number;
  final_amount: number;
  customer_name: string | null;
  customer_phone: string | null;
  payment_method: string | null;
  notes: string | null;
  assembly_started_at: string | null;
  assembly_completed_at: string | null;
  shipped_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  returned_at: string | null;
  return_reason: string | null;
  items: SaleItem[];
  created_at: string;
}

interface OrderItemInput {
  product_id: number;
  quantity: number;
  unit_price: number;
}

const OrdersPage: React.FC = () => {
  const [orders, setOrders] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeTab, setActiveTab] = useState('all');
  
  // Модалки
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  
  const [selectedOrder, setSelectedOrder] = useState<Sale | null>(null);
  const [createForm] = Form.useForm();
  const [cancelForm] = Form.useForm();
  const [returnForm] = Form.useForm();
  
  const [orderItems, setOrderItems] = useState<OrderItemInput[]>([]);

  const [currentUser, setCurrentUser] = useState<any>(null);
  
  // Загружаем данные пользователя при открытии страницы
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const userData = await authApi.getCurrentUser();
        setCurrentUser(userData);
      } catch (error) {
        console.error('Не удалось загрузить данные пользователя', error);
      }
    };
    fetchUser();
  }, []);

  // Список ролей, которым разрешено менять цену (добавлены варианты на английском и русском)
  const allowedRolesToEditPrice = ['admin', 'senior_florist', 'manager', 'старший флорист', 'администратор', 'админ'];
  
  // Получаем роль, приводим к нижнему регистру для надежного сравнения
  const userRole = (currentUser?.role_name || currentUser?.role || '').toLowerCase();
  
  // Разрешаем редактирование ТОЛЬКО если пользователь загружен И его роль в списке
  const canEditPrice = currentUser ? allowedRolesToEditPrice.some(r => userRole.includes(r)) : false;


  const [assemblyAlerts, setAssemblyAlerts] = useState<any>(null);
  const [isAssemblyAlertModalOpen, setIsAssemblyAlertModalOpen] = useState(false);

  const formatNumber = (val: any, decimals: number = 2) => {
    const num = Number(val);
    return isNaN(num) ? '—' : num.toFixed(decimals);
  };

  const getStatusColor = (status: string) => {
    const map: any = {
      accepted: 'blue',
      assembling: 'processing',
      assembled: 'cyan',
      shipped: 'purple',
      completed: 'success',
      cancelled: 'default',
      returned: 'warning'
    };
    return map[status] || 'default';
  };

  const getStatusLabel = (status: string) => {
    const map: any = {
      accepted: 'Принят',
      assembling: 'В сборке',
      assembled: 'Собран',
      shipped: 'Отгружен',
      completed: 'Закрыт',
      cancelled: 'Отменён',
      returned: 'Возврат'
    };
    return map[status] || status;
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [ordersRes, productsRes] = await Promise.all([
        apiClient.get<any>('/sales?limit=500'),
        apiClient.get<any>('/catalog/products?limit=500'),
      ]);

      const ords = Array.isArray(ordersRes.data) ? ordersRes.data : (ordersRes.data?.items || []);
      const prods = Array.isArray(productsRes.data) ? productsRes.data : (productsRes.data?.items || []);

      setOrders(ords);
      setProducts(prods);
    } catch (error: any) {
      message.error('Не удалось загрузить данные.');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);
  
  const filteredOrders = activeTab === 'all' 
    ? orders 
    : orders.filter(o => o.status === activeTab);

  // ============ СОЗДАНИЕ ЗАКАЗА ============
  const handleCreateOrder = () => {
    createForm.resetFields();
    setOrderItems([]);
    setIsCreateModalOpen(true);
  };

  const handleAddItem = () => {
    setOrderItems([...orderItems, { product_id: 0, quantity: 1, unit_price: 0 }]);
  };

  const handleUpdateItem = (index: number, field: keyof OrderItemInput, value: any) => {
    const newItems = [...orderItems];
    
    if (field === 'product_id' && value) {
      // При выборе товара автоматически подставляем его цену продажи
      const product = products.find(p => p.id === value);
      if (product) {
        newItems[index].product_id = value;
        newItems[index].unit_price = product.selling_price || 0; // === АВТО-ЦЕНА ===
      }
    } else if (field === 'unit_price') {
      // При ручном изменении цены проверяем, чтобы она не была ниже закупки
      const product = products.find(p => p.id === newItems[index].product_id);
      const purchasePrice = product?.purchase_price || 0;
      
      if (value < purchasePrice) {
        message.warning(`⚠️ Цена не может быть ниже закупки (${purchasePrice} ₽)!`);
        return; // Прерываем обновление, оставляем старое значение
      }
      newItems[index].unit_price = value;
    } else {
      newItems[index] = { ...newItems[index], [field]: value };
    }
    
    setOrderItems(newItems);
  };


  const handleRemoveItem = (index: number) => {
    setOrderItems(orderItems.filter((_, i) => i !== index));
  };

  const handleSaveOrder = async (values: any) => {
    if (orderItems.length === 0) {
      message.error('Добавьте хотя бы одну позицию');
      return;
    }

    const invalidItems = orderItems.filter(item => !item.product_id || item.quantity <= 0);
    if (invalidItems.length > 0) {
      message.error('Заполните все позиции корректно');
      return;
    }

    try {
      const payload = {
        sale_number: values.sale_number || `ORD-${Date.now()}`,
        customer_name: values.customer_name,
        customer_phone: values.customer_phone,
        payment_method: values.payment_method,
        notes: values.notes,
        items: orderItems.map(item => ({
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
        })),
      };

      await apiClient.post('/sales', payload);
      message.success('Заказ создан');
      setIsCreateModalOpen(false);
      createForm.resetFields();
      setOrderItems([]);
      fetchData();
    } catch (error: any) {
      message.error(error.response?.data?.detail || 'Ошибка при создании заказа');
    }
  };

  // ============ ДЕЙСТВИЯ ПО ЖИЗНЕННОМУ ЦИКЛУ ============
  const handleStartAssembly = async (order: Sale) => {
    try {
      // Сначала проверяем ресурсы
      const checkResponse = await apiClient.get<any>(`/sales/${order.id}/check_resources`);
      const resources = checkResponse.data;
  
      if (!resources.can_assemble) {
        // Показываем модалку с алертами
        setAssemblyAlerts(resources);
        setIsAssemblyAlertModalOpen(true);
        return;
      }
  
      // Если всё ок — начинаем сборку
      await apiClient.post(`/sales/${order.id}/assemble`);
      message.success('Сборка начата');
      fetchData();
    } catch (error: any) {
      message.error(error.response?.data?.detail || 'Ошибка при начале сборки');
    }
  };
  

  const handleCompleteAssembly = async (order: Sale) => {
    if (isCompletingAssembly) {
      console.log('⏳ Already completing or modal open, skipping');
      return;
    }
    setIsCompletingAssembly(true);
    try {
      await apiClient.post(`/sales/${order.id}/complete`);
      message.success('Сборка завершена, остатки списаны');
      fetchData();
    } catch (error: any) {
      message.error(error.response?.data?.detail || 'Ошибка при завершении сборки');
    } finally {
      setIsCompletingAssembly(false);
    }
  };

  const handleShip = async (order: Sale) => {
    try {
      await apiClient.post(`/sales/${order.id}/ship`);
      message.success('Заказ отгружен');
      fetchData();
    } catch (error: any) {
      message.error(error.response?.data?.detail || 'Ошибка при отгрузке');
    }
  };

  const handleCompleteDelivery = async (order: Sale) => {
    try {
      await apiClient.post(`/sales/${order.id}/complete_delivery`);
      message.success('Доставка завершена');
      fetchData();
    } catch (error: any) {
      message.error(error.response?.data?.detail || 'Ошибка при завершении доставки');
    }
  };

  const handleCancel = (order: Sale) => {
    setSelectedOrder(order);
    cancelForm.resetFields();
    setIsCancelModalOpen(true);
  };

  const handleConfirmCancel = async (values: any) => {
    if (!selectedOrder) return;
    try {
      await apiClient.post(`/sales/${selectedOrder.id}/cancel`, {
        reason: values.reason || 'Отменено пользователем',
      });
      message.success('Заказ отменён');
      setIsCancelModalOpen(false);
      cancelForm.resetFields();
      setSelectedOrder(null);
      fetchData();
    } catch (error: any) {
      message.error(error.response?.data?.detail || 'Ошибка при отмене');
    }
  };

  const handleReturn = (order: Sale) => {
    setSelectedOrder(order);
    returnForm.resetFields();
    setIsReturnModalOpen(true);
  };

  const handleConfirmReturn = async (values: any) => {
    if (!selectedOrder) return;
    try {
      await apiClient.post(`/sales/${selectedOrder.id}/return`, {
        reason: values.reason || 'Возврат от клиента',
      });
      message.success('Возврат оформлен');
      setIsReturnModalOpen(false);
      returnForm.resetFields();
      setSelectedOrder(null);
      fetchData();
    } catch (error: any) {
      message.error(error.response?.data?.detail || 'Ошибка при оформлении возврата');
    }
  };

  const showOrderDetails = (order: Sale) => {
    setSelectedOrder(order);
    setIsDetailModalOpen(true);
  };

  const getProductName = (productId: number) => {
    const prod = products.find(p => p.id === productId);
    return prod ? `${prod.name} (${prod.sku})` : `Товар #${productId}`;
  };

  const [isCompletingAssembly, setIsCompletingAssembly] = useState(false);


  
  // ============ КОЛОНКИ ТАБЛИЦЫ ============
  const columns = [
    {
      title: '№ Заказа',
      dataIndex: 'sale_number',
      key: 'sale_number',
      width: 150,
    },
    {
      title: 'Статус',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: string) => (
        <Tag color={getStatusColor(status)}>{getStatusLabel(status)}</Tag>
      ),
    },
    {
      title: 'Клиент',
      dataIndex: 'customer_name',
      key: 'customer_name',
      width: 180,
      render: (name: string | null) => name || '—',
    },
    {
      title: 'Сумма',
      dataIndex: 'final_amount',
      key: 'final_amount',
      width: 120,
      render: (val: number) => `${formatNumber(val)} ₽`,
    },
    {
      title: 'Создан',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (val: string) => dayjs(val).format('DD.MM.YYYY HH:mm'),
    },
    {
      title: 'Действия',
      key: 'actions',
      width: 250,
      render: (_: any, record: Sale) => (
        <Space size="small">
          <Button 
            type="link" 
            size="small"
            icon={<EyeOutlined />}
            onClick={() => showOrderDetails(record)}
          >
            Детали
          </Button>
          
          {record.status === 'accepted' && (
            <Button 
              type="link" 
              size="small"
              icon={<CheckCircleOutlined />}
              onClick={() => handleStartAssembly(record)}
            >
              Начать сборку
            </Button>
          )}
          
          {record.status === 'assembling' && (
            <Button 
              type="link" 
              size="small"
              icon={<CheckCircleOutlined />}
              onClick={() => handleCompleteAssembly(record)}
            >
              Завершить сборку
            </Button>
          )}
          
          {record.status === 'assembled' && (
            <Button 
              type="link" 
              size="small"
              icon={<SendOutlined />}
              onClick={() => handleShip(record)}
            >
              Отгрузить
            </Button>
          )}
          
          {record.status === 'shipped' && (
            <Button 
              type="link" 
              size="small"
              icon={<CheckCircleOutlined />}
              onClick={() => handleCompleteDelivery(record)}
            >
              Завершить
            </Button>
          )}
          
          {record.status === 'completed' && (
            <Button 
              type="link" 
              size="small"
              danger
              icon={<RollbackOutlined />}
              onClick={() => handleReturn(record)}
            >
              Возврат
            </Button>
          )}
          
          {['assembling', 'assembled', 'shipped'].includes(record.status) && (
            <Button 
              type="link" 
              size="small"
              danger
              icon={<CloseCircleOutlined />}
              onClick={() => handleCancel(record)}
            >
              Отменить
            </Button>
          )}
        </Space>
      ),
    },
  ];

  // ============ ВКЛАДКИ ============
  const tabItems = [
    { key: 'all', label: <span>Все <Badge count={orders.length} style={{ backgroundColor: '#1890ff' }} /></span> },
    { key: 'accepted', label: <span>Принятые <Badge count={orders.filter(o => o.status === 'accepted').length} style={{ backgroundColor: '#1890ff' }} /></span> },
    { key: 'assembling', label: <span>В сборке <Badge count={orders.filter(o => o.status === 'assembling').length} style={{ backgroundColor: '#1890ff' }} /></span> },
    { key: 'assembled', label: <span>Собраны <Badge count={orders.filter(o => o.status === 'assembled').length} style={{ backgroundColor: '#1890ff' }} /></span> },
    { key: 'shipped', label: <span>Отгружены <Badge count={orders.filter(o => o.status === 'shipped').length} style={{ backgroundColor: '#722ed1' }} /></span> },
    { key: 'completed', label: <span>Закрыты <Badge count={orders.filter(o => o.status === 'completed').length} style={{ backgroundColor: '#52c41a' }} /></span> },
    { key: 'cancelled', label: <span>Отменены <Badge count={orders.filter(o => o.status === 'cancelled').length} style={{ backgroundColor: '#d9d9d9' }} /></span> },
    { key: 'returned', label: <span>Возвраты <Badge count={orders.filter(o => o.status === 'returned').length} style={{ backgroundColor: '#faad14' }} /></span> },
  ];

  return (
    <>
      <Card 
        title="Заказы"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>
              Обновить
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateOrder}>
              Создать заказ
            </Button>
          </Space>
        }
      >
        <Tabs 
          activeKey={activeTab} 
          onChange={setActiveTab} 
          items={tabItems}
          style={{ marginBottom: 16 }}
        />
        
        <Table 
          columns={columns} 
          dataSource={filteredOrders} 
          rowKey="id" 
          loading={loading}
          pagination={{ 
            pageSize: 20, 
            showSizeChanger: true,
            showTotal: (total, range) => `${range[0]}-${range[1]} из ${total} заказов`,
          }}
        />
      </Card>

      {/* Модалка создания заказа */}
      <Modal
        title="Создать заказ"
        open={isCreateModalOpen}
        onCancel={() => {
          setIsCreateModalOpen(false);
          createForm.resetFields();
          setOrderItems([]);
        }}
        footer={null}
        width={800}
      >
        <Form form={createForm} layout="vertical" onFinish={handleSaveOrder}>
          <Form.Item name="sale_number" label="Номер заказа">
            <Input placeholder="Автогенерируется, если не указан" />
          </Form.Item>

          <Space style={{ width: '100%' }} size="large">
            <Form.Item name="customer_name" label="Имя клиента" style={{ flex: 1 }}>
              <Input placeholder="Иван Иванов" />
            </Form.Item>
            <Form.Item name="customer_phone" label="Телефон" style={{ flex: 1 }}>
              <Input placeholder="+7 (999) 123-45-67" />
            </Form.Item>
          </Space>

          <Form.Item name="payment_method" label="Способ оплаты">
            <Select placeholder="Выберите способ оплаты" allowClear>
              <Option value="cash">Наличные</Option>
              <Option value="card">Карта</Option>
              <Option value="transfer">Перевод</Option>
            </Select>
          </Form.Item>

          <Card title="Позиции заказа" size="small" style={{ marginBottom: 16 }}>
            {orderItems.map((item, index) => (
              <Space key={index} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                <Select
                  showSearch
                  optionFilterProp="children"
                  placeholder="Выберите товар"
                  style={{ width: 300 }}
                  value={item.product_id || undefined}
                  onChange={(val) => handleUpdateItem(index, 'product_id', val)}
                >
                  {products.map(p => (
                    <Option key={p.id} value={p.id}>{p.name} ({p.sku})</Option>
                  ))}
                </Select>
                <InputNumber
                  min={0.01}
                  step={0.1}
                  placeholder="Кол-во"
                  value={item.quantity}
                  onChange={(val) => handleUpdateItem(index, 'quantity', val || 0)}
                />
                {(() => {
                  const product = products.find(p => p.id === item.product_id);
                  const minPrice = product?.purchase_price || 0;
                  
                  return (
                    <Space.Compact style={{ width: 140 }}>
                      <InputNumber
                        min={minPrice}
                        step={10}
                        placeholder="Цена"
                        value={item.unit_price}
                        disabled={!canEditPrice}
                        onChange={(val) => handleUpdateItem(index, 'unit_price', val || 0)}
                        style={{ width: '100%' }}
                      />
                      <Input 
                        disabled 
                        value="₽" 
                        style={{ width: 40, textAlign: 'center', color: 'rgba(0, 0, 0, 0.85)' }} 
                      />
                    </Space.Compact>
                  );
                })()}


                <Button danger onClick={() => handleRemoveItem(index)}>Удалить</Button>
              </Space>
            ))}
            <Button type="dashed" onClick={handleAddItem} block icon={<PlusOutlined />}>
              Добавить позицию
            </Button>
          </Card>

          <Form.Item name="notes" label="Примечания">
            <TextArea rows={2} placeholder="Дополнительная информация" />
          </Form.Item>

          <Form.Item style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={() => {
                setIsCreateModalOpen(false);
                createForm.resetFields();
                setOrderItems([]);
              }}>Отмена</Button>
              <Button type="primary" htmlType="submit">Создать заказ</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Модалка деталей заказа */}
      <Modal
        title={`Заказ #${selectedOrder?.sale_number}`}
        open={isDetailModalOpen}
        onCancel={() => {
          setIsDetailModalOpen(false);
          setSelectedOrder(null);
        }}
        footer={null}
        width={700}
      >
        {selectedOrder && (
          <>
            <Descriptions bordered column={2} size="small">
              <Descriptions.Item label="Статус" span={2}>
                <Tag color={getStatusColor(selectedOrder.status)}>
                  {getStatusLabel(selectedOrder.status)}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Клиент">
                {selectedOrder.customer_name || '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Телефон">
                {selectedOrder.customer_phone || '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Сумма">
                {formatNumber(selectedOrder.final_amount)} ₽
              </Descriptions.Item>
              <Descriptions.Item label="Способ оплаты">
                {selectedOrder.payment_method || '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Создан">
                {dayjs(selectedOrder.created_at).format('DD.MM.YYYY HH:mm')}
              </Descriptions.Item>
              <Descriptions.Item label="Сборка начата">
                {selectedOrder.assembly_started_at 
                  ? dayjs(selectedOrder.assembly_started_at).format('DD.MM.YYYY HH:mm')
                  : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Сборка завершена">
                {selectedOrder.assembly_completed_at 
                  ? dayjs(selectedOrder.assembly_completed_at).format('DD.MM.YYYY HH:mm')
                  : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Отгружен">
                {selectedOrder.shipped_at 
                  ? dayjs(selectedOrder.shipped_at).format('DD.MM.YYYY HH:mm')
                  : '—'}
              </Descriptions.Item>
              {selectedOrder.cancellation_reason && (
                <Descriptions.Item label="Причина отмены" span={2}>
                  {selectedOrder.cancellation_reason}
                </Descriptions.Item>
              )}
              {selectedOrder.return_reason && (
                <Descriptions.Item label="Причина возврата" span={2}>
                  {selectedOrder.return_reason}
                </Descriptions.Item>
              )}
            </Descriptions>

            <Title level={5} style={{ marginTop: 16 }}>Позиции</Title>
            <Table
              size="small"
              dataSource={selectedOrder.items}
              rowKey="id"
              pagination={false}
              columns={[
                { title: 'Товар', key: 'product', render: (_, r) => getProductName(r.product_id) },
                { title: 'Кол-во', dataIndex: 'quantity', width: 80 },
                { title: 'Цена', dataIndex: 'unit_price', width: 100, render: (v) => `${formatNumber(v)} ₽` },
                { title: 'Сумма', dataIndex: 'total_price', width: 120, render: (v) => `${formatNumber(v)} ₽` },
                { 
                  title: 'Статус', 
                  dataIndex: 'status', 
                  width: 100,
                  render: (s) => <Tag>{s === 'assembled' ? 'Собрано' : 'Ожидает'}</Tag>
                },
              ]}
            />

            {selectedOrder.notes && (
              <Alert 
                message="Примечания" 
                description={selectedOrder.notes} 
                type="info" 
                style={{ marginTop: 16 }}
              />
            )}
          </>
        )}
      </Modal>

      {/* Модалка отмены */}
      <Modal
        title="Отменить заказ"
        open={isCancelModalOpen}
        onCancel={() => {
          setIsCancelModalOpen(false);
          cancelForm.resetFields();
          setSelectedOrder(null);
        }}
        footer={null}
      >
        <Form form={cancelForm} layout="vertical" onFinish={handleConfirmCancel}>
          <Form.Item name="reason" label="Причина отмены" rules={[{ required: true }]}>
            <TextArea rows={3} placeholder="Укажите причину отмены" />
          </Form.Item>
          <Form.Item style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={() => {
                setIsCancelModalOpen(false);
                cancelForm.resetFields();
                setSelectedOrder(null);
              }}>Отмена</Button>
              <Button type="primary" danger htmlType="submit">Отменить заказ</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Модалка возврата */}
      <Modal
        title="Оформить возврат"
        open={isReturnModalOpen}
        onCancel={() => {
          setIsReturnModalOpen(false);
          returnForm.resetFields();
          setSelectedOrder(null);
        }}
        footer={null}
      >
        <Form form={returnForm} layout="vertical" onFinish={handleConfirmReturn}>
          <Form.Item name="reason" label="Причина возврата" rules={[{ required: true }]}>
            <TextArea rows={3} placeholder="Укажите причину возврата" />
          </Form.Item>
          <Form.Item style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={() => {
                setIsReturnModalOpen(false);
                returnForm.resetFields();
                setSelectedOrder(null);
              }}>Отмена</Button>
              <Button type="primary" htmlType="submit">Оформить возврат</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
      {/* Модалка алертов при сборке */}
      <Modal
        title="Проверка ресурсов для сборки"
        open={isAssemblyAlertModalOpen}
        onCancel={() => {
          setIsAssemblyAlertModalOpen(false);
          setAssemblyAlerts(null);
        }}
        footer={null}
        width={700}
      >
        {assemblyAlerts && (
          <>
            {assemblyAlerts.flower_shortages.length > 0 && (
          <>
            <Title level={5} style={{ color: '#ff4d4f' }}>
              <WarningOutlined /> Не хватает цветов:
            </Title>
            <Table
              size="small"
              dataSource={assemblyAlerts.flower_shortages}
              rowKey="product_id"
              pagination={false}
              columns={[
                { title: 'Товар', dataIndex: 'product_name' },
                { title: 'Нужно', dataIndex: 'required_qty', width: 80 },
                { title: 'Есть', dataIndex: 'available_qty', width: 80 },
                { 
                  title: 'Не хватает', 
                  dataIndex: 'shortage_qty', 
                  width: 100,
                  render: (val) => <Text type="danger">{val}</Text>
                },
              ]}
            />
            <Alert
              message="Необходимо принять товар от поставщика"
              type="error"
              style={{ marginTop: 16 }}
            />
          </>
        )}

            {assemblyAlerts.packaging_shortages?.length > 0 && (
          <>
            <Title level={5} style={{ color: '#ff4d4f', marginTop: 16 }}>
              <WarningOutlined /> Не хватает упаковки:
            </Title>
            <Table
              size="small"
              dataSource={assemblyAlerts.packaging_shortages}
              rowKey="product_id"
              pagination={false}
              columns={[
                { title: 'Товар', dataIndex: 'product_name' },
                { title: 'Нужно', dataIndex: 'required_qty', width: 80 },
                { title: 'Есть', dataIndex: 'available_qty', width: 80 },
                { 
                  title: 'Не хватает', 
                  dataIndex: 'shortage_qty', 
                  width: 100,
                  render: (val) => <Text type="danger">{val}</Text>
                },
              ]}
            />
          </>
        )}

            {assemblyAlerts.consumable_shortages?.length > 0 && (
          <>
            <Title level={5} style={{ color: '#ff4d4f', marginTop: 16 }}>
              <WarningOutlined /> Не хватает расходников:
            </Title>
            <Table
              size="small"
              dataSource={assemblyAlerts.consumable_shortages}
              rowKey="product_id"
              pagination={false}
              columns={[
                { title: 'Товар', dataIndex: 'product_name' },
                { title: 'Нужно', dataIndex: 'required_qty', width: 80 },
                { title: 'Есть', dataIndex: 'available_qty', width: 80 },
                { 
                  title: 'Не хватает', 
                  dataIndex: 'shortage_qty', 
                  width: 100,
                  render: (val) => <Text type="danger">{val}</Text>
                },
              ]}
            />
          </>
        )}

      <div style={{ textAlign: 'right', marginTop: 24 }}>
        <Button onClick={() => {
          setIsAssemblyAlertModalOpen(false);
          setAssemblyAlerts(null);
        }}>
          Закрыть
        </Button>
      </div>
    </>
  )}
</Modal>


    </>
  );
};

export default OrdersPage;
