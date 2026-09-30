import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Table, Card, Button, Space, Tag, message, Select, Input, DatePicker,
  Popconfirm, Typography, Tooltip, Statistic, Row, Col, Modal, Form, InputNumber, Alert
} from 'antd';
import {
  PlusOutlined, CheckOutlined, CloseOutlined, ShoppingCartOutlined,
  EyeOutlined, DollarOutlined, ReloadOutlined
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiClient from '../../api/client';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;

interface PurchaseOrderItem {
  id: number;
  product_id: number;
  product_name: string;
  product_sku: string;
  product_type?: string;
  ordered_qty: number;
  received_qty: number;
  remaining_qty: number;
  unit_price: number;
  notes?: string;
}

interface PurchaseOrderReceipt {
  id: number;
  receipt_number?: string;
  received_at: string;
  receiver_name?: string;
  status: string;
  items: any[];
}

interface PurchaseOrder {
  id: number;
  order_number: string;
  supplier_invoice_number?: string;
  invoice_date?: string;
  supplier_waybill_number?: string;
  supplier_id: number;
  supplier_name?: string;
  status: string;
  payment_status: string;
  mode: string;
  expected_date?: string;
  created_at: string;
  updated_at?: string;
  notes?: string;
  creator_name?: string;
  total_amount: number;
  received_amount: number;
  is_fully_received: boolean;
  items: PurchaseOrderItem[];
  receipts: PurchaseOrderReceipt[];
}

interface Supplier {
  id: number;
  name: string;
}

const statusConfig: Record<string, { color: string; label: string }> = {
  draft: { color: 'default', label: 'Черновик' },
  confirmed: { color: 'blue', label: 'Подтверждён' },
  received: { color: 'green', label: 'Принят' },
  cancelled: { color: 'red', label: 'Отменён' },
};

const paymentStatusConfig: Record<string, { color: string; label: string }> = {
  pending: { color: 'default', label: 'Не оплачен' },
  partial: { color: 'orange', label: 'Частично оплачен' },
  paid: { color: 'green', label: 'Оплачен' },
  deferred: { color: 'purple', label: 'Отсрочка' },
};

const PurchaseOrdersPage: React.FC = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  
  // Фильтры
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string | undefined>();
  const [supplierFilter, setSupplierFilter] = useState<number | undefined>();
  const [searchText, setSearchText] = useState('');
  
  // Пагинация
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  
  // Модалка приёмки
  const [receiveModalVisible, setReceiveModalVisible] = useState(false);
  const [receiveOrder, setReceiveOrder] = useState<PurchaseOrder | null>(null);
  const [receiveForm] = Form.useForm();
  
  // Модалка деталей
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [detailOrder, setDetailOrder] = useState<PurchaseOrder | null>(null);
  
  // Модалка подтверждения
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [confirmOrderId, setConfirmOrderId] = useState<number | null>(null);
  const [confirmForm] = Form.useForm();

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('limit', String(pageSize));
      params.append('offset', String((page - 1) * pageSize));
      if (statusFilter) params.append('status', statusFilter);
      if (paymentStatusFilter) params.append('payment_status', paymentStatusFilter);
      if (supplierFilter) params.append('supplier_id', String(supplierFilter));
      
      const response = await apiClient.get<any>(`/inventory/purchase-orders?${params.toString()}`);
      setOrders(response.data.items || []);
      setTotal(response.data.total || 0);
    } catch (error: any) {
      message.error('Не удалось загрузить заказы');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, statusFilter, paymentStatusFilter, supplierFilter]);

  const fetchSuppliers = async () => {
    try {
      const response = await apiClient.get<any>('/catalog/suppliers?limit=100');
      const items = Array.isArray(response.data) ? response.data : (response.data?.items || []);
      setSuppliers(items);
    } catch (error) {
      console.error('Не удалось загрузить поставщиков:', error);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const openConfirmModal = (orderId: number) => {
    setConfirmOrderId(orderId);
    confirmForm.resetFields();
    setConfirmModalVisible(true);
  };

  const handleConfirm = async () => {
    try {
      const values = await confirmForm.validateFields();
      await apiClient.post(`/inventory/purchase-orders/${confirmOrderId}/confirm`, {
        supplier_invoice_number: values.supplier_invoice_number,
        invoice_date: values.invoice_date ? values.invoice_date.format('YYYY-MM-DD') : null,
      });
      message.success('Заказ подтверждён');
      setConfirmModalVisible(false);
      confirmForm.resetFields();
      fetchOrders();
    } catch (error: any) {
      if (error.response?.data?.detail) {
        message.error(error.response.data.detail);
      }
    }
  };

  const handleCancel = async (orderId: number) => {
    try {
      await apiClient.post(`/inventory/purchase-orders/${orderId}/cancel`);
      message.success('Заказ отменён');
      fetchOrders();
    } catch (error: any) {
      message.error(error.response?.data?.detail || 'Ошибка при отмене');
    }
  };

  const openReceiveModal = (order: PurchaseOrder) => {
    setReceiveOrder(order);
    // Инициализируем форму с пустыми значениями
    const initialItems = order.items
      .filter(item => item.remaining_qty > 0)
      .map(item => ({
        product_id: item.product_id,
        product_name: item.product_name,
        product_type: item.product_type || 'unknown',
        ordered_qty: item.ordered_qty,
        received_qty: item.received_qty,
        remaining_qty: item.remaining_qty,
        quantity: 0,
        unit_price: item.unit_price,
      }));
    
    receiveForm.setFieldsValue({ items: initialItems });
    setReceiveModalVisible(true);
  };

  const handleReceive = async () => {
    try {
      const values = await receiveForm.validateFields();
      const items = values.items
        .filter((item: any) => item.quantity > 0)
        .map((item: any) => ({
          product_id: item.product_id,
          quantity: item.quantity,
          unit_type: item.unit_type || undefined,
          base_quantity: item.base_quantity || undefined,
          base_unit: item.base_unit || undefined,
          received_quality_pct: item.received_quality_pct || undefined,
          unit_price: item.unit_price,
        }));

      if (items.length === 0) {
        message.warning('Укажите количество хотя бы для одной позиции');
        return;
      }

      await apiClient.post(`/inventory/purchase-orders/${receiveOrder!.id}/receive`, {
        receipt_number: values.receipt_number,
        notes: values.notes,
        items,
      });

      message.success('Товар принят');
      setReceiveModalVisible(false);
      receiveForm.resetFields();
      fetchOrders();
    } catch (error: any) {
      if (error.response?.data?.detail) {
        message.error(error.response.data.detail);
      }
    }
  };

  const openDetailModal = (order: PurchaseOrder) => {
    setDetailOrder(order);
    setDetailModalVisible(true);
  };

  const filteredOrders = orders.filter(order =>
    searchText === '' ||
    order.order_number.toLowerCase().includes(searchText.toLowerCase()) ||
    order.supplier_invoice_number?.toLowerCase().includes(searchText.toLowerCase()) ||
    order.supplier_name?.toLowerCase().includes(searchText.toLowerCase())
  );

  const columns: ColumnsType<PurchaseOrder> = [
    {
      title: 'Номер',
      dataIndex: 'order_number',
      key: 'order_number',
      width: 140,
      render: (text, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{text}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Счёт: {record.supplier_invoice_number || '—'}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Поставщик',
      dataIndex: 'supplier_name',
      key: 'supplier_name',
      width: 150,
      ellipsis: true,
    },
    {
      title: 'Статус',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status) => {
        const config = statusConfig[status] || { color: 'default', label: status };
        return <Tag color={config.color}>{config.label}</Tag>;
      },
    },
    {
      title: 'Оплата',
      dataIndex: 'payment_status',
      key: 'payment_status',
      width: 130,
      render: (status) => {
        const config = paymentStatusConfig[status] || { color: 'default', label: status };
        return <Tag color={config.color}>{config.label}</Tag>;
      },
    },
    {
      title: 'Сумма',
      dataIndex: 'total_amount',
      key: 'total_amount',
      width: 120,
      align: 'right',
      render: (amount, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{amount?.toLocaleString('ru-RU')} ₽</Text>
          {record.received_amount > 0 && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              Принято: {record.received_amount.toLocaleString('ru-RU')} ₽
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: 'Прогресс',
      key: 'progress',
      width: 100,
      render: (_, record) => {
        const totalOrdered = record.items.reduce((sum, item) => sum + Number(item.ordered_qty), 0);
        const totalReceived = record.items.reduce((sum, item) => sum + Number(item.received_qty), 0);
        const percent = totalOrdered > 0 ? Math.round((totalReceived / totalOrdered) * 100) : 0;
        return (
          <Tooltip title={`${totalReceived} из ${totalOrdered}`}>
            <Tag color={percent === 100 ? 'green' : percent > 0 ? 'orange' : 'default'}>
              {percent}%
            </Tag>
          </Tooltip>
        );
      },
    },
    {
      title: 'Дата',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 110,
      render: (date) => dayjs(date).format('DD.MM.YYYY'),
    },
    {
      title: 'Действия',
      key: 'actions',
      width: 180,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="Детали">
            <Button
              type="text"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => openDetailModal(record)}
            />
          </Tooltip>
          
          {record.status === 'draft' && (
            <>
              <Tooltip title="Подтвердить">
                <Button
                  type="text"
                  size="small"
                  icon={<CheckOutlined />}
                  style={{ color: 'green' }}
                  onClick={() => openConfirmModal(record.id)}
                />
              </Tooltip>
              <Popconfirm
                title="Отменить заказ?"
                onConfirm={() => handleCancel(record.id)}
              >
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<CloseOutlined />}
                />
              </Popconfirm>
            </>
          )}
          
          {record.status === 'confirmed' && !record.is_fully_received && (
            <Tooltip title="Принять товар">
              <Button
                type="primary"
                size="small"
                icon={<ShoppingCartOutlined />}
                onClick={() => openReceiveModal(record)}
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  // Статистика
  const stats = {
    total: total,
    draft: orders.filter(o => o.status === 'draft').length,
    confirmed: orders.filter(o => o.status === 'confirmed').length,
    received: orders.filter(o => o.status === 'received').length,
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>
          <ShoppingCartOutlined style={{ marginRight: 8 }} />
          Заказы поставщикам
        </Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => navigate('/inventory/purchase-orders/create')}
        >
          Новый заказ
        </Button>
      </div>

      {/* Статистика */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card size="small">
            <Statistic title="Всего заказов" value={stats.total} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="Черновики" value={stats.draft} valueStyle={{ color: '#666' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="Подтверждённые" value={stats.confirmed} valueStyle={{ color: '#1890ff' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="Принятые" value={stats.received} valueStyle={{ color: '#52c41a' }} />
          </Card>
        </Col>
      </Row>

      {/* Фильтры */}
      <Card style={{ marginBottom: 16 }}>
        <Space wrap size="middle">
          <Input.Search
            placeholder="Поиск по номеру или поставщику"
            style={{ width: 250 }}
            onSearch={(value) => setSearchText(value)}
            onChange={(e) => setSearchText(e.target.value)}
            allowClear
          />
          <Select
            placeholder="Статус"
            style={{ width: 150 }}
            value={statusFilter}
            onChange={(value) => { setStatusFilter(value); setPage(1); }}
            allowClear
          >
            <Option value="draft">Черновик</Option>
            <Option value="confirmed">Подтверждён</Option>
            <Option value="received">Принят</Option>
            <Option value="cancelled">Отменён</Option>
          </Select>
          <Select
            placeholder="Оплата"
            style={{ width: 160 }}
            value={paymentStatusFilter}
            onChange={(value) => { setPaymentStatusFilter(value); setPage(1); }}
            allowClear
          >
            <Option value="pending">Не оплачен</Option>
            <Option value="partial">Частично оплачен</Option>
            <Option value="paid">Оплачен</Option>
            <Option value="deferred">Отсрочка</Option>
          </Select>
          <Select
            placeholder="Поставщик"
            style={{ width: 200 }}
            value={supplierFilter}
            onChange={(value) => { setSupplierFilter(value); setPage(1); }}
            allowClear
            showSearch
            optionFilterProp="children"
          >
            {suppliers.map(s => (
              <Option key={s.id} value={s.id}>{s.name}</Option>
            ))}
          </Select>
          <Button icon={<ReloadOutlined />} onClick={fetchOrders}>Обновить</Button>
        </Space>
      </Card>

      {/* Таблица */}
      <Card>
        <Table
          columns={columns}
          dataSource={filteredOrders}
          rowKey="id"
          loading={loading}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (total) => `Всего: ${total}`,
            onChange: (page, pageSize) => { setPage(page); setPageSize(pageSize); },
          }}
          scroll={{ x: 1100 }}
        />
      </Card>

      {/* Модалка приёмки */}
      <Modal
        title={`Приёмка товара — ${receiveOrder?.order_number}`}
        open={receiveModalVisible}
        onCancel={() => { setReceiveModalVisible(false); receiveForm.resetFields(); }}
        onOk={handleReceive}
        okText="Принять товар"
        cancelText="Отмена"
        width={800}
      >
        <Form form={receiveForm} layout="vertical">
          <Space style={{ width: '100%' }} size="large">
            <Form.Item name="receipt_number" label="Номер накладной" style={{ flex: 1 }}>
              <Input placeholder="Например: НАКЛ-001" />
            </Form.Item>
          </Space>

          <Form.List name="items">
            {(fields) => (
              <>
                {fields.map(({ key, name, ...restField }) => (
                  <Card key={key} size="small" style={{ marginBottom: 8 }}>
                    <Form.Item noStyle shouldUpdate>
                      {({ getFieldValue }) => {
                        const item = getFieldValue(['items', name]);
                        if (!item) return null;
                        const prodType = item.product_type;
                        return (
                          <>
                            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                              <div style={{ flex: 1 }}>
                                <Text strong>{item.product_name}</Text>
                                <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>({prodType})</Text>
                                <br />
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                  Заказано: {item.ordered_qty} | Принято ранее: {item.received_qty} | Осталось: {item.remaining_qty}
                                </Text>
                              </div>
                              <Form.Item {...restField} name={[name, 'product_id']} hidden><Input /></Form.Item>
                              <Form.Item {...restField} name={[name, 'product_type']} hidden><Input /></Form.Item>
                              <Form.Item
                                {...restField}
                                name={[name, 'quantity']}
                                label="Принять"
                                rules={[{ required: true, message: 'Укажите' }]}
                                style={{ marginBottom: 0 }}
                              >
                                <InputNumber min={0} max={item.remaining_qty} step={0.1} style={{ width: 100 }} />
                              </Form.Item>
                              <Form.Item
                                {...restField}
                                name={[name, 'unit_price']}
                                label="Цена"
                                style={{ marginBottom: 0 }}
                              >
                                <InputNumber min={0} step={1} style={{ width: 100 }} />
                              </Form.Item>
                            </Space>


                            {prodType === 'flower' && (
                              <Form.Item
                                {...restField}
                                name={[name, 'received_quality_pct']}
                                label="% годного при приёмке"
                                initialValue={100}
                                style={{ marginTop: 8, marginBottom: 0 }}
                              >
                                <Space.Compact>
                                  <InputNumber min={0} max={100} style={{ width: 100 }} />
                                  <Button disabled style={{ cursor: 'default' }}>%</Button>
                                </Space.Compact>
                              </Form.Item>
                            )}
                          </>
                        );
                      }}
                    </Form.Item>
                  </Card>
                ))}
              </>
            )}
          </Form.List>

          <Form.Item name="notes" label="Примечания" style={{ marginTop: 16 }}>
            <Input.TextArea rows={2} placeholder="Комментарий к приёмке" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Модалка подтверждения */}
      <Modal
        title="Подтверждение заказа"
        open={confirmModalVisible}
        onCancel={() => { setConfirmModalVisible(false); confirmForm.resetFields(); }}
        onOk={handleConfirm}
        okText="Подтвердить"
        cancelText="Отмена"
      >
        <Alert
          message="Для подтверждения заказа необходим номер счёта от поставщика"
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Form form={confirmForm} layout="vertical">
          <Form.Item
            name="supplier_invoice_number"
            label="Номер счёта"
            rules={[{ required: true, message: 'Укажите номер счёта' }]}
          >
            <Input placeholder="Например: СЧ-2026-001" />
          </Form.Item>
          <Form.Item name="invoice_date" label="Дата счёта">
            <DatePicker format="DD.MM.YYYY" style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Модалка деталей */}
      <Modal
        title={`Заказ ${detailOrder?.order_number}`}
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={<Button onClick={() => setDetailModalVisible(false)}>Закрыть</Button>}
        width={900}
      >
        {detailOrder && (
          <div>
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={8}>
                <Text type="secondary">Поставщик:</Text>
                <br />
                <Text strong>{detailOrder.supplier_name}</Text>
              </Col>
              <Col span={8}>
                <Text type="secondary">Счёт:</Text>
                <br />
                <Text strong>{detailOrder.supplier_invoice_number || '—'}</Text>
                {detailOrder.invoice_date && (
                  <Text type="secondary" style={{ marginLeft: 8 }}>
                    ({dayjs(detailOrder.invoice_date).format('DD.MM.YYYY')})
                  </Text>
                )}
              </Col>
              <Col span={8}>
                <Text type="secondary">Статус:</Text>
                <br />
                <Tag color={statusConfig[detailOrder.status]?.color}>
                  {statusConfig[detailOrder.status]?.label}
                </Tag>
              </Col>
            </Row>

            <Title level={5}>Позиции заказа</Title>
            <Table
              size="small"
              pagination={false}
              dataSource={detailOrder.items}
              rowKey="id"
              columns={[
                { title: 'Товар', dataIndex: 'product_name', key: 'product_name' },
                { title: 'SKU', dataIndex: 'product_sku', key: 'product_sku' },
                { title: 'Заказано', dataIndex: 'ordered_qty', key: 'ordered_qty', align: 'right' },
                { title: 'Принято', dataIndex: 'received_qty', key: 'received_qty', align: 'right' },
                { title: 'Осталось', dataIndex: 'remaining_qty', key: 'remaining_qty', align: 'right' },
                { title: 'Цена', dataIndex: 'unit_price', key: 'unit_price', align: 'right', render: (v) => `${v} ₽` },
              ]}
            />

            {detailOrder.receipts.length > 0 && (
              <>
                <Title level={5} style={{ marginTop: 16 }}>История приёмов</Title>
                {detailOrder.receipts.map(receipt => (
                  <Card key={receipt.id} size="small" style={{ marginBottom: 8 }}>
                    <Text strong>{receipt.receipt_number || 'Без номера'}</Text>
                    <Text type="secondary" style={{ marginLeft: 16 }}>
                      {dayjs(receipt.received_at).format('DD.MM.YYYY HH:mm')}
                    </Text>
                    <Text style={{ marginLeft: 16 }}>
                      Принял: {receipt.receiver_name}
                    </Text>
                  </Card>
                ))}
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default PurchaseOrdersPage;
