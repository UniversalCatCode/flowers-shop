import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Form, Input, Select, InputNumber, Button, Space, Card,
  message, DatePicker, Divider, Typography, Tag, Alert, Tabs, Table, Radio, Statistic, Row, Col
} from 'antd';
import { PlusOutlined, MinusCircleOutlined, SaveOutlined, CalculatorOutlined, PrinterOutlined } from '@ant-design/icons';
import apiClient from '../../api/client';
import dayjs from 'dayjs';

const { Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;

interface Product {
  id: number;
  name: string;
  sku: string;
  product_type: string;
  purchase_price?: number;
}

interface Supplier {
  id: number;
  name: string;
}

interface BouquetCalculationItem {
  product_id: number;
  product_name: string;
  product_sku: string;
  product_type: string;
  required_qty: number;
  available_qty: number;
  shortage_qty: number;
  last_purchase_price?: number;
}

interface BouquetCalculationResponse {
  bouquets_selected: number;
  total_bouquet_units: number;
  components: BouquetCalculationItem[];
  total_shortage_items: number;
  estimated_cost?: number;
}

const PurchaseOrderCreatePage: React.FC = () => {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'manual' | 'by_bouquet'>('manual');
  
  // Режим редактирования
  const { id: editId } = useParams();
  const isEditMode = !!editId;
  const [editingOrder, setEditingOrder] = useState<any>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [bouquets, setBouquets] = useState<Product[]>([]);
  
  // Для режима "по букетам"
  const [selectedBouquets, setSelectedBouquets] = useState<{bouquet_product_id: number; quantity: number}[]>([]);
  const [calculation, setCalculation] = useState<BouquetCalculationResponse | null>(null);
  const [calculating, setCalculating] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [prodRes, suppRes] = await Promise.all([
        apiClient.get<any>('/catalog/products?limit=500'),
        apiClient.get<any>('/catalog/suppliers?limit=500'),
      ]);
      
      const prods = Array.isArray(prodRes.data) ? prodRes.data : (prodRes.data?.items || []);
      // Для ручного режима — только цветы и упаковка
      setProducts(prods.filter((p: Product) => p.product_type !== 'bouquet'));
      // Для режима по букетам — только букеты
      setBouquets(prods.filter((p: Product) => p.product_type === 'bouquet'));
      
      const supps = Array.isArray(suppRes.data) ? suppRes.data : (suppRes.data?.items || []);
      setSuppliers(supps);
    } catch (error) {
      message.error('Не удалось загрузить справочники');
    }
    
    // Загружаем заказ при редактировании
    if (editId) {
      try {
        const response = await apiClient.get(`/inventory/purchase-orders/${editId}`);
        const order = response.data;
        setEditingOrder(order);
        form.setFieldsValue({
          supplier_id: order.supplier_id,
          expected_date: order.expected_date ? dayjs(order.expected_date) : null,
          notes: order.notes,
          items: order.items?.map((item: any) => ({
            product_id: item.product_id,
            ordered_qty: item.ordered_qty,
            unit_price: item.unit_price,
            notes: item.notes,
          })) || [],
        });
      } catch (error) {
        message.error('Не удалось загрузить заказ');
      }
    }
  };

  const handleCalculate = async () => {
    // Читаем выбранные букеты из формы
    const values = form.getFieldsValue();
    const bouquets = (values.bouquets || [])
      .filter((b: any) => b && b.bouquet_product_id && b.quantity > 0);
    
    if (bouquets.length === 0) {
      message.warning('Выберите хотя бы один букет');
      return;
    }
    
    setCalculating(true);
    try {
      const response = await apiClient.post('/inventory/purchase-orders/calculate-from-bouquets', {
        bouquets: bouquets,
      });
      setCalculation(response.data);
    } catch (error: any) {
      message.error(error.response?.data?.detail || 'Ошибка при расчёте');
    } finally {
      setCalculating(false);
    }
  };

  const handleSubmit = async (values: any) => {
    setLoading(true);
    try {
      let items;
      
      if (mode === 'manual') {
        items = values.items.map((item: any) => {
          const prod = products.find(p => p.id === item.product_id);
          return {
            product_id: item.product_id,
            product_type: prod?.product_type || null,
            ordered_qty: item.ordered_qty,
            unit_price: item.unit_price,
            notes: item.notes,
          };
        });
      } else {
        // Режим "по букетам" — берём только дефицитные позиции
        if (!calculation) {
          message.error('Сначала выполните расчёт');
          setLoading(false);
          return;
        }
        items = calculation.components
          .filter(comp => comp.shortage_qty > 0)
          .map(comp => ({
            product_id: comp.product_id,
            product_type: comp.product_type || null,
            ordered_qty: comp.shortage_qty,
            unit_price: comp.last_purchase_price || 0,
          }));
        
        if (items.length === 0) {
          message.warning('Нет дефицитных позиций — заказ не требуется');
          setLoading(false);
          return;
        }
      }

      const payload = {
        supplier_invoice_number: values.supplier_invoice_number,
        supplier_id: values.supplier_id,
        expected_date: values.expected_date ? values.expected_date.toISOString() : undefined,
        mode: mode,
        notes: values.notes,
        items,
      };

      let response;
      if (isEditMode) {
        response = await apiClient.put(`/inventory/purchase-orders/${editId}`, payload);
        message.success(`Заказ ${response.data.order_number} обновлён!`);
      } else {
        response = await apiClient.post('/inventory/purchase-orders', payload);
        message.success(`Заказ ${response.data.order_number} создан!`);
      }
      
      // Перенаправляем на список заказов
      navigate('/inventory/purchase-orders');
    } catch (error: any) {
      message.error(error.response?.data?.detail || 'Ошибка при создании заказа');
    } finally {
      setLoading(false);
    }
  };

  const getProductTypeColor = (type: string) => {
    if (type === 'flower') return 'red';
    if (type === 'packaging') return 'blue';
    return 'default';
  };

  return (
    <Card title={isEditMode ? `Редактирование заказа ${editingOrder?.order_number || ''}` : "Создание заказа поставщику"} style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Переключатель режима */}
      {!isEditMode && <div style={{ marginBottom: 24 }}>
        <Radio.Group
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          buttonStyle="solid"
          size="large"
        >
          <Radio.Button value="manual">Ручной режим</Radio.Button>
          <Radio.Button value="by_bouquet">По букетам</Radio.Button>
        </Radio.Group>
      </div>}

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{
          items: [{ ordered_qty: 1, unit_price: 0 }],
        }}
      >
        {/* Основная информация */}
        <Space style={{ width: '100%' }} size="large">
          <Form.Item
            name="supplier_invoice_number"
            label="Номер счёта (опционально)"
            tooltip="Можно указать позже при подтверждении заказа"
            style={{ flex: 1 }}
          >
            <Input placeholder="Например: СЧ-2026-001" />
          </Form.Item>
          <Form.Item name="invoice_date" label="Дата счёта" style={{ flex: 1 }}>
            <DatePicker format="DD.MM.YYYY" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="supplier_id"
            label="Поставщик"
            rules={[{ required: true, message: 'Выберите поставщика' }]}
            style={{ flex: 2 }}
          >
            <Select showSearch optionFilterProp="children" placeholder="Выберите поставщика">
              {suppliers.map(s => (
                <Option key={s.id} value={s.id}>{s.name}</Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="expected_date" label="Ожидаемая дата" style={{ flex: 1 }}>
            <DatePicker format="DD.MM.YYYY" style={{ width: '100%' }} />
          </Form.Item>
        </Space>

        <Divider />

        {mode === 'manual' ? (
          <>
            <Divider titlePlacement="left">Позиции заказа</Divider>
            <Form.List name="items">
              {(fields, { add, remove }) => (
                <>
                  {fields.map(({ key, name, ...restField }) => (
                    <Card
                      key={key}
                      size="small"
                      style={{ marginBottom: 16, backgroundColor: '#fafafa' }}
                      extra={
                        fields.length > 1 && (
                          <MinusCircleOutlined
                            style={{ color: 'red', cursor: 'pointer' }}
                            onClick={() => remove(name)}
                          />
                        )
                      }
                    >
                      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                        <Form.Item
                          {...restField}
                          name={[name, 'product_id']}
                          label="Товар"
                          rules={[{ required: true, message: 'Выберите товар' }]}
                          style={{ flex: 1, marginBottom: 0 }}
                        >
                          <Select
                            showSearch
                            optionFilterProp="label"
                            placeholder="Поиск по названию или SKU"
                            style={{ width: 400 }}
                            onChange={(val) => {
                              const prod = products.find(p => p.id === val);
                              if (prod?.purchase_price != null) {
                                const items = form.getFieldValue('items') || [];
                                items[name] = { ...items[name], unit_price: prod.purchase_price };
                                form.setFieldsValue({ items });
                              }
                            }}
                          >
                            {products.map(p => (
                              <Option key={p.id} value={p.id} label={`${p.name} ${p.sku}`}>
                                <Space>
                                  <Tag color={getProductTypeColor(p.product_type)}>
                                    {p.product_type === 'flower' ? 'Цветок' : p.product_type === 'packaging' ? 'Упаковка' : 'Прочее'}
                                  </Tag>
                                  {p.name} ({p.sku})
                                </Space>
                              </Option>
                            ))}
                          </Select>
                        </Form.Item>

                        <Form.Item
                          {...restField}
                          name={[name, 'ordered_qty']}
                          label="Кол-во"
                          rules={[{ required: true, message: 'Укажите' }]}
                          style={{ width: 120, marginBottom: 0 }}
                        >
                          <InputNumber min={0.1} step={0.1} style={{ width: '100%' }} />
                        </Form.Item>

                        <Form.Item
                          {...restField}
                          name={[name, 'unit_price']}
                          label="Цена (₽)"
                          rules={[{ required: true, message: 'Укажите' }]}
                          style={{ width: 130, marginBottom: 0 }}
                        >
                          <InputNumber min={0} step={10} style={{ width: '100%' }} />
                        </Form.Item>

                        <Form.Item 
                          label="Сумма (₽)" 
                          style={{ width: 140, marginBottom: 0 }}
                          shouldUpdate={(prev, cur) =>
                            prev.items?.[name]?.ordered_qty !== cur.items?.[name]?.ordered_qty ||
                            prev.items?.[name]?.unit_price !== cur.items?.[name]?.unit_price
                          }
                        >
                          {({ getFieldValue, setFieldsValue }) => {
                            const qty = Number(getFieldValue(['items', name, 'ordered_qty']) || 0);
                            const price = Number(getFieldValue(['items', name, 'unit_price']) || 0);
                            const currentTotal = qty > 0 ? parseFloat((qty * price).toFixed(2)) : 0;
                            
                            return (
                              <InputNumber
                                min={0}
                                step={10}
                                style={{ width: '100%' }}
                                value={currentTotal}
                                onChange={(val) => {
                                  if (val != null && qty > 0) {
                                    const newPrice = parseFloat((val / qty).toFixed(2));
                                    const items = getFieldValue('items') || [];
                                    items[name] = { ...items[name], unit_price: newPrice };
                                    setFieldsValue({ items });
                                  }
                                }}
                              />
                            );
                          }}
                        </Form.Item>

                        <Form.Item
                          {...restField}
                          name={[name, 'notes']}
                          label="Примечание"
                          style={{ marginBottom: 0 }}
                        >
                          <Input placeholder="Опционально" style={{ width: 200 }} />
                        </Form.Item>
                      </Space>
                    </Card>
                  ))}
                  <Form.Item>
                    <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                      Добавить позицию
                    </Button>
                  </Form.Item>
                </>
              )}
            </Form.List>
          </>
        ) : (
          <>
            <Divider titlePlacement="left">Выбор букетов</Divider>
            
            {/* Выбор букетов */}
            <Form.List name="bouquets">
              {(fields, { add, remove }) => (
                <>
                  {fields.map(({ key, name, ...restField }) => (
                    <Card key={key} size="small" style={{ marginBottom: 8 }}>
                      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                        <Form.Item
                          {...restField}
                          name={[name, 'bouquet_product_id']}
                          label="Букет"
                          rules={[{ required: true }]}
                          style={{ marginBottom: 0 }}
                        >
                          <Select
                            showSearch
                            optionFilterProp="children"
                            placeholder="Выберите букет"
                            style={{ width: 500 }}
                          >
                            {bouquets.map(b => (
                              <Option key={b.id} value={b.id}>{b.name}</Option>
                            ))}
                          </Select>
                        </Form.Item>
                        <Form.Item
                          {...restField}
                          name={[name, 'quantity']}
                          label="Кол-во"
                          rules={[{ required: true }]}
                          style={{ marginBottom: 0 }}
                        >
                          <InputNumber min={1} step={1} style={{ width: 100 }} />
                        </Form.Item>
                        {fields.length > 1 && (
                          <MinusCircleOutlined
                            style={{ color: 'red', cursor: 'pointer' }}
                            onClick={() => remove(name)}
                          />
                        )}
                      </Space>
                    </Card>
                  ))}
                  <Form.Item>
                    <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                      Добавить букет
                    </Button>
                  </Form.Item>
                </>
              )}
            </Form.List>

            {/* Кнопка расчёта */}
            <Form.Item>
              <Button
                type="primary"
                icon={<CalculatorOutlined />}
                onClick={handleCalculate}
                loading={calculating}
                size="large"
              >
                Рассчитать дефицит
              </Button>
            </Form.Item>

            {/* Результаты расчёта */}
            {calculation && (
              <Card style={{ marginBottom: 16 }}>
                <Row gutter={16} style={{ marginBottom: 16 }}>
                  <Col span={6}>
                    <Statistic title="Букетов выбрано" value={calculation.bouquets_selected} />
                  </Col>
                  <Col span={6}>
                    <Statistic title="Всего букетов" value={calculation.total_bouquet_units} />
                  </Col>
                  <Col span={6}>
                    <Statistic
                      title="Позиций к закупке"
                      value={calculation.total_shortage_items}
                      valueStyle={{ color: calculation.total_shortage_items > 0 ? '#cf1322' : '#3f8600' }}
                    />
                  </Col>
                  <Col span={6}>
                    <Statistic
                      title="Оценка стоимости"
                      value={calculation.estimated_cost || 0}
                      suffix="₽"
                      precision={0}
                    />
                  </Col>
                </Row>

                <Table
                  size="small"
                  pagination={false}
                  dataSource={calculation.components}
                  rowKey="product_id"
                  columns={[
                    { title: 'Товар', dataIndex: 'product_name', key: 'product_name' },
                    { title: 'SKU', dataIndex: 'product_sku', key: 'product_sku' },
                    { title: 'Нужно', dataIndex: 'required_qty', key: 'required_qty', align: 'right' },
                    { title: 'Доступно', dataIndex: 'available_qty', key: 'available_qty', align: 'right' },
                    {
                      title: 'Дефицит',
                      dataIndex: 'shortage_qty',
                      key: 'shortage_qty',
                      align: 'right',
                      render: (val) => (
                        <Text strong style={{ color: val > 0 ? '#cf1322' : '#3f8600' }}>
                          {val}
                        </Text>
                      ),
                    },
                    {
                      title: 'Цена',
                      dataIndex: 'last_purchase_price',
                      key: 'last_purchase_price',
                      align: 'right',
                      render: (val) => val ? `${val} ₽` : '—',
                    },
                  ]}
                />
              </Card>
            )}
          </>
        )}

        <Divider />

        <Form.Item name="notes" label="Общие примечания">
          <TextArea rows={2} placeholder="Дополнительная информация к заказу" />
        </Form.Item>

        <Form.Item style={{ textAlign: 'right', marginTop: 24 }}>
          <Space size="middle">
            <Button type="primary" htmlType="submit" size="large" icon={<SaveOutlined />} loading={loading}>
              {isEditMode ? 'Сохранить изменения' : 'Создать заказ'}
            </Button>
            {isEditMode && editId && (
              <Button size="large" icon={<PrinterOutlined />} onClick={() => window.open(`/inventory/purchase-orders/${editId}/print`, '_blank')}>
                Печать
              </Button>
            )}
          </Space>
        </Form.Item>
      </Form>
    </Card>
  );
};

export default PurchaseOrderCreatePage;
