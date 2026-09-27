import React, { useEffect, useState } from 'react';
import { 
  Table, Button, Space, Modal, Form, Input, Switch, 
  message, Card, Tag, Popconfirm, Typography, Radio, Divider 
} from 'antd';
import { 
  PlusOutlined, 
  EditOutlined, 
  ReloadOutlined,
  CheckCircleOutlined,
  StopOutlined,
  LockOutlined
} from '@ant-design/icons';
import apiClient from '../../api/client';

const { Text } = Typography;

interface User {
  id: number;
  username: string;
  email: string | null;
  full_name: string | null;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
  roles: Role[];
  role_name?: string;
}

interface Role {
  id: number;
  name: string;
  description: string | null;
  is_system?: boolean;
  permissions: Permission[];
}

interface Permission {
  id: number;
  name: string;
  description: string | null;
}

const UsersPage: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [form] = Form.useForm();

  // Состояния для модалки смены пароля
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [userForPasswordChange, setUserForPasswordChange] = useState<User | null>(null);
  const [passwordForm] = Form.useForm();

  useEffect(() => {
    fetchUsers();
    fetchRoles();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get<User[]>('/users/');
      setUsers(response.data);
    } catch (error) {
      message.error('Не удалось загрузить список пользователей');
    } finally {
      setLoading(false);
    }
  };

  const fetchRoles = async () => {
    try {
      const response = await apiClient.get<Role[]>('/users/roles/list');
      setRoles(response.data);
    } catch (error) {
      console.error('Не удалось загрузить роли');
    }
  };

  const handleOpenModal = (user?: User) => {
    setEditingUser(user || null);
    if (user) {
      form.setFieldsValue({
        username: user.username,
        email: user.email,
        full_name: user.full_name,
        is_active: user.is_active,
        role_ids: user.roles.length > 0 ? [user.roles[0].id] : [],
      });
    } else {
      form.resetFields();
      form.setFieldsValue({ is_active: true, role_ids: [] });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (values: any) => {
    try {
      if (editingUser) {
        await apiClient.put(`/users/${editingUser.id}`, {
          email: values.email,
          full_name: values.full_name,
          is_active: values.is_active,
          role_ids: values.role_ids || [],
        });
        message.success('Пользователь обновлён');
      } else {
        await apiClient.post('/users/register', {
          username: values.username,
          email: values.email,
          full_name: values.full_name,
          password: values.password,
          role_ids: values.role_ids || [],
        });
        message.success('Пользователь создан');
      }
      setIsModalOpen(false);
      form.resetFields();
      fetchUsers();
    } catch (error: any) {
      message.error(error.response?.data?.detail || 'Ошибка при сохранении');
    }
  };

  const handleToggleActive = async (user: User) => {
    try {
      if (user.is_active) {
        await apiClient.patch(`/users/${user.id}/deactivate`);
        message.success('Пользователь деактивирован');
      } else {
        await apiClient.patch(`/users/${user.id}/activate`);
        message.success('Пользователь активирован');
      }
      fetchUsers();
    } catch (error: any) {
      message.error(error.response?.data?.detail || 'Ошибка при изменении статуса');
    }
  };

  const handleOpenPasswordModal = (user: User) => {
    setUserForPasswordChange(user);
    passwordForm.resetFields();
    setIsPasswordModalOpen(true);
  };

  const handleChangePassword = async (values: any) => {
    if (!userForPasswordChange) return;
    
    try {
      await apiClient.patch(`/users/${userForPasswordChange.id}/change-password`, {
        new_password: values.new_password
      });
      message.success('Пароль изменён');
      setIsPasswordModalOpen(false);
      passwordForm.resetFields();
    } catch (error: any) {
      message.error(error.response?.data?.detail || 'Ошибка при смене пароля');
    }
  };

  const columns = [
    {
      title: 'Имя пользователя',
      dataIndex: 'username',
      key: 'username',
      render: (text: string) => <Text strong>{text}</Text>,
    },
    {
      title: 'Полное имя',
      dataIndex: 'full_name',
      key: 'full_name',
      render: (text: string) => text || '—',
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
      render: (text: string) => text || '—',
    },
    {
      title: 'Роль',
      key: 'roles',
      render: (_: any, record: User) => (
        <Space wrap>
          {record.roles.length > 0 ? (
            record.roles.map(role => (
              <Tag key={role.id} color="blue">{role.name}</Tag>
            ))
          ) : (
            <Text type="secondary">Не назначена</Text>
          )}
        </Space>
      ),
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
      width: 280,
      render: (_: any, record: User) => (
        <Space size="small">
          <Button 
            type="link" 
            size="small" 
            icon={<EditOutlined />} 
            onClick={() => handleOpenModal(record)}
          >
            Изменить
          </Button>
          <Button 
            type="link" 
            size="small" 
            icon={<LockOutlined />} 
            onClick={() => handleOpenPasswordModal(record)}
          >
            Пароль
          </Button>
          <Popconfirm
            title={record.is_active ? 'Деактивировать пользователя?' : 'Активировать пользователя?'}
            onConfirm={() => handleToggleActive(record)}
            okText="Да"
            cancelText="Нет"
          >
            <Button 
              type="link" 
              size="small" 
              danger={record.is_active}
              icon={record.is_active ? <StopOutlined /> : <CheckCircleOutlined />}
            >
              {record.is_active ? 'Деактивировать' : 'Активировать'}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Card 
        title="Пользователи"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={fetchUsers} loading={loading}>
              Обновить
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => handleOpenModal()}>
              Добавить пользователя
            </Button>
          </Space>
        }
      >
        <Table 
          columns={columns} 
          dataSource={users} 
          rowKey="id" 
          loading={loading}
          pagination={{ 
            pageSize: 20, 
            showSizeChanger: true,
            showTotal: (total, range) => `${range[0]}-${range[1]} из ${total}`,
          }}
        />
      </Card>

      {/* Модалка создания/редактирования пользователя */}
      <Modal
        title={editingUser ? 'Редактировать пользователя' : 'Новый пользователь'}
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
            name="username" 
            label="Имя пользователя" 
            rules={[{ required: true, message: 'Введите имя пользователя' }]}
          >
            <Input placeholder="ivanov" disabled={!!editingUser} />
          </Form.Item>

          {!editingUser && (
            <Form.Item 
              name="password" 
              label="Пароль" 
              rules={[
                { required: true, message: 'Введите пароль' },
                { min: 6, message: 'Минимум 6 символов' }
              ]}
            >
              <Input.Password placeholder="Минимум 6 символов" />
            </Form.Item>
          )}

          <Form.Item name="full_name" label="Полное имя">
            <Input placeholder="Иванов Иван Иванович" />
          </Form.Item>

          <Form.Item name="email" label="Email">
            <Input placeholder="ivanov@example.com" />
          </Form.Item>

          <Divider>Роль</Divider>
          <Form.Item 
            name="role_ids" 
            label="Назначить роль"
            rules={[{ required: true, message: 'Выберите роль' }]}
            getValueFromEvent={(e) => [e.target.value]}
            getValueProps={(value) => ({ value: Array.isArray(value) ? value[0] : value })}
          >
            <Radio.Group style={{ width: '100%' }}>
              <Space direction="vertical" style={{ width: '100%' }}>
                {roles.map(role => (
                  <Radio 
                    key={role.id} 
                    value={role.id}
                    style={{ 
                      display: 'block',
                      height: 'auto',
                      marginLeft: 0,
                      padding: '8px 12px',
                      border: '1px solid #f0f0f0',
                      borderRadius: 6,
                      marginBottom: 8
                    }}
                  >
                    <div style={{ marginLeft: 0 }}>
                      <div style={{ marginBottom: 4 }}>
                        <Text strong>{role.name}</Text>
                        {role.is_system && <Tag color="default" style={{ marginLeft: 8, fontSize: 11 }}>Системная</Tag>}
                      </div>
                      {role.description && (
                        <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>
                          {role.description}
                        </div>
                      )}
                      <div style={{ fontSize: 12, color: '#999' }}>
                        Прав: {role.permissions.length}
                      </div>
                    </div>
                  </Radio>
                ))}
              </Space>
            </Radio.Group>
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

      {/* Модалка смены пароля */}
      <Modal
        title={`Сменить пароль для ${userForPasswordChange?.username}`}
        open={isPasswordModalOpen}
        onCancel={() => {
          setIsPasswordModalOpen(false);
          passwordForm.resetFields();
        }}
        footer={null}
        width={400}
      >
        <Form form={passwordForm} layout="vertical" onFinish={handleChangePassword}>
          <Form.Item 
            name="new_password" 
            label="Новый пароль" 
            rules={[
              { required: true, message: 'Введите новый пароль' },
              { min: 6, message: 'Минимум 6 символов' }
            ]}
          >
            <Input.Password placeholder="Введите новый пароль" />
          </Form.Item>

          <Form.Item 
            name="confirm_password" 
            label="Подтвердите пароль" 
            dependencies={['new_password']}
            rules={[
              { required: true, message: 'Подтвердите пароль' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('new_password') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('Пароли не совпадают'));
                },
              }),
            ]}
          >
            <Input.Password placeholder="Повторите пароль" />
          </Form.Item>

          <Form.Item style={{ textAlign: 'right', marginBottom: 0, marginTop: 24 }}>
            <Space>
              <Button onClick={() => {
                setIsPasswordModalOpen(false);
                passwordForm.resetFields();
              }}>
                Отмена
              </Button>
              <Button type="primary" htmlType="submit">
                Сменить пароль
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default UsersPage;
