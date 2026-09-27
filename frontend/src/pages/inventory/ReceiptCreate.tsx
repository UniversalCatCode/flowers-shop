import React, { useEffect, useState } from 'react';
import { 
  Form, Input, Select, InputNumber, Button, Space, Card, 
  message, DatePicker, Divider, Typography, Tag, Alert
} from 'antd';
import { PlusOutlined, MinusCircleOutlined, SaveOutlined } from '@ant-design/icons';
import apiClient from '../../api/client';
import dayjs from 'dayjs';

const { Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;

interface Product {
  id: number;
  name: string;
  sku: string;
  product_type: string; // 'flower', 'packaging', 'bouquet'
}

interface Supplier {
  id: number;
  name: string;
}

const ReceiptCreatePage: React.FC = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [prodRes, suppRes] = await Promise.all([
        apiClient.get<any>('/catalog/products?limit=500'),
        apiClient.get<any>('/catalog/suppliers?limit=500'),
      ]);
      
      // Фильтруем букеты, так как их не принимают на склад напрямую
      const prods = Array.isArray(prodRes.data) ? prodRes.data : (prodRes.data?.items || []);
      setProducts(prods.filter((p: Product) => p.product_type !== 'bouquet'));
      
      const supps = Array.isArray(suppRes.data) ? suppRes.data : (suppRes.data?.items || []);
      setSuppliers(supps);
    } catch (error) {
      message.error('Не удалось загрузить справочники');
    }
  };

  const handleSubmit = async (values: any) => {
    setLoading(true);
    try {
      const payload = {
        supplier_id: values.supplier_id,
        receipt_number: values.receipt_number || undefined,
        received_at: values.received_at ? values.received_at.toISOString() : undefined,
        notes: values.notes || undefined,
        items: values.items.map((item: any) => {
          const prod = products.find(p => p.id === item.product_id);
          const baseItem: any = {
            product_id: item.product_id,
            quantity: item.quantity,
            purchase_price: item.purchase_price,
          };

          if (prod?.product_type === 'packaging') {
            baseItem.unit_type = item.unit_type;
            baseItem.base_quantity = item.base_quantity;
            baseItem.base_unit = item.base_unit;
          } else if (prod?.product_type === 'flower') {
            baseItem.received_quality_pct = item.received_quality_pct;
          } else if (prod?.product_type === 'consumable') {
            // Для consumable не нужны специфичные поля
          }
          
          
          if (item.notes) baseItem.notes = item.notes;
          return baseItem;
        }),
      };

      const response = await apiClient.post('/inventory/receipts', payload);
      message.success(`Приёмка успешна! Создано партий: ${response.data.batches_created}, единиц упаковки: ${response.data.packaging_units_created}`);
      
      form.resetFields();
      // Опционально: редирект на список партий или остатков
      // navigate('/inventory/batches');
    } catch (error: any) {
      message.error(error.response?.data?.detail || 'Ошибка при создании приёмки');
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
    <Card title="Приёмка товара от поставщика" style={{ maxWidth: 1000, margin: '0 auto' }}>
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{
          received_at: dayjs(),
          items: [{ quantity: 1, purchase_price: 0 }],
        }}
      >
        {/* Основная информация о накладной */}
        <Space style={{ width: '100%' }} size="large">
          <Form.Item 
            name="receipt_number" 
            label="Номер накладной" 
            style={{ flex: 1 }}
            tooltip="Если не указать, будет сгенерирован автоматически"
          >
            <Input placeholder="Например: НАКЛ-2026-001" />
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
          <Form.Item name="received_at" label="Дата приёмки" style={{ flex: 1 }}>
            <DatePicker 
                showTime 
                format="DD.MM.YYYY HH:mm"
                style={{ width: '100%' }} 
            />
          </Form.Item>
        </Space>

        <Divider titlePlacement="left">Позиции накладной</Divider>

        {/* Динамический список позиций */}
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
                  <Space orientation="vertical" style={{ width: '100%' }} size="middle">
                    <div style={{ display:'flex', gap: 16, width: '100%', }}>
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
                            style={{ width: '100%' }}
                            onChange={() => {
                                form.setFieldValue(['items', name, 'unit_type'], undefined);
                                form.setFieldValue(['items', name, 'base_quantity'], undefined);
                                form.setFieldValue(['items', name, 'received_quality_pct'], undefined);
                            }}
                        >
                            {products.map(p => (
                                <Option 
                                    key={p.id} 
                                    value={p.id}
                                    label={`${p.name} ${p.sku}`}
                                >
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
                        name={[name, 'quantity']}
                        label="Кол-во"
                        rules={[{ required: true, message: 'Укажите количество' }]}
                        style={{ width: 120, marginBottom: 0 }}
                      >
                        <InputNumber min={0.1} step={0.1} style={{ width: '100%' }} />
                      </Form.Item>

                      <Form.Item
                        {...restField}
                        name={[name, 'purchase_price']}
                        label="Цена за ед. (₽)"
                        rules={[{ required: true, message: 'Укажите цену' }]}
                        style={{ width: 150, marginBottom: 0 }}
                      >
                        <InputNumber min={0} step={10} style={{ width: '100%' }} />
                       </Form.Item>
                    </div>

                    {/* Условные поля в зависимости от типа товара */}
                    <Form.Item noStyle shouldUpdate={(prevValues, currentValues) => 
                      prevValues.items?.[name]?.product_id !== currentValues.items?.[name]?.product_id
                    }>
                      {({ getFieldValue }) => {
                        const prodId = getFieldValue(['items', name, 'product_id']);
                        const prod = products.find(p => p.id === prodId);
                        
                        if (!prod) return null;

                        if (prod.product_type === 'packaging') {
                          return (
                            <Space size="middle">
                              <Form.Item {...restField} name={[name, 'unit_type']} label="Тип упаковки" initialValue="roll">
                                <Select style={{ width: 120 }}>
                                  <Option value="roll">Рулон</Option>
                                  <Option value="pack">Пачка</Option>
                                  <Option value="box">Коробка</Option>
                                </Select>
                              </Form.Item>
                              <Form.Item {...restField} name={[name, 'base_quantity']} label="Объём в ед." tooltip="Например: 100 для 100 метров">
                                <InputNumber min={1} style={{ width: 100 }} />
                              </Form.Item>
                              <Form.Item {...restField} name={[name, 'base_unit']} label="Ед. измерения" initialValue="meter">
                                <Select style={{ width: 100 }}>
                                  <Option value="meter">метров</Option>
                                  <Option value="piece">штук</Option>
                                  <Option value="kg">кг</Option>
                                </Select>
                              </Form.Item>
                            </Space>
                          );
                        }

                        if (prod.product_type === 'flower') {
                          return (
                            <Form.Item
                              {...restField}
                              name={[name, 'received_quality_pct']}
                              label="% годного при приёмке"
                              tooltip="Для аналитики качества поставщика."
                              initialValue={100}
                            >
                              <Space.Compact>
                                <InputNumber min={0} max={100} style={{ width: 100 }} />
                                <Button disabled style={{ cursor: 'default' }}>%</Button>
                              </Space.Compact>
                            </Form.Item>
                          );
                        } // <-- ВОТ ЭТУ СКОБКУ Я ДОБАВИЛ (она закрывала блок flower)

                        if (prod.product_type === 'consumable') {
                          return (
                            <Alert
                              message="Товар типа 'Прочее'"
                              description="Будет добавлен на склад без создания партии. Учёт ведётся по общему остатку."
                              type="info"
                              showIcon
                              style={{ width: '100%' }}
                            />
                          );
                        }

                        return null;
                      }}
                    </Form.Item>


                    <Form.Item
                      {...restField}
                      name={[name, 'notes']}
                      label="Примечание к позиции"
                      style={{ marginBottom: 0 }}
                    >
                      <Input placeholder="Например: 2 стебля сломаны" />
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

        <Divider />

        <Form.Item name="notes" label="Общие примечания к накладной">
          <TextArea rows={2} placeholder="Дополнительная информация для всей приёмки" />
        </Form.Item>

        <Form.Item style={{ textAlign: 'right', marginTop: 24 }}>
          <Button type="primary" htmlType="submit" size="large" icon={<SaveOutlined />} loading={loading}>
            Принять товар на склад
          </Button>
        </Form.Item>
      </Form>
    </Card>
  );
};

export default ReceiptCreatePage;
