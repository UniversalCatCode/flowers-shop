import React, { useEffect, useState } from 'react';
import { 
  Table, Button, Space, Tag, message, Card, Modal, Form, 
  Input, Select, InputNumber, Tabs, Typography, Popconfirm,
  Descriptions, Statistic, Row, Col, Alert
} from 'antd';
import { 
  PlusOutlined, ReloadOutlined, EditOutlined, 
  CheckCircleOutlined, CloseCircleOutlined, WarningOutlined
} from '@ant-design/icons';
import apiClient from '../../api/client';
import { Product, Supplier } from '../../types/api';
import dayjs from 'dayjs';

const { Option } = Select;
const { Text } = Typography;

interface PackagingUnit {
  id: number;
  product_id: number;
  supplier_id: number | null;
  unit_type: string;
  unit_name: string;
  base_quantity: number;
  base_unit: string;
  actual_quantity: number | null;
  purchase_price: number;
  received_at: string;
  is_active: boolean;
  created_at: string;
}

interface PackagingOpening {
  id: number;
  packaging_unit_id: number;
  opened_at: string;
  opened_by: number | null;
  initial_qty: number;
  status: string;
  closed_at: string | null;
  final_qty: number | null;
  notes: string | null;
  created_at: string;
  packaging_unit?: PackagingUnit;
}

interface PackagingConsumption {
  id: number;
  opening_id: number;
  sale_id: number | null;
  product_id: number;
  normative_qty: number;
  normative_unit: string;
  created_at: string;
}

interface PackagingAdjustment {
  id: number;
  opening_id: number;
  normative_total: number;
  actual_total: number;
  adjustment_factor: number;
  is_anomaly: boolean;
  anomaly_reason: string | null;
  cost_impact: number | null;
  created_at: string;
  opening?: PackagingOpening;
}

