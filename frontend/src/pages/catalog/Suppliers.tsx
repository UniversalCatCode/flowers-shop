import React, { useEffect, useState } from 'react';
import { 
  Table, Button, Space, Modal, Form, Input, Switch, 
  message, Card, Tag, Popconfirm, Typography 
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons';
import apiClient from '../../api/client';

const { Text } = Typography;

interface Supplier {
  id: number;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  is_active: boolean;
}

const SuppliersPage: React.FC = () => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get<any>('/catalog/suppliers?limit=500');
      const data = Array.isArray(response.data) ? response.data : (response.data?.items || []);
      setSuppliers(data);
    } catch (error) {
      message.error('Не удалось загрузить список поставщиков');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (supplier?: Supplier) => {
    setEditingSupplier(supplier || null);
    if (supplier) {
      form.setFieldsValue(supplier);
    } else {
      form.resetFields();
      form.setFieldsValue({ is_active: true });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (values: any) => {
    try {
      if (editingSupplier) {
        await apiClient.patch(`/catalog/suppliers/${editingSupplier.id}`, values);
        message.success('Поставщик обновлён');
      } else {
        await apiClient.post('/catalog/suppliers', values);
        message.success('Поставщик создан');
      }
      setIsModalOpen(false);
      form.resetFields();
      fetchData();
    } catch (error: any) {
      message.error(error.response?.data?.detail || 'Ошибка при сохранении');
    }
  };

  const handleToggleActive = async (supplier: Supplier) => {
    try {
      await apiClient.patch(`/catalog/suppliers/${supplier.id}`, {
        is_active: !supplier.is_active
      });
      message.success(`Поставщик ${!supplier.is_active ? 'активирован' : 'деактивирован'}`);
      fetchData();
    } catch (error) {
      message.error('Ошибка при изменении статуса');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await apiClient.delete(`/catalog/suppliers/${id}`);
      message.success('Поставщик удалён');
      fetchData();
    } catch (error: any) {
      message.error(error.response?.data?.detail || 'Ошибка при удалении (возможно, есть связанные данные)');
    }
  };

  const columns = [
    {
      title: 'Название',
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => <Text strong>{text}</Text>,
    },
    {
      title: 'Контактное лицо',
      dataIndex: 'contact_person',
      key: 'contact_person',
      render: (text: string) => text || '—',
    },
    {
      title: 'Телефон',
      dataIndex: 'phone',
      key: 'phone',
      render: (text: string) => text || '—',
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
      render: (text: string) => text || '—',
    },
    {
      title: 'Статус',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 100,
      render: (isActive: boolean) => (
        <Tag color={isActive ? 'success' : 'default'}>
          {isActive ? 'Активен' : 'Неактивен'}
        </Tag>
      ),
    },
    {
      title: 'Действия',
      key: 'actions',
      width: 150,
      render: (_: any, record: Supplier) => (
        <Space size="small">
          <Button 
            type="link" 
            size="small" 
            icon={<EditOutlined />} 
            onClick={() => handleOpenModal(record)}
          >
            Изменить
          </Button>
          <Popconfirm
            title="Удалить поставщика?"
            description="Это действие нельзя отменить. Убедитесь, что у поставщика нет связанных партий."
            onConfirm={() => handleDelete(record.id)}
            okText="Да"
            cancelText="Нет"
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              Удалить
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Card 
        title="Поставщики"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>
              Обновить
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => handleOpenModal()}>
              Добавить поставщика
            </Button>
          </Space>
        }
      >
        <Table 
          columns={columns} 
          dataSource={suppliers} 
          rowKey="id" 
          loading={loading}
          pagination={{ 
            pageSize: 20, 
            showSizeChanger: true,
            showTotal: (total, range) => `${range[0]}-${range[1]} из ${total}`,
          }}
        />
      </Card>

      {/* Модалка создания/редактирования */}
      <Modal
        title={editingSupplier ? 'Редактировать поставщика' : 'Новый поставщик'}
        open={isModalOpen}
        onCancel={() => {
          setIsModalOpen(false);
          form.resetFields();
        }}
        footer={null}
        width={600}
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item 
            name="name" 
            label="Название компании" 
            rules={[{ required: true, message: 'Введите название' }]}
          >
            <Input placeholder="ООО «Цветы и Упаковка»" />
          </Form.Item>

          <Form.Item name="contact_person" label="Контактное лицо">
            <Input placeholder="Иванов Иван Иванович" />
          </Form.Item>

          <Space style={{ width: '100%' }} size="middle">
            <Form.Item name="phone" label="Телефон" style={{ flex: 1 }}>
              <Input placeholder="+7 (999) 123-45-67" />
            </Form.Item>
            <Form.Item name="email" label="Email" style={{ flex: 1 }}>
              <Input placeholder="info@supplier.ru" />
            </Form.Item>
          </Space>

          <Form.Item name="address" label="Адрес">
            <Input placeholder="г. Москва, ул. Цветочная, д. 1" />
          </Form.Item>

          <Form.Item name="is_active" label="Статус" valuePropName="checked">
            <Switch checkedChildren="Активен" unCheckedChildren="Неактивен" />
          </Form.Item>

          <Form.Item style={{ textAlign: 'right', marginBottom: 0, marginTop: 24 }}>
            <Space>
              <Button onClick={() => {
                setIsModalOpen(false);
                form.resetFields();
              }}>
                Отмена
              </Button>
              <Button type="primary" htmlType="submit">
                Сохранить
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default SuppliersPage;
