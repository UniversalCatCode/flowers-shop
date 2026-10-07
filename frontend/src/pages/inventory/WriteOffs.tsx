import React, { useEffect, useState, useRef } from 'react';
import { 
  Table, Button, Space, Modal, Form, Input, Select, InputNumber, 
  message, Card, Tag, DatePicker, Typography, Tooltip 
} from 'antd';
import { PlusOutlined, ReloadOutlined, EditOutlined } from '@ant-design/icons';
import apiClient from '../../api/client';
import dayjs from 'dayjs';

const { Option } = Select;
const { RangePicker } = DatePicker;

interface WriteOff {
  id: number;
  batch_id: number | null;
  product_id?: number | null;
  product_name?: string | null;
  quantity: number;
  reason: string;
  created_by: number | null;
  created_at: string;
}

interface Batch {
  id: number;
  product_id: number;
  product_name: string;
  batch_number: string | null;
  current_qty: number;
  received_at: string;
}

interface Product {
  id: number;
  name: string;
  sku: string;
}

const REASONS = [
  { value: 'expiry', label: 'Истечение срока годности', color: 'orange' },
  { value: 'damage', label: 'Повреждение / Бой', color: 'red' },
  { value: 'rejection_at_receipt', label: 'Отклонение при приёмке', color: 'volcano' },
  { value: 'damage_during_assembly', label: 'Бой при сборке', color: 'magenta' },
  { value: 'return_damage', label: 'Повреждение при возврате', color: 'purple' },
  { value: 'other', label: 'Другое', color: 'default' },
];