const PackagingPage: React.FC = () => {
  const [units, setUnits] = useState<PackagingUnit[]>([]);
  const [openings, setOpenings] = useState<PackagingOpening[]>([]);
  const [adjustments, setAdjustments] = useState<PackagingAdjustment[]>([]);
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  // Модалки
  const [isUnitModalOpen, setIsUnitModalOpen] = useState(false);
  const [isOpeningModalOpen, setIsOpeningModalOpen] = useState(false);
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [isConsumptionModalOpen, setIsConsumptionModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  const [editingUnit, setEditingUnit] = useState<PackagingUnit | null>(null);
  const [selectedOpening, setSelectedOpening] = useState<PackagingOpening | null>(null);

  const [unitForm] = Form.useForm();
  const [openingForm] = Form.useForm();
  const [closeForm] = Form.useForm();
  const [consumptionForm] = Form.useForm();

  const formatNumber = (val: any, decimals: number = 2) => {
    const num = Number(val);
    return isNaN(num) ? '—' : num.toFixed(decimals);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [unitsRes, openingsRes, adjustmentsRes, productsRes, suppliersRes] = await Promise.all([
        apiClient.get<any>('/inventory/packaging/units?limit=500'),
        apiClient.get<any>('/inventory/packaging/openings?limit=500'),
        apiClient.get<any>('/inventory/packaging/adjustments?limit=500'),
        apiClient.get<any>('/catalog/products?limit=500'),
        apiClient.get<any>('/catalog/suppliers?limit=100'),
      ]);

      setUnits(Array.isArray(unitsRes.data) ? unitsRes.data : (unitsRes.data?.items || []));
      setOpenings(Array.isArray(openingsRes.data) ? openingsRes.data : (openingsRes.data?.items || []));
      setAdjustments(Array.isArray(adjustmentsRes.data) ? adjustmentsRes.data : (adjustmentsRes.data?.items || []));
      setProducts(Array.isArray(productsRes.data) ? productsRes.data : (productsRes.data?.items || []));
      setSuppliers(Array.isArray(suppliersRes.data) ? suppliersRes.data : (suppliersRes.data?.items || []));
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

  // ============ UNITS ============
  const handleCreateUnit = () => {
    setEditingUnit(null);
    unitForm.resetFields();
    setIsUnitModalOpen(true);
  };

  const handleEditUnit = (unit: PackagingUnit) => {
    setEditingUnit(unit);
    unitForm.setFieldsValue({
      product_id: unit.product_id,
      supplier_id: unit.supplier_id,
      unit_type: unit.unit_type,
      unit_name: unit.unit_name,
      base_quantity: unit.base_quantity,
      base_unit: unit.base_unit,
      purchase_price: unit.purchase_price,
    });
    setIsUnitModalOpen(true);
  };

  const handleSaveUnit = async (values: any) => {
    try {
      if (editingUnit) {
        await apiClient.patch(`/inventory/packaging/units/${editingUnit.id}`, values);
        message.success('Единица упаковки обновлена');
      } else {
        await apiClient.post('/inventory/packaging/units', values);
        message.success('Единица упаковки создана');
      }
      setIsUnitModalOpen(false);
      unitForm.resetFields();
      setEditingUnit(null);
      fetchData();
    } catch (error: any) {
      message.error(error.response?.data?.detail || 'Ошибка при сохранении');
    }
  };

  // ============ OPENINGS ============
  const handleOpenUnit = () => {
    openingForm.resetFields();
    setIsOpeningModalOpen(true);
  };

  const handleSaveOpening = async (values: any) => {
    try {
      await apiClient.post('/inventory/packaging/openings', values);
      message.success('Рулон открыт');
      setIsOpeningModalOpen(false);
      openingForm.resetFields();
      fetchData();
    } catch (error: any) {
      message.error(error.response?.data?.detail || 'Ошибка при открытии');
    }
  };

  const handleCloseOpening = (opening: PackagingOpening) => {
    setSelectedOpening(opening);
    closeForm.resetFields();
    closeForm.setFieldsValue({ final_qty: 0 });
    setIsCloseModalOpen(true);
  };

  const handleConfirmClose = async (values: any) => {
    if (!selectedOpening) return;
    try {
      await apiClient.patch(`/inventory/packaging/openings/${selectedOpening.id}/close`, values);
      message.success('Рулон закрыт, коэффициент рассчитан');
      setIsCloseModalOpen(false);
      closeForm.resetFields();
      setSelectedOpening(null);
      fetchData();
    } catch (error: any) {
      message.error(error.response?.data?.detail || 'Ошибка при закрытии');
    }
  };

  const handleRecordConsumption = (opening: PackagingOpening) => {
    setSelectedOpening(opening);
    consumptionForm.resetFields();
    setIsConsumptionModalOpen(true);
  };

  const handleSaveConsumption = async (values: any) => {
    if (!selectedOpening) return;
    try {
      await apiClient.post('/inventory/packaging/consumption', {
        ...values,
        opening_id: selectedOpening.id,
      });
      message.success('Нормативный расход записан');
      setIsConsumptionModalOpen(false);
      consumptionForm.resetFields();
      setSelectedOpening(null);
      fetchData();
    } catch (error: any) {
      message.error(error.response?.data?.detail || 'Ошибка при записи');
    }
  };

  const showOpeningDetails = async (opening: PackagingOpening) => {
    setSelectedOpening(opening);
    setIsDetailModalOpen(true);
  };

  // ============ HELPERS ============
  const getProductName = (productId: number) => {
    const prod = products.find(p => p.id === productId);
    return prod ? `${prod.name} (${prod.sku})` : '—';
  };

  const getSupplierName = (supplierId: number | null) => {
    if (!supplierId) return '—';
    const sup = suppliers.find(s => s.id === supplierId);
    return sup ? sup.name : '—';
  };

  const getUnitTypeLabel = (type: string) => {
    const map: any = { roll: 'Рулон', pack: 'Пачка', box: 'Коробка' };
    return map[type] || type;
  };

  const getBaseUnitLabel = (unit: string) => {
    const map: any = { meter: 'метры', stem: 'шт (стебель)', piece: 'шт' };
    return map[unit] || unit;
  };

  // ============ COLUMNS ============
  const unitColumns = [
    { title: 'Название', dataIndex: 'unit_name', key: 'unit_name' },
    {
      title: 'Тип',
      dataIndex: 'unit_type',
      key: 'unit_type',
      width: 100,
      render: (type: string) => <Tag>{getUnitTypeLabel(type)}</Tag>
    },
    {
      title: 'Базовое кол-во',
      key: 'base_quantity',
      width: 140,
      render: (_: any, r: PackagingUnit) => `${formatNumber(r.base_quantity)} ${getBaseUnitLabel(r.base_unit)}`
    },
    {
      title: 'Товар',
      key: 'product',
      render: (_: any, r: PackagingUnit) => getProductName(r.product_id)
    },
    {
      title: 'Цена',
      dataIndex: 'purchase_price',
      key: 'purchase_price',
      width: 120,
      render: (v: number) => `${formatNumber(v)} ₽`
    },
    {
      title: 'Статус',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 100,
      render: (v: boolean) => <Tag color={v ? 'success' : 'default'}>{v ? 'Активна' : 'Неактивна'}</Tag>
    },
    {
      title: 'Действия',
      key: 'actions',
      width: 150,
      render: (_: any, record: PackagingUnit) => (
        <Space>
          <Button type="link" icon={<PlusOutlined />} onClick={() => {
            openingForm.resetFields();
            openingForm.setFieldsValue({ packaging_unit_id: record.id, initial_qty: record.base_quantity });
            setIsOpeningModalOpen(true);
          }} title="Открыть рулон" />
          <Button type="link" icon={<EditOutlined />} onClick={() => handleEditUnit(record)} />
        </Space>
      )
    }
  ];

  const openingColumns = [
    {
      title: 'Единица упаковки',
      key: 'unit',
      render: (_: any, r: PackagingOpening) => r.packaging_unit?.unit_name || '—'
    },
    {
      title: 'Начальное кол-во',
      dataIndex: 'initial_qty',
      key: 'initial_qty',
      width: 140,
      render: (v: number) => formatNumber(v)
    },
    {
      title: 'Остаток',
      dataIndex: 'final_qty',
      key: 'final_qty',
      width: 120,
      render: (v: number | null) => v !== null ? formatNumber(v) : '—'
    },
    {
      title: 'Открыто',
      dataIndex: 'opened_at',
      key: 'opened_at',
      width: 140,
      render: (v: string) => dayjs(v).format('DD.MM.YYYY HH:mm')
    },
    {
      title: 'Статус',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (s: string) => (
        <Tag color={s === 'active' ? 'processing' : 'default'}>
          {s === 'active' ? 'Активно' : 'Закрыто'}
        </Tag>
      )
    },
    {
      title: 'Действия',
      key: 'actions',
      width: 180,
      render: (_: any, record: PackagingOpening) => (
        <Space>
          {record.status === 'active' && (
            <>
              <Button 
                type="link" 
                icon={<PlusOutlined />}
                onClick={() => handleRecordConsumption(record)}
              >
                Расход
              </Button>
              <Button 
                type="link" 
                icon={<CheckCircleOutlined />}
                onClick={() => handleCloseOpening(record)}
              >
                Закрыть
              </Button>
            </>
          )}
          <Button 
            type="link" 
            onClick={() => showOpeningDetails(record)}
          >
            Детали
          </Button>
        </Space>
      )
    }
  ];

  const adjustmentColumns = [
    {
      title: 'Открытие',
      key: 'opening',
      render: (_: any, r: PackagingAdjustment) => r.opening?.packaging_unit?.unit_name || '—'
    },
    {
      title: 'Норматив',
      dataIndex: 'normative_total',
      key: 'normative_total',
      width: 120,
      render: (v: number) => formatNumber(v)
    },
    {
      title: 'Факт',
      dataIndex: 'actual_total',
      key: 'actual_total',
      width: 120,
      render: (v: number) => formatNumber(v)
    },
    {
      title: 'Коэффициент',
      dataIndex: 'adjustment_factor',
      key: 'adjustment_factor',
      width: 120,
      render: (v: number) => formatNumber(v, 3)
    },
    {
      title: 'Аномалия',
      dataIndex: 'is_anomaly',
      key: 'is_anomaly',
      width: 120,
      render: (v: boolean, r: PackagingAdjustment) => v ? (
        <Tag color="error" icon={<WarningOutlined />}>ДА</Tag>
      ) : (
        <Tag color="success">Норма</Tag>
      )
    },
    {
      title: 'Влияние на с/с',
      dataIndex: 'cost_impact',
      key: 'cost_impact',
      width: 140,
      render: (v: number | null) => v !== null ? `${formatNumber(v)} ₽` : '—'
    },
    {
      title: 'Дата',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 140,
      render: (v: string) => dayjs(v).format('DD.MM.YYYY HH:mm')
    }
  ];

  // ============ RENDER ============
  const tabItems = [
    {
      key: 'units',
      label: 'Единицы упаковки',
      children: (
        <Card
          title="Рулоны, пачки, коробки"
          extra={
            <Space>
              <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>Обновить</Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateUnit}>
                Добавить единицу
              </Button>
            </Space>
          }
        >
          <Table columns={unitColumns} dataSource={units} rowKey="id" loading={loading} />
        </Card>
      )
    },
    {
      key: 'openings',
      label: (
        <span>
          Открытия 
          {openings.filter(o => o.status === 'active').length > 0 && (
            <Tag color="processing" style={{ marginLeft: 8 }}>
              {openings.filter(o => o.status === 'active').length}
            </Tag>
          )}
        </span>
      ),
      children: (
        <Card
          title="Открытия рулонов/пачек"
          extra={
            <Space>
              <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>Обновить</Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenUnit}>
                Открыть рулон
              </Button>
            </Space>
          }
        >
          <Table columns={openingColumns} dataSource={openings} rowKey="id" loading={loading} />
        </Card>
      )
    },
    {
      key: 'adjustments',
      label: (
        <span>
          Корректировки
          {adjustments.filter(a => a.is_anomaly).length > 0 && (
            <Tag color="error" style={{ marginLeft: 8 }}>
              {adjustments.filter(a => a.is_anomaly).length}
            </Tag>
          )}
        </span>
      ),
      children: (
        <Card
          title="Корректировки себестоимости"
          extra={
            <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>Обновить</Button>
          }
        >
          {adjustments.filter(a => a.is_anomaly).length > 0 && (
            <Alert
              message={`Обнаружено ${adjustments.filter(a => a.is_anomaly).length} аномалий (коэффициент > 1.1)`}
              type="warning"
              showIcon
              icon={<WarningOutlined />}
              style={{ marginBottom: 16 }}
            />
          )}
          <Table columns={adjustmentColumns} dataSource={adjustments} rowKey="id" loading={loading} />
        </Card>
      )
    }
  ];

  return (
    <>
      <Tabs items={tabItems} defaultActiveKey="units" />

      {/* Модалка создания/редактирования единицы упаковки */}
      <Modal
        title={editingUnit ? 'Редактировать единицу упаковки' : 'Новая единица упаковки'}
        open={isUnitModalOpen}
        onCancel={() => {
          setIsUnitModalOpen(false);
          unitForm.resetFields();
          setEditingUnit(null);
        }}
        footer={null}
        width={600}
      >
        <Form form={unitForm} layout="vertical" onFinish={handleSaveUnit}>
          <Form.Item name="unit_name" label="Название" rules={[{ required: true }]}>
            <Input placeholder="Например: Рулон белой ленты 50м" />
          </Form.Item>

          <Space style={{ width: '100%' }} size="large">
            <Form.Item name="unit_type" label="Тип" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select>
                <Option value="roll">Рулон</Option>
                <Option value="pack">Пачка</Option>
                <Option value="box">Коробка</Option>
              </Select>
            </Form.Item>
            <Form.Item name="base_unit" label="Базовая единица" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select>
                <Option value="meter">метры</Option>
                <Option value="stem">шт (стебель)</Option>
                <Option value="piece">шт</Option>
              </Select>
            </Form.Item>
          </Space>

          <Form.Item name="base_quantity" label="Базовое количество" rules={[{ required: true }]}>
            <InputNumber min={0.01} step={0.1} style={{ width: '100%' }} placeholder="50.00" />
          </Form.Item>

          <Form.Item name="product_id" label="Товар (упаковка)" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="children" placeholder="Выберите товар">
              {products.filter(p => p.product_type === 'packaging').map(p => (
                <Option key={p.id} value={p.id}>{p.name} ({p.sku})</Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="supplier_id" label="Поставщик">
            <Select allowClear showSearch optionFilterProp="children" placeholder="Выберите поставщика">
              {suppliers.map(s => (
                <Option key={s.id} value={s.id}>{s.name}</Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="purchase_price" label="Цена закупки (₽)" rules={[{ required: true }]}>
            <InputNumber min={0} step={0.01} style={{ width: '100%' }} placeholder="500.00" />
          </Form.Item>

          <Form.Item style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={() => {
                setIsUnitModalOpen(false);
                unitForm.resetFields();
                setEditingUnit(null);
              }}>Отмена</Button>
              <Button type="primary" htmlType="submit">Сохранить</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Модалка открытия рулона */}
      <Modal
        title="Открыть рулон/пачку"
        open={isOpeningModalOpen}
        onCancel={() => {
          setIsOpeningModalOpen(false);
          openingForm.resetFields();
        }}
        footer={null}
        width={500}
      >
        <Form form={openingForm} layout="vertical" onFinish={handleSaveOpening}>
          <Form.Item name="packaging_unit_id" label="Единица упаковки" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="children" placeholder="Выберите рулон/пачку">
              {units.filter(u => u.is_active).map(u => (
                <Option key={u.id} value={u.id}>
                  {u.unit_name} ({formatNumber(u.base_quantity)} {getBaseUnitLabel(u.base_unit)})
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="initial_qty" label="Начальное количество" rules={[{ required: true }]}>
            <InputNumber min={0.01} step={0.1} style={{ width: '100%' }} placeholder="50.00" />
          </Form.Item>

          <Form.Item name="notes" label="Примечания">
            <Input.TextArea rows={2} placeholder="Начали использовать..." />
          </Form.Item>

          <Form.Item style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={() => {
                setIsOpeningModalOpen(false);
                openingForm.resetFields();
              }}>Отмена</Button>
              <Button type="primary" htmlType="submit">Открыть</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Модалка записи нормативного расхода */}
      <Modal
        title="Записать нормативный расход"
        open={isConsumptionModalOpen}
        onCancel={() => {
          setIsConsumptionModalOpen(false);
          consumptionForm.resetFields();
          setSelectedOpening(null);
        }}
        footer={null}
        width={500}
      >
        <Form form={consumptionForm} layout="vertical" onFinish={handleSaveConsumption}>
          <Form.Item name="product_id" label="Товар (букет)" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="children" placeholder="Какой букет собран">
              {products.filter(p => p.product_type === 'bouquet').map(p => (
                <Option key={p.id} value={p.id}>{p.name} ({p.sku})</Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="normative_qty" label="Нормативное количество" rules={[{ required: true }]}>
            <InputNumber min={0.01} step={0.1} style={{ width: '100%' }} placeholder="2.00" />
          </Form.Item>

          <Form.Item name="normative_unit" label="Единица измерения" rules={[{ required: true }]}>
            <Select>
              <Option value="meter">метры</Option>
              <Option value="stem">шт (стебель)</Option>
              <Option value="piece">шт</Option>
            </Select>
          </Form.Item>

          <Form.Item style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={() => {
                setIsConsumptionModalOpen(false);
                consumptionForm.resetFields();
                setSelectedOpening(null);
              }}>Отмена</Button>
              <Button type="primary" htmlType="submit">Записать</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Модалка закрытия рулона */}
      <Modal
        title="Закрыть рулон"
        open={isCloseModalOpen}
        onCancel={() => {
          setIsCloseModalOpen(false);
          closeForm.resetFields();
          setSelectedOpening(null);
        }}
        footer={null}
        width={500}
      >
        {selectedOpening && (
          <>
            <Descriptions bordered column={1} size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Единица">
                {selectedOpening.packaging_unit?.unit_name}
              </Descriptions.Item>
              <Descriptions.Item label="Начальное количество">
                {formatNumber(selectedOpening.initial_qty)}
              </Descriptions.Item>
            </Descriptions>

            <Form form={closeForm} layout="vertical" onFinish={handleConfirmClose}>
              <Form.Item 
                name="final_qty" 
                label="Сколько осталось (фактический остаток)" 
                rules={[{ required: true }]}
                extra="Укажите сколько реально осталось в рулоне/пачке"
              >
                <InputNumber min={0} step={0.1} style={{ width: '100%' }} placeholder="0.00" />
              </Form.Item>

              <Form.Item name="notes" label="Примечания">
                <Input.TextArea rows={2} placeholder="Закрыли, остаток передали..." />
              </Form.Item>

              <Form.Item style={{ textAlign: 'right' }}>
                <Space>
                  <Button onClick={() => {
                    setIsCloseModalOpen(false);
                    closeForm.resetFields();
                    setSelectedOpening(null);
                  }}>Отмена</Button>
                  <Button type="primary" htmlType="submit">Закрыть и рассчитать</Button>
                </Space>
              </Form.Item>
            </Form>
          </>
        )}
      </Modal>

      {/* Модалка деталей открытия */}
      <Modal
        title="Детали открытия"
        open={isDetailModalOpen}
        onCancel={() => {
          setIsDetailModalOpen(false);
          setSelectedOpening(null);
        }}
        footer={null}
        width={700}
      >
        {selectedOpening && (() => {
          const unit = selectedOpening.packaging_unit;
          const openingAdjustments = adjustments.filter(a => a.opening_id === selectedOpening.id);
          return (
            <>
              <Descriptions bordered column={2} size="small">
                <Descriptions.Item label="Единица упаковки" span={2}>
                  {unit?.unit_name || '—'}
                </Descriptions.Item>
                <Descriptions.Item label="Начальное количество">
                  {formatNumber(selectedOpening.initial_qty)}
                </Descriptions.Item>
                <Descriptions.Item label="Остаток">
                  {selectedOpening.final_qty !== null ? formatNumber(selectedOpening.final_qty) : '—'}
                </Descriptions.Item>
                <Descriptions.Item label="Открыто">
                  {dayjs(selectedOpening.opened_at).format('DD.MM.YYYY HH:mm')}
                </Descriptions.Item>
                <Descriptions.Item label="Закрыто">
                  {selectedOpening.closed_at ? dayjs(selectedOpening.closed_at).format('DD.MM.YYYY HH:mm') : '—'}
                </Descriptions.Item>
                <Descriptions.Item label="Статус" span={2}>
                  <Tag color={selectedOpening.status === 'active' ? 'processing' : 'default'}>
                    {selectedOpening.status === 'active' ? 'Активно' : 'Закрыто'}
                  </Tag>
                </Descriptions.Item>
              </Descriptions>

              {openingAdjustments.length > 0 && (
                <Card title="Корректировки" size="small" style={{ marginTop: 16 }}>
                  {openingAdjustments.map(adj => (
                    <Row gutter={16} key={adj.id} style={{ marginBottom: 8 }}>
                      <Col span={6}>
                        <Statistic title="Норматив" value={formatNumber(adj.normative_total)} />
                      </Col>
                      <Col span={6}>
                        <Statistic title="Факт" value={formatNumber(adj.actual_total)} />
                      </Col>
                      <Col span={6}>
                        <Statistic 
                          title="Коэффициент" 
                          value={formatNumber(adj.adjustment_factor, 3)}
                          valueStyle={{ color: adj.is_anomaly ? '#cf1322' : '#3f8600' }}
                        />
                      </Col>
                      <Col span={6}>
                        <Statistic 
                          title="Влияние на с/с" 
                          value={adj.cost_impact !== null ? formatNumber(adj.cost_impact) : '—'}
                          suffix="₽"
                        />
                      </Col>
                    </Row>
                  ))}
                  {openingAdjustments.some(a => a.is_anomaly) && (
                    <Alert
                      message="Обнаружена аномалия! Коэффициент превышает 1.1"
                      type="error"
                      showIcon
                      icon={<WarningOutlined />}
                      style={{ marginTop: 8 }}
                    />
                  )}
                </Card>
              )}
            </>
          );
        })()}
      </Modal>
    </>
  );
};

export default PackagingPage;