const WriteOffsPage: React.FC = () => {
  const [writeOffs, setWriteOffs] = useState<WriteOff[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(false);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingWriteOff, setEditingWriteOff] = useState<WriteOff | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [form] = Form.useForm();

  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [reasonFilter, setReasonFilter] = useState<string | undefined>(undefined);

  useEffect(() => {
    fetchBatches();
    fetchProducts();
  }, []);

  // Refs для актуальных значений фильтров (избегаем stale closure)
  const filtersRef = useRef({ reasonFilter, dateRange, searchText });
  filtersRef.current = { reasonFilter, dateRange, searchText };

  const fetchData = async () => {
    setLoading(true);
    try {
      const { reasonFilter: rf, dateRange: dr, searchText: st } = filtersRef.current;
      const params: any = { limit: 500 };
      if (rf) params.reason = rf;
      if (dr) {
        params.date_from = dr[0].toISOString();
        params.date_to = dr[1].toISOString();
      }
      if (st) params.search = st;
      const response = await apiClient.get<any>('/inventory/write-offs', { params });
      const data = Array.isArray(response.data) ? response.data : (response.data?.items || []);
      setWriteOffs(data);
    } catch (error) {
      message.error('Не удалось загрузить список списаний');
    } finally {
      setLoading(false);
    }
  };

  // Автозагрузка при изменении фильтров
  useEffect(() => {
    fetchData();
  }, [reasonFilter, dateRange, searchText]);

  const fetchBatches = async () => {
    try {
      const response = await apiClient.get<any>('/inventory/batches?status=active&limit=500');
      const data = Array.isArray(response.data) ? response.data : (response.data?.items || []);
      setBatches(data);
    } catch (error) {
      console.error('Не удалось загрузить партии');
    }
  };

  const fetchProducts = async () => {
    try {
      const response = await apiClient.get<any>('/catalog/products?limit=500');
      const data = Array.isArray(response.data) ? response.data : (response.data?.items || []);
      setProducts(data);
    } catch (error) {
      console.error('Не удалось загрузить товары');
    }
  };

  const handleOpenModal = (record?: WriteOff) => {
    setEditingWriteOff(record || null);
    if (record) {
      // Режим редактирования
      const batch = batches.find(b => b.id === record.batch_id);
      setSelectedProductId(batch?.product_id || null);
      form.setFieldsValue({
        batch_id: record.batch_id,
        quantity: record.quantity,
        reason: record.reason,
      });
    } else {
      // Режим создания
      setSelectedProductId(null);
      form.resetFields();
      form.setFieldValue('product_id', undefined);
    }
    setIsModalOpen(true);
  };

  const handleSave = async (values: any) => {
    try {
      if (editingWriteOff) {
        await apiClient.patch(`/inventory/write-offs/${editingWriteOff.id}`, {
          reason: values.reason,
        });
        message.success('Причина списания обновлена');
      } else {
        // Если партия не выбрана — передаём product_id
        const payload = { ...values };
        if (!payload.batch_id && selectedProductId) {
          payload.product_id = selectedProductId;
          delete payload.batch_id;
        }
        await apiClient.post('/inventory/write-offs', payload);
        message.success('Списание создано');
      }
      setIsModalOpen(false);
      form.resetFields();
      setSelectedProductId(null);
      fetchData();
      if (!editingWriteOff) fetchBatches(); // Обновляем остатки только при создании
    } catch (error: any) {
      message.error(error.response?.data?.detail || 'Ошибка при сохранении');
    }
  };

  const getReasonLabel = (reason: string) => {
    const found = REASONS.find(r => r.value === reason);
    return found ? found.label : reason;
  };

  const getReasonColor = (reason: string) => {
    const found = REASONS.find(r => r.value === reason);
    return found ? found.color : 'default';
  };

  const getBatchInfo = (batchId: number | null) => {
    if (!batchId) return '—';
    const batch = batches.find(b => b.id === batchId);
    if (!batch) return `Партия #${batchId}`;
    const num = batch.batch_number || dayjs(batch.received_at).format('DD.MM.YYYY');
    return `${batch.product_name} (${num})`;
  };

  // Фильтруем партии по выбранному товару
  const filteredBatches = batches.filter(b => b.product_id === selectedProductId);

  const columns = [
    {
      title: 'Товар',
      key: 'product',
      render: (_: any, record: WriteOff) => {
        // Ищем название товара
        let productName = record.product_name;
        if (!productName && record.batch_id) {
          const batch = batches.find(b => b.id === record.batch_id);
          productName = batch?.product_name;
        }
        if (!productName && record.product_id) {
          const prod = products.find(p => p.id === record.product_id);
          productName = prod?.name;
        }
        
        return (
          <Space direction="vertical" size={0}>
            <Typography.Text strong>{productName || '—'}</Typography.Text>
            {record.batch_id && (() => {
              const batch = batches.find(b => b.id === record.batch_id);
              const batchNum = batch?.batch_number || (batch?.received_at ? dayjs(batch.received_at).format('DD.MM.YYYY') : `#${record.batch_id}`);
              return (
                <Typography.Text type="secondary" style={{ fontSize: '12px' }}>
                  {batchNum}
                </Typography.Text>
              );
            })()}
          </Space>
        );
      },
    },
    {
      title: 'Количество',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 100,
    },
    {
      title: 'Причина',
      dataIndex: 'reason',
      key: 'reason',
      render: (reason: string) => (
        <Tag color={getReasonColor(reason)}>{getReasonLabel(reason)}</Tag>
      ),
    },
    {
      title: 'Дата',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (val: string) => dayjs(val).format('DD.MM.YYYY HH:mm'),
    },
    {
      title: 'Действия',
      key: 'actions',
      width: 100,
      render: (_: any, record: WriteOff) => (
        <Button 
          type="link" 
          size="small" 
          icon={<EditOutlined />} 
          onClick={() => handleOpenModal(record)}
        >
          Изменить
        </Button>
      ),
    },
  ];

  return (
    <>
      <Card 
        title="Списания товаров"
        extra={
          <Space wrap>
            <Input.Search
              placeholder="Поиск по товару"
              allowClear
              style={{ width: 220 }}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onSearch={(val) => setSearchText(val)}
              enterButton
            />
            <Select
              placeholder="Фильтр по причине"
              allowClear
              style={{ width: 200 }}
              value={reasonFilter}
              onChange={(val) => {
                setReasonFilter(val);
                setTimeout(fetchData, 0);
              }}
            >
              {REASONS.map(r => (
                <Option key={r.value} value={r.value}>{r.label}</Option>
              ))}
            </Select>
            <RangePicker
              format="DD.MM.YYYY"
              value={dateRange}
              onChange={(dates) => {
                setDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs] | null);
                setTimeout(fetchData, 0);
              }}
            />
            <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>
              Обновить
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => handleOpenModal()}>
              Создать списание
            </Button>
          </Space>
        }
      >
        <Table 
          columns={columns} 
          dataSource={writeOffs} 
          rowKey="id" 
          loading={loading}
          pagination={{ 
            pageSize: 20, 
            showSizeChanger: true,
            showTotal: (total, range) => `${range[0]}-${range[1]} из ${total}`,
          }}
        />
      </Card>

      {/* Модалка создания / редактирования */}
      <Modal
        title={editingWriteOff ? 'Редактировать списание' : 'Создать списание'}
        open={isModalOpen}
        onCancel={() => {
          setIsModalOpen(false);
          form.resetFields();
          setSelectedProductId(null);
        }}
        footer={null}
        width={600}
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          
          {/* ШАГ 1: Выбор товара (только при создании) */}
          {!editingWriteOff && (
            <Form.Item label="Товар" required>
              <Select 
                showSearch 
                optionFilterProp="children"
                placeholder="1. Выберите товар"
                value={selectedProductId}
                onChange={(val) => {
                  setSelectedProductId(val);
                  form.setFieldValue('batch_id', undefined); // Сброс партии при смене товара
                }}
              >
                {products.map(p => (
                  <Option key={p.id} value={p.id}>{p.name} ({p.sku})</Option>
                ))}
              </Select>
            </Form.Item>
          )}

          {/* ШАГ 2: Выбор партии (только если есть партии у товара) */}
          {(filteredBatches.length > 0 || editingWriteOff) ? (
            <Form.Item 
              name="batch_id" 
              label={editingWriteOff ? "Партия" : "2. Выберите партию"}
              rules={[{ required: filteredBatches.length > 0, message: 'Выберите партию' }]}
            >
              <Select 
                showSearch 
                optionFilterProp="children"
                placeholder={selectedProductId ? "Выберите партию" : "Сначала выберите товар"}
                disabled={!selectedProductId && !editingWriteOff}
                allowClear
              >
                {filteredBatches.map(b => (
                  <Option key={b.id} value={b.id}>
                    {b.batch_number || `Партия #${b.id}`} от {dayjs(b.received_at).format('DD.MM.YYYY')} (Остаток: {b.current_qty})
                  </Option>
                ))}
              </Select>
            </Form.Item>
          ) : (
            selectedProductId && (
              <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
                ℹ️ У этого товара нет партий. Списание будет выполнено из общего остатка.
              </Typography.Text>
            )
          )}

          {/* ШАГ 3: Количество (заблокировано при редактировании) */}
          <Form.Item 
            name="quantity" 
            label="Количество для списания" 
            rules={[{ required: true, message: 'Укажите количество' }]}
          >
            <InputNumber 
              min={0.1} 
              step={0.1} 
              style={{ width: '100%' }} 
              disabled={!!editingWriteOff}
            />
          </Form.Item>
          {editingWriteOff && (
            <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: -16, marginBottom: 16 }}>
              * Изменение количества задним числом запрещено. Для коррекции создайте новое списание.
            </Typography.Text>
          )}

          {/* ШАГ 4: Причина */}
          <Form.Item 
            name="reason" 
            label="Причина списания" 
            rules={[{ required: true, message: 'Выберите или введите причину' }]}
          >
            <Select 
              showSearch 
              placeholder="Выберите причину или введите свою"
              optionFilterProp="children"
            >
              {REASONS.map(r => (
                <Option key={r.value} value={r.value}>{r.label}</Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item style={{ textAlign: 'right', marginBottom: 0, marginTop: 24 }}>
            <Space>
              <Button onClick={() => {
                setIsModalOpen(false);
                form.resetFields();
                setSelectedProductId(null);
              }}>
                Отмена
              </Button>
              <Button type="primary" htmlType="submit" danger={!!editingWriteOff}>
                {editingWriteOff ? 'Сохранить изменения' : 'Списать'}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default WriteOffsPage;
