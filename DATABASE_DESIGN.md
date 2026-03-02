# RJL 数据库设计文档

> **生成日期**: 2026-03-03
> **数据库**: Neon PostgreSQL (项目: `sparkling-tree-12066464`, 分支: `br-ancient-night-a7tqxg66`)
> **表总数**: 19 张
> **自定义枚举**: 1 个 (`Region`)

---

## 目录

- [第一部分：数据表结构详解](#第一部分数据表结构详解)
  - [1. AGENCY — 中介公司](#1-agency--中介公司)
  - [2. AGENCY_WHITELIST — 中介邮箱白名单](#2-agency_whitelist--中介邮箱白名单)
  - [3. USER — 用户](#3-user--用户)
  - [4. PERMISSION — 权限定义](#4-permission--权限定义)
  - [5. USER_PERMISSION — 用户-权限关联](#5-user_permission--用户-权限关联)
  - [6. PROPERTY — 物业/房产](#6-property--物业房产)
  - [7. CONTACT — 联系人](#7-contact--联系人)
  - [8. EMAIL — 邮件记录](#8-email--邮件记录)
  - [9. _EmailToProperty — 邮件-物业多对多关联](#9-_emailtoproperty--邮件-物业多对多关联)
  - [10. TASK — 任务](#10-task--任务)
  - [11. TASK_FILES — 任务附件](#11-task_files--任务附件)
  - [12. VEU_PROJECT — VEU 项目](#12-veu_project--veu-项目)
  - [13. VEU_PROJECT_FILES — VEU 项目文件](#13-veu_project_files--veu-项目文件)
  - [14. INSPECTION_CONFIG — 检查区域配置](#14-inspection_config--检查区域配置)
  - [15. INSPECTION_SCHEDULE — 检查日程](#15-inspection_schedule--检查日程)
  - [16. INSPECTION_SLOT — 检查时段](#16-inspection_slot--检查时段)
  - [17. INSPECTION_BOOKING — 检查预约](#17-inspection_booking--检查预约)
  - [18. INSPECTION_NOTIFICATION — 检查通知](#18-inspection_notification--检查通知)
  - [19. SYSTEM_SETTINGS — 系统设置](#19-system_settings--系统设置)
- [第二部分：ER 关系图](#第二部分er-关系图)
- [第三部分：问题与改进建议](#第三部分问题与改进建议)
- [第四部分：优先级改进方案](#第四部分优先级改进方案)

---

## 枚举类型

### Region

| 值 | 说明 |
|---|---|
| `EAST` | 东区 |
| `SOUTH` | 南区 |
| `WEST` | 西区 |
| `NORTH` | 北区 |
| `CENTRAL` | 中区 |

---

## 第一部分：数据表结构详解

### 1. AGENCY — 中介公司

**业务说明**: 存储中介公司的基本信息。一个中介公司下有多个用户和任务。

| 列名 | 类型 | 可空 | 默认值 | 说明 |
|---|---|---|---|---|
| `id` | `integer` | NO | `autoincrement` | 主键 |
| `agency_name` | `varchar(255)` | NO | - | 公司名称 |
| `address` | `text` | YES | - | 公司地址 |
| `phone` | `varchar(50)` | YES | - | 联系电话 |
| `logo` | `text` | YES | - | Logo 图片 URL |
| `is_active` | `boolean` | YES | `true` | 是否启用 |
| `veu_activated` | `boolean` | YES | `false` | 是否开通 VEU 功能 |
| `created_at` | `timestamp` ⚠️ | YES | `now()` | 创建时间 |
| `updated_at` | `timestamp` ⚠️ | YES | `now()` | 更新时间 |

**约束**:
- `AGENCY_pkey`: PRIMARY KEY (`id`)

**索引**:
- `AGENCY_pkey`: UNIQUE btree (`id`)

**被引用关系**:
- `USER.agency_id` → `AGENCY.id` (ON DELETE SET NULL)
- `AGENCY_WHITELIST.agency_id` → `AGENCY.id`
- `TASK.agency_id` → `AGENCY.id`
- `EMAIL.agency_id` → `AGENCY.id`

> ⚠️ **注意**: `created_at` / `updated_at` 使用 `timestamp`（无时区），其他表均使用 `timestamptz`（带时区），存在不一致。

---

### 2. AGENCY_WHITELIST — 中介邮箱白名单

**业务说明**: 记录每个中介公司允许的邮箱地址，用于邮件匹配和权限控制。

| 列名 | 类型 | 可空 | 默认值 | 说明 |
|---|---|---|---|---|
| `id` | `integer` | NO | `autoincrement` | 主键 |
| `agency_id` | `integer` | NO | - | 所属中介 |
| `email_address` | `varchar(255)` | NO | - | 白名单邮箱地址 |
| `created_at` | `timestamptz` | YES | `now()` | 创建时间 |
| `updated_at` | `timestamptz` | YES | `now()` | 更新时间 |

**约束**:
- `AGENCY_WHITELIST_pkey`: PRIMARY KEY (`id`)
- `fk_agency`: FOREIGN KEY (`agency_id`) → `AGENCY`(`id`)

**索引**:
- `AGENCY_WHITELIST_pkey`: UNIQUE btree (`id`)

> ⚠️ **注意**: `agency_id` 无单独索引，按 agency 查询白名单需全表扫描。

---

### 3. USER — 用户

**业务说明**: 存储系统用户信息，包括认证凭证和角色。角色层级: `superuser` > `admin` > `agencyAdmin` > `agencyUser`。

| 列名 | 类型 | 可空 | 默认值 | 说明 |
|---|---|---|---|---|
| `id` | `integer` | NO | `autoincrement` | 主键 |
| `email` | `varchar(255)` | NO | - | 登录邮箱（唯一） |
| `name` | `varchar(255)` | YES | - | 用户姓名 |
| `password` | `varchar(255)` | NO | - | 密码哈希 |
| `role` | `varchar(50)` | NO | - | 角色（无 CHECK 约束） |
| `is_active` | `boolean` | NO | `true` | 是否启用 |
| `refresh_token` | `text` | YES | - | JWT 刷新令牌 |
| `reset_token` | `varchar(64)` | YES | - | 密码重置令牌 |
| `reset_token_expires` | `timestamptz` | YES | - | 重置令牌过期时间 |
| `agency_id` | `integer` | YES | - | 所属中介（可为空，superuser/admin 无中介） |
| `created_at` | `timestamptz` | YES | `now()` | 创建时间 |
| `updated_at` | `timestamptz` | YES | `now()` | 更新时间 |

**约束**:
- `USER_pkey`: PRIMARY KEY (`id`)
- `USER_email_key`: UNIQUE (`email`)
- `fk_agency`: FOREIGN KEY (`agency_id`) → `AGENCY`(`id`) ON DELETE SET NULL

**索引**:
- `USER_pkey`: UNIQUE btree (`id`)
- `USER_email_key`: UNIQUE btree (`email`)

**被引用关系**:
- `PROPERTY.user_id` → `USER.id`
- `USER_PERMISSION.user_id` → `USER.id`
- `INSPECTION_SCHEDULE.created_by` → `USER.id`
- `INSPECTION_BOOKING.confirmed_by` → `USER.id`
- `INSPECTION_BOOKING.booked_by_user_id` → `USER.id`
- `INSPECTION_NOTIFICATION.user_id` → `USER.id`

---

### 4. PERMISSION — 权限定义

**业务说明**: 定义系统中可分配的权限。每条记录代表一个具体的权限项（如 `read` + `property`）。

| 列名 | 类型 | 可空 | 默认值 | 说明 |
|---|---|---|---|---|
| `id` | `integer` | NO | `autoincrement` | 主键 |
| `permission_value` | `varchar(50)` | NO | - | 权限值（如 read, write, delete） |
| `permission_scope` | `varchar(50)` | NO | - | 权限范围（如 property, task, user） |

**约束**:
- `permission_pkey`: PRIMARY KEY (`id`)

**索引**:
- `permission_pkey`: UNIQUE btree (`id`)

**被引用关系**:
- `USER_PERMISSION.permission_id` → `PERMISSION.id`

> ⚠️ **注意**: 缺少 `(permission_value, permission_scope)` 唯一约束，可能产生重复权限记录。

---

### 5. USER_PERMISSION — 用户-权限关联

**业务说明**: 多对多关联表，将权限分配给用户。使用复合主键。

| 列名 | 类型 | 可空 | 默认值 | 说明 |
|---|---|---|---|---|
| `user_id` | `integer` | NO | - | 用户 ID |
| `permission_id` | `integer` | NO | - | 权限 ID |

**约束**:
- `user_permission_pkey`: PRIMARY KEY (`user_id`, `permission_id`)
- `user_permission_fk_user_id`: FOREIGN KEY (`user_id`) → `USER`(`id`)
- `user_permission_fk_permission_id`: FOREIGN KEY (`permission_id`) → `PERMISSION`(`id`)

**索引**:
- `user_permission_pkey`: UNIQUE btree (`user_id`, `permission_id`)

> ⚠️ **注意**: 复合主键以 `user_id` 开头，按 `permission_id` 单独查询效率低（无单独索引）。

---

### 6. PROPERTY — 物业/房产

**业务说明**: 存储房产信息。每个房产属于一个用户（`user_id`），通过用户间接关联到中介公司。

| 列名 | 类型 | 可空 | 默认值 | 说明 |
|---|---|---|---|---|
| `id` | `integer` | NO | `autoincrement` | 主键 |
| `address` | `text` | YES | - | 房产地址 |
| `user_id` | `integer` | NO | - | 所属用户（管理人） |
| `region` | `Region` | YES | - | 所在区域（枚举） |
| `is_active` | `boolean` | YES | `true` | 是否启用 |
| `created_at` | `timestamptz` | YES | `now()` | 创建时间 |
| `updated_at` | `timestamptz` | YES | `now()` | 更新时间 |

**约束**:
- `PROPERTY_pkey`: PRIMARY KEY (`id`)
- `fk_user`: FOREIGN KEY (`user_id`) → `USER`(`id`)

**索引**:
- `PROPERTY_pkey`: UNIQUE btree (`id`)
- `idx_property_region`: btree (`region`)

**被引用关系**:
- `CONTACT.property_id` → `PROPERTY.id`
- `TASK.property_id` → `PROPERTY.id`
- `VEU_PROJECT.property_id` → `PROPERTY.id`
- `_EmailToProperty.B` → `PROPERTY.id`（⚠️ FK 缺失）
- `INSPECTION_BOOKING.property_id` → `PROPERTY.id`
- `INSPECTION_NOTIFICATION.property_id` → `PROPERTY.id`

> ⚠️ **注意**: `user_id` 无索引，按用户查询房产需全表扫描。

---

### 7. CONTACT — 联系人

**业务说明**: 存储物业相关联系人（如租户、业主）。通过 `property_id` 关联到房产。

| 列名 | 类型 | 可空 | 默认值 | 说明 |
|---|---|---|---|---|
| `id` | `integer` | NO | `autoincrement` | 主键 |
| `name` | `varchar(255)` | NO | - | 联系人姓名 |
| `phone` | `varchar(100)` | YES | - | 电话 |
| `email` | `varchar(255)` | YES | - | 邮箱 |
| `is_active` | `boolean` | YES | `true` | 是否启用 |
| `property_id` | `integer` | YES | - | 关联房产 |
| `created_at` | `timestamptz` | YES | `now()` | 创建时间 |
| `updated_at` | `timestamptz` | YES | `now()` | 更新时间 |

**约束**:
- `CONTACT_pkey`: PRIMARY KEY (`id`)
- `fk_contact_property`: FOREIGN KEY (`property_id`) → `PROPERTY`(`id`)

**索引**:
- `CONTACT_pkey`: UNIQUE btree (`id`)

> ⚠️ **注意**: `property_id` 无索引。联系人无直接关联到中介公司，需通过 `PROPERTY → USER → AGENCY` 三表关联。

---

### 8. EMAIL — 邮件记录

**业务说明**: 存储系统收发的邮件，支持入站（inbound）和出站（outbound）两个方向。通过 `_EmailToProperty` 关联到多个房产。

| 列名 | 类型 | 可空 | 默认值 | 说明 |
|---|---|---|---|---|
| `id` | `integer` | NO | `autoincrement` | 主键 |
| `subject` | `text` | YES | - | 邮件主题 |
| `sender` | `text` | YES | - | 发件人 |
| `recipient` | `text` | YES | - | 收件人 |
| `email_body` | `text` | YES | - | 纯文本内容 |
| `html` | `text` | YES | - | HTML 内容 |
| `agency_id` | `integer` | YES | - | 所属中介 |
| `gmail_msgid` | `varchar(64)` | YES | - | Gmail 消息 ID（唯一） |
| `is_processed` | `boolean` | NO | `false` | 是否已处理 |
| `process_note` | `text` | YES | - | 处理备注 |
| `direction` | `varchar(20)` | YES | `'inbound'` | 方向（inbound/outbound） |
| `created_at` | `timestamptz` | YES | `now()` | 创建时间 |
| `updated_at` | `timestamptz` | YES | `now()` | 更新时间 |

**约束**:
- `EMAIL_pkey`: PRIMARY KEY (`id`)
- `EMAIL_gmail_msgid_key`: UNIQUE (`gmail_msgid`)
- `fk_email_agency`: FOREIGN KEY (`agency_id`) → `AGENCY`(`id`)

**索引**:
- `EMAIL_pkey`: UNIQUE btree (`id`)
- `EMAIL_gmail_msgid_key`: UNIQUE btree (`gmail_msgid`)
- `idx_email_direction`: btree (`direction`)

**被引用关系**:
- `TASK.email_id` → `EMAIL.id`
- `_EmailToProperty.A` → `EMAIL.id` (ON DELETE CASCADE)

> ⚠️ **注意**: `agency_id` 无索引，按中介筛选邮件需全表扫描。

---

### 9. _EmailToProperty — 邮件-物业多对多关联

**业务说明**: Prisma 隐式多对多关联表，记录邮件与房产的关联关系。列名 `A`/`B` 为 Prisma 约定（`A`=Email, `B`=Property）。

| 列名 | 类型 | 可空 | 默认值 | 说明 |
|---|---|---|---|---|
| `A` | `integer` | NO | - | 邮件 ID (→ EMAIL) |
| `B` | `integer` | NO | - | 房产 ID (→ PROPERTY) |

**约束**:
- `_EmailToProperty_A_fkey`: FOREIGN KEY (`A`) → `EMAIL`(`id`) ON DELETE CASCADE
- ⚠️ **缺失**: `B` 列无外键约束指向 `PROPERTY`(`id`)

**索引**:
- `_EmailToProperty_AB_unique`: UNIQUE btree (`A`, `B`)
- `_EmailToProperty_B_index`: btree (`B`)

> ⚠️ **严重问题**: `B` 列缺少外键约束，删除 PROPERTY 后可能产生孤儿记录。Prisma 隐式关联表的 `A`/`B` 列名无业务语义，难以维护。

---

### 10. TASK — 任务

**业务说明**: 核心业务表，记录中介对房产的各项任务（维修、检查等）。任务同时关联到房产、中介和可选的来源邮件。

| 列名 | 类型 | 可空 | 默认值 | 说明 |
|---|---|---|---|---|
| `id` | `integer` | NO | `autoincrement` | 主键 |
| `property_id` | `integer` | NO | - | 关联房产 |
| `due_date` | `timestamp` | YES | - | 截止日期 |
| `task_name` | `varchar(255)` | YES | - | 任务名称 |
| `task_description` | `text` | YES | - | 任务描述 |
| `repeat_frequency` | `varchar(20)` | YES | `'none'` | 重复频率（none/daily/weekly/…） |
| `inspection_date` | `timestamp` | YES | - | 检查日期 |
| `type` | `varchar(255)` | YES | - | 任务类型 |
| `status` | `varchar(20)` | YES | `'unknown'` | 状态（无 CHECK 约束） |
| `is_active` | `boolean` | YES | `true` | 是否启用 |
| `email_id` | `integer` | YES | - | 来源邮件 |
| `agency_id` | `integer` | NO | - | 所属中介 |
| `free_check_available` | `boolean` | YES | `false` | 是否可免费检查 |
| `created_at` | `timestamptz` | YES | `now()` | 创建时间 |
| `updated_at` | `timestamptz` | YES | `now()` | 更新时间 |

**约束**:
- `TASK_pkey`: PRIMARY KEY (`id`)
- `fk_task_property`: FOREIGN KEY (`property_id`) → `PROPERTY`(`id`)
- `fk_task_agency`: FOREIGN KEY (`agency_id`) → `AGENCY`(`id`)
- `fk_email`: FOREIGN KEY (`email_id`) → `EMAIL`(`id`)

**索引**:
- `TASK_pkey`: UNIQUE btree (`id`)

**被引用关系**:
- `TASK_FILES.task_id` → `TASK.id`
- `INSPECTION_BOOKING.task_id` → `TASK.id`

> ⚠️ **注意**: `property_id`、`agency_id`、`email_id` 三个外键列均无索引，JOIN 查询性能差。`status` 和 `type` 无数据库级校验。

---

### 11. TASK_FILES — 任务附件

**业务说明**: 存储任务相关的文件（S3 存储），如照片、文档等。

| 列名 | 类型 | 可空 | 默认值 | 说明 |
|---|---|---|---|---|
| `id` | `integer` | NO | `autoincrement` | 主键 |
| `task_id` | `integer` | NO | - | 关联任务 |
| `file_s3_key` | `varchar(255)` | NO | - | S3 文件路径 |
| `file_name` | `varchar(255)` | NO | - | 文件名 |
| `file_desc` | `text` | YES | - | 文件描述 |
| `created_at` | `timestamptz` | YES | `now()` | 创建时间 |
| `updated_at` | `timestamptz` | YES | `now()` | 更新时间 |

**约束**:
- `TASK_FILES_pkey`: PRIMARY KEY (`id`)
- `fk_task`: FOREIGN KEY (`task_id`) → `TASK`(`id`) ⚠️ 无 CASCADE

**索引**:
- `TASK_FILES_pkey`: UNIQUE btree (`id`)

> ⚠️ **注意**: `task_id` 无索引。外键使用默认 NO ACTION，删除 TASK 时不会自动清理文件记录（应使用 CASCADE）。

---

### 12. VEU_PROJECT — VEU 项目

**业务说明**: 记录物业的 VEU (Victorian Energy Upgrades) 项目，支持热水器和空调两种类型。每个物业每种类型只能有一个项目。

| 列名 | 类型 | 可空 | 默认值 | 说明 |
|---|---|---|---|---|
| `id` | `integer` | NO | `autoincrement` | 主键 |
| `property_id` | `integer` | NO | - | 关联房产 |
| `type` | `varchar(50)` | YES | - | 项目类型（CHECK 约束） |
| `is_completed` | `boolean` | YES | `false` | 是否完成 |
| `price` | `decimal(10,2)` | YES | - | 价格 |
| `completed_by` | `varchar(255)` | YES | - | 完成人 |
| `note` | `text` | YES | - | 备注 |
| `created_at` | `timestamptz` | YES | `now()` | 创建时间 |
| `updated_at` | `timestamptz` | YES | `now()` | 更新时间 |

**约束**:
- `VEU_PROJECT_pkey`: PRIMARY KEY (`id`)
- `fk_veu_project_property`: FOREIGN KEY (`property_id`) → `PROPERTY`(`id`)
- `idx_veu_project_property_type_unique`: UNIQUE (`property_id`, `type`)
- `veu_project_type_check`: CHECK (`type IN ('water_heater', 'air_conditioner')`)

**索引**:
- `VEU_PROJECT_pkey`: UNIQUE btree (`id`)
- `idx_veu_project_property_type_unique`: UNIQUE btree (`property_id`, `type`)

**被引用关系**:
- `VEU_PROJECT_FILES.veu_project_id` → `VEU_PROJECT.id` (ON DELETE CASCADE)

---

### 13. VEU_PROJECT_FILES — VEU 项目文件

**业务说明**: 存储 VEU 项目相关文件。删除项目时自动级联删除文件记录。

| 列名 | 类型 | 可空 | 默认值 | 说明 |
|---|---|---|---|---|
| `id` | `integer` | NO | `autoincrement` | 主键 |
| `veu_project_id` | `integer` | NO | - | 关联 VEU 项目 |
| `file_s3_key` | `varchar(500)` | NO | - | S3 文件路径 |
| `file_name` | `varchar(255)` | NO | - | 文件名 |
| `file_desc` | `text` | YES | `''` | 文件描述 |
| `created_at` | `timestamptz` | YES | `now()` | 创建时间 |
| `updated_at` | `timestamptz` | YES | `now()` | 更新时间 |

**约束**:
- `VEU_PROJECT_FILES_pkey`: PRIMARY KEY (`id`)
- `veu_project_files_veu_project_id_fkey`: FOREIGN KEY (`veu_project_id`) → `VEU_PROJECT`(`id`) ON DELETE CASCADE

**索引**:
- `VEU_PROJECT_FILES_pkey`: UNIQUE btree (`id`)
- `idx_veu_project_files_project_id`: btree (`veu_project_id`)
- `idx_veu_project_files_created_at`: btree (`created_at`)

> ✅ 这是文件表设计的良好范例：有外键索引、有 CASCADE 删除、有时间索引。

---

### 14. INSPECTION_CONFIG — 检查区域配置

**业务说明**: 定义每个区域的检查时间规则。每个区域唯一，用于生成检查日程。

| 列名 | 类型 | 可空 | 默认值 | 说明 |
|---|---|---|---|---|
| `id` | `integer` | NO | `autoincrement` | 主键 |
| `region` | `Region` | NO | - | 区域（枚举，唯一） |
| `start_time` | `varchar(5)` | NO | - | 开始时间（如 "08:30"） |
| `end_time` | `varchar(5)` | NO | - | 结束时间（如 "18:30"） |
| `slot_duration` | `integer` | NO | - | 时段时长（分钟） |
| `max_capacity` | `integer` | NO | `1` | 每时段最大预约数 |
| `is_active` | `boolean` | NO | `true` | 是否启用 |
| `created_at` | `timestamptz` | YES | `now()` | 创建时间 |
| `updated_at` | `timestamptz` | YES | - | 更新时间（Prisma @updatedAt） |

**约束**:
- `INSPECTION_CONFIG_pkey`: PRIMARY KEY (`id`)
- `INSPECTION_CONFIG_region_key`: UNIQUE (`region`)

**索引**:
- `INSPECTION_CONFIG_pkey`: UNIQUE btree (`id`)
- `INSPECTION_CONFIG_region_key`: UNIQUE btree (`region`)

---

### 15. INSPECTION_SCHEDULE — 检查日程

**业务说明**: 管理员发布的检查日程安排。每个区域每天最多一个日程。发布后系统自动生成时段（INSPECTION_SLOT）。

| 列名 | 类型 | 可空 | 默认值 | 说明 |
|---|---|---|---|---|
| `id` | `integer` | NO | `autoincrement` | 主键 |
| `region` | `Region` | NO | - | 区域 |
| `schedule_date` | `date` | NO | - | 日程日期 |
| `start_time` | `varchar(5)` | NO | - | 开始时间 |
| `end_time` | `varchar(5)` | NO | - | 结束时间 |
| `slot_duration` | `integer` | NO | - | 时段时长（分钟） |
| `max_capacity` | `integer` | NO | `1` | 每时段最大预约数 |
| `status` | `varchar(20)` | NO | `'published'` | 状态（published/closed） |
| `note` | `text` | YES | - | 备注 |
| `created_by` | `integer` | NO | - | 创建人 |
| `is_active` | `boolean` | NO | `true` | 是否启用 |
| `created_at` | `timestamptz` | YES | `now()` | 创建时间 |
| `updated_at` | `timestamptz` | YES | - | 更新时间 |

**约束**:
- `INSPECTION_SCHEDULE_pkey`: PRIMARY KEY (`id`)
- `idx_schedule_region_date`: UNIQUE (`region`, `schedule_date`)
- `INSPECTION_SCHEDULE_created_by_fkey`: FOREIGN KEY (`created_by`) → `USER`(`id`)

**索引**:
- `INSPECTION_SCHEDULE_pkey`: UNIQUE btree (`id`)
- `idx_schedule_region_date`: UNIQUE btree (`region`, `schedule_date`)
- `idx_schedule_date`: btree (`schedule_date`)

**被引用关系**:
- `INSPECTION_SLOT.schedule_id` → `INSPECTION_SCHEDULE.id` (ON DELETE CASCADE)
- `INSPECTION_NOTIFICATION.schedule_id` → `INSPECTION_SCHEDULE.id`

---

### 16. INSPECTION_SLOT — 检查时段

**业务说明**: 由日程自动生成的可预约时间段。维护预约计数器用于容量控制。

| 列名 | 类型 | 可空 | 默认值 | 说明 |
|---|---|---|---|---|
| `id` | `integer` | NO | `autoincrement` | 主键 |
| `schedule_id` | `integer` | NO | - | 关联日程 |
| `start_time` | `varchar(5)` | NO | - | 开始时间 |
| `end_time` | `varchar(5)` | NO | - | 结束时间 |
| `max_capacity` | `integer` | NO | `1` | 最大容量 |
| `current_bookings` | `integer` | NO | `0` | 当前预约数 ⚠️ |
| `is_available` | `boolean` | NO | `true` | 是否可预约 |
| `created_at` | `timestamptz` | YES | `now()` | 创建时间 |

**约束**:
- `INSPECTION_SLOT_pkey`: PRIMARY KEY (`id`)
- `INSPECTION_SLOT_schedule_id_fkey`: FOREIGN KEY (`schedule_id`) → `INSPECTION_SCHEDULE`(`id`) ON DELETE CASCADE

**索引**:
- `INSPECTION_SLOT_pkey`: UNIQUE btree (`id`)
- `idx_slot_schedule_available`: btree (`schedule_id`, `is_available`)

**被引用关系**:
- `INSPECTION_BOOKING.slot_id` → `INSPECTION_SLOT.id`

> ⚠️ **注意**: `current_bookings` 为反范式化计数器，可能与实际 BOOKING 记录数不一致。建议在应用层使用事务或考虑用计算列替代。

---

### 17. INSPECTION_BOOKING — 检查预约

**业务说明**: 记录检查预约信息。支持两种预约方式：联系人通过 token 预约，或 agency 用户代为预约。

| 列名 | 类型 | 可空 | 默认值 | 说明 |
|---|---|---|---|---|
| `id` | `integer` | NO | `autoincrement` | 主键 |
| `slot_id` | `integer` | NO | - | 关联时段 |
| `property_id` | `integer` | NO | - | 关联房产 |
| `task_id` | `integer` | YES | - | 关联任务 |
| `contact_id` | `integer` | YES | - | 关联联系人 |
| `contact_name` | `varchar(255)` | NO | - | 联系人姓名（冗余快照） |
| `contact_phone` | `varchar(100)` | YES | - | 联系人电话（冗余快照） |
| `contact_email` | `varchar(255)` | YES | - | 联系人邮箱（冗余快照） |
| `status` | `varchar(20)` | NO | `'pending'` | 状态（pending/confirmed/rejected/cancelled） |
| `note` | `text` | YES | - | 备注 |
| `booking_token` | `varchar(64)` | NO | - | 预约令牌（唯一） |
| `token_expires_at` | `timestamptz` | NO | - | 令牌过期时间（14天） |
| `confirmed_by` | `integer` | YES | - | 确认人 |
| `confirmed_at` | `timestamptz` | YES | - | 确认时间 |
| `booked_by_user_id` | `integer` | YES | - | 代约的 agency 用户 |
| `booker_type` | `varchar(20)` | YES | - | 预约者类型（contact/agencyUser） |
| `created_at` | `timestamptz` | YES | `now()` | 创建时间 |
| `updated_at` | `timestamptz` | YES | - | 更新时间 |

**约束**:
- `INSPECTION_BOOKING_pkey`: PRIMARY KEY (`id`)
- `INSPECTION_BOOKING_booking_token_key`: UNIQUE (`booking_token`)
- `INSPECTION_BOOKING_slot_id_fkey`: FK (`slot_id`) → `INSPECTION_SLOT`(`id`)
- `fk_booking_property`: FK (`property_id`) → `PROPERTY`(`id`)
- `INSPECTION_BOOKING_task_id_fkey`: FK (`task_id`) → `TASK`(`id`)
- `INSPECTION_BOOKING_contact_id_fkey`: FK (`contact_id`) → `CONTACT`(`id`)
- `INSPECTION_BOOKING_confirmed_by_fkey`: FK (`confirmed_by`) → `USER`(`id`)
- `INSPECTION_BOOKING_booked_by_user_id_fkey`: FK (`booked_by_user_id`) → `USER`(`id`)

**索引**:
- `INSPECTION_BOOKING_pkey`: UNIQUE btree (`id`)
- `INSPECTION_BOOKING_booking_token_key`: UNIQUE btree (`booking_token`)
- `idx_booking_token`: btree (`booking_token`) ⚠️ 冗余
- `idx_booking_property`: btree (`property_id`)
- `idx_booking_status`: btree (`status`)

> ⚠️ **注意**: `idx_booking_token` 与 `INSPECTION_BOOKING_booking_token_key` 功能完全重复，浪费存储空间和写入性能。

---

### 18. INSPECTION_NOTIFICATION — 检查通知

**业务说明**: 记录发送给联系人或 agency 用户的检查预约通知邮件。

| 列名 | 类型 | 可空 | 默认值 | 说明 |
|---|---|---|---|---|
| `id` | `integer` | NO | `autoincrement` | 主键 |
| `schedule_id` | `integer` | NO | - | 关联日程 |
| `property_id` | `integer` | NO | - | 关联房产 |
| `contact_id` | `integer` | YES | - | 关联联系人 |
| `user_id` | `integer` | YES | - | 关联 agency 用户 |
| `recipient_type` | `varchar(20)` | YES | - | 接收者类型（contact/agencyUser） |
| `recipient_email` | `varchar(255)` | NO | - | 接收者邮箱 |
| `booking_token` | `varchar(64)` | NO | - | 预约令牌 |
| `status` | `varchar(20)` | NO | `'sent'` | 发送状态（sent/delivered/failed） |
| `sent_at` | `timestamptz` | YES | `now()` | 发送时间 |
| `created_at` | `timestamptz` | YES | `now()` | 创建时间 |

**约束**:
- `INSPECTION_NOTIFICATION_pkey`: PRIMARY KEY (`id`)
- `INSPECTION_NOTIFICATION_schedule_id_fkey`: FK (`schedule_id`) → `INSPECTION_SCHEDULE`(`id`)
- `fk_notification_property`: FK (`property_id`) → `PROPERTY`(`id`)
- `INSPECTION_NOTIFICATION_contact_id_fkey`: FK (`contact_id`) → `CONTACT`(`id`)
- `INSPECTION_NOTIFICATION_user_id_fkey`: FK (`user_id`) → `USER`(`id`)

**索引**:
- `INSPECTION_NOTIFICATION_pkey`: UNIQUE btree (`id`)
- `idx_notification_schedule`: btree (`schedule_id`)
- `idx_notification_token`: btree (`booking_token`)
- `idx_notification_property_email`: btree (`property_id`, `recipient_email`)

---

### 19. SYSTEM_SETTINGS — 系统设置

**业务说明**: 存储全局系统配置（邮件服务器、Google Maps API Key 等）。设计为单行记录模式。

| 列名 | 类型 | 可空 | 默认值 | 说明 |
|---|---|---|---|---|
| `id` | `integer` | NO | `autoincrement` | 主键 |
| `email_host` | `text` | YES | - | IMAP 邮件服务器地址 |
| `google_map_key` | `text` | YES | - | Google Maps API Key |
| `email_user` | `varchar(255)` | YES | - | 邮件账号 |
| `email_password` | `varchar(255)` | YES | - | 邮件密码 ⚠️ |
| `created_at` | `timestamptz` | YES | `now()` | 创建时间 |
| `updated_at` | `timestamptz` | YES | `now()` | 更新时间 |

**约束**:
- `SYSTEM_SETTINGS_pkey`: PRIMARY KEY (`id`)

**索引**:
- `SYSTEM_SETTINGS_pkey`: UNIQUE btree (`id`)

> ⚠️ **注意**: 无机制确保只有一行记录（缺少 CHECK 约束或唯一列限制）。`email_password` 以明文/可逆方式存储在数据库中，存在安全风险。

---

## 第二部分：ER 关系图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            核心业务实体                                       │
│                                                                             │
│  ┌──────────┐    1:N     ┌──────────┐    1:N     ┌───────────┐              │
│  │  AGENCY  │◄──────────│   USER   │──────────►│  PROPERTY  │              │
│  │          │  agency_id │          │  user_id   │            │              │
│  └────┬─────┘            └────┬─────┘            └─────┬──────┘              │
│       │                       │                        │                     │
│       │ 1:N                   │ M:N                    │ 1:N                 │
│       ▼                       ▼                        ▼                     │
│  ┌──────────────┐   ┌──────────────────┐        ┌──────────┐               │
│  │   AGENCY     │   │ USER_PERMISSION  │        │ CONTACT  │               │
│  │  WHITELIST   │   │  (user_id, perm) │        │          │               │
│  └──────────────┘   └────────┬─────────┘        └──────────┘               │
│                              │                                              │
│                              ▼                                              │
│                      ┌──────────────┐                                       │
│                      │  PERMISSION  │                                       │
│                      └──────────────┘                                       │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                            任务与邮件                                        │
│                                                                             │
│   AGENCY ◄─── agency_id ───┐                                                │
│                             │                                                │
│   PROPERTY ◄─ property_id ─┤    ┌──────────┐   1:N   ┌──────────────┐      │
│                             ├────│   TASK   │────────►│  TASK_FILES  │      │
│   EMAIL ◄─── email_id ─────┘    └──────────┘         └──────────────┘      │
│     │                                                                       │
│     │  M:N (通过 _EmailToProperty)                                           │
│     │         ┌───────────────────┐                                         │
│     └────────►│ _EmailToProperty  │◄──── PROPERTY                           │
│               │   A (email_id)    │                                         │
│               │   B (property_id) │  ⚠️ B 列缺少 FK                         │
│               └───────────────────┘                                         │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                            VEU 项目                                         │
│                                                                             │
│   PROPERTY ◄─ property_id ── ┌──────────────┐  1:N  ┌────────────────────┐ │
│                               │ VEU_PROJECT  │──────►│ VEU_PROJECT_FILES  │ │
│                               │              │  CASCADE│                  │ │
│                               └──────────────┘       └────────────────────┘ │
│                                                                             │
│   UNIQUE(property_id, type)   CHECK(type IN water_heater, air_conditioner)  │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                            检查预约系统                                       │
│                                                                             │
│  ┌───────────────────┐                                                      │
│  │ INSPECTION_CONFIG │  每区域一条配置                                         │
│  │  region (UNIQUE)  │                                                      │
│  └───────────────────┘                                                      │
│                                                                             │
│  ┌─────────────────────┐  1:N  ┌──────────────────┐  1:N  ┌─────────────┐  │
│  │ INSPECTION_SCHEDULE │──────►│ INSPECTION_SLOT  │──────►│ INSPECTION  │  │
│  │   region + date     │CASCADE│ schedule_id      │       │  BOOKING    │  │
│  │   created_by → USER │       │ current_bookings │       │ slot_id     │  │
│  └──────────┬──────────┘       └──────────────────┘       │ property_id │  │
│             │                                              │ task_id     │  │
│             │ 1:N                                          │ contact_id  │  │
│             ▼                                              │ confirmed_by│  │
│  ┌─────────────────────────┐                              └─────────────┘  │
│  │ INSPECTION_NOTIFICATION │                                                │
│  │  schedule_id            │                                                │
│  │  property_id            │                                                │
│  │  contact_id / user_id   │                                                │
│  └─────────────────────────┘                                                │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────┐
│   SYSTEM_SETTINGS    │  单例配置表（无约束保证）
│   email_host         │
│   google_map_key     │
│   email_user/pass    │
└──────────────────────┘
```

### 外键关系汇总

| 源表 | 源列 | 目标表 | 目标列 | ON DELETE |
|---|---|---|---|---|
| AGENCY_WHITELIST | agency_id | AGENCY | id | NO ACTION |
| USER | agency_id | AGENCY | id | SET NULL |
| PROPERTY | user_id | USER | id | NO ACTION |
| CONTACT | property_id | PROPERTY | id | NO ACTION |
| EMAIL | agency_id | AGENCY | id | NO ACTION |
| _EmailToProperty | A | EMAIL | id | CASCADE |
| _EmailToProperty | B | PROPERTY | id | ⚠️ **无 FK** |
| TASK | property_id | PROPERTY | id | NO ACTION |
| TASK | agency_id | AGENCY | id | NO ACTION |
| TASK | email_id | EMAIL | id | NO ACTION |
| TASK_FILES | task_id | TASK | id | NO ACTION |
| VEU_PROJECT | property_id | PROPERTY | id | NO ACTION |
| VEU_PROJECT_FILES | veu_project_id | VEU_PROJECT | id | CASCADE |
| USER_PERMISSION | user_id | USER | id | NO ACTION |
| USER_PERMISSION | permission_id | PERMISSION | id | NO ACTION |
| INSPECTION_SCHEDULE | created_by | USER | id | NO ACTION |
| INSPECTION_SLOT | schedule_id | INSPECTION_SCHEDULE | id | CASCADE |
| INSPECTION_BOOKING | slot_id | INSPECTION_SLOT | id | NO ACTION |
| INSPECTION_BOOKING | property_id | PROPERTY | id | NO ACTION |
| INSPECTION_BOOKING | task_id | TASK | id | NO ACTION |
| INSPECTION_BOOKING | contact_id | CONTACT | id | NO ACTION |
| INSPECTION_BOOKING | confirmed_by | USER | id | NO ACTION |
| INSPECTION_BOOKING | booked_by_user_id | USER | id | NO ACTION |
| INSPECTION_NOTIFICATION | schedule_id | INSPECTION_SCHEDULE | id | NO ACTION |
| INSPECTION_NOTIFICATION | property_id | PROPERTY | id | NO ACTION |
| INSPECTION_NOTIFICATION | contact_id | CONTACT | id | NO ACTION |
| INSPECTION_NOTIFICATION | user_id | USER | id | NO ACTION |

---

## 第三部分：问题与改进建议

### 问题 1：时间戳类型不一致 🔴 高

**现状**: `AGENCY` 表的 `created_at`/`updated_at` 使用 `timestamp`（无时区），而其余所有表使用 `timestamptz`（带时区）。`TASK` 表的 `due_date`/`inspection_date` 也使用无时区 `timestamp`。

**风险**: 在不同时区运行的应用程序中，无时区时间戳会导致时间混乱。当服务器切换时区或使用 UTC 规范时，数据解读不一致。

**建议**:
```sql
ALTER TABLE "AGENCY" ALTER COLUMN created_at TYPE timestamptz;
ALTER TABLE "AGENCY" ALTER COLUMN updated_at TYPE timestamptz;
ALTER TABLE "TASK" ALTER COLUMN due_date TYPE timestamptz;
ALTER TABLE "TASK" ALTER COLUMN inspection_date TYPE timestamptz;
```

---

### 问题 2：外键列缺少索引 🔴 高

**现状**: 以下外键列没有对应索引，会导致 JOIN 查询全表扫描：

| 表 | 缺失索引的列 | 影响 |
|---|---|---|
| `TASK` | `property_id` | 按房产查询任务 |
| `TASK` | `agency_id` | 按中介查询任务 |
| `TASK` | `email_id` | 按邮件查询任务 |
| `TASK_FILES` | `task_id` | 按任务查询文件 |
| `CONTACT` | `property_id` | 按房产查询联系人 |
| `PROPERTY` | `user_id` | 按用户查询房产 |
| `EMAIL` | `agency_id` | 按中介查询邮件 |
| `AGENCY_WHITELIST` | `agency_id` | 按中介查询白名单 |

**建议**:
```sql
CREATE INDEX CONCURRENTLY idx_task_property ON "TASK"(property_id);
CREATE INDEX CONCURRENTLY idx_task_agency ON "TASK"(agency_id);
CREATE INDEX CONCURRENTLY idx_task_email ON "TASK"(email_id);
CREATE INDEX CONCURRENTLY idx_task_files_task ON "TASK_FILES"(task_id);
CREATE INDEX CONCURRENTLY idx_contact_property ON "CONTACT"(property_id);
CREATE INDEX CONCURRENTLY idx_property_user ON "PROPERTY"(user_id);
CREATE INDEX CONCURRENTLY idx_email_agency ON "EMAIL"(agency_id);
CREATE INDEX CONCURRENTLY idx_whitelist_agency ON "AGENCY_WHITELIST"(agency_id);
```

---

### 问题 3：`_EmailToProperty` 设计问题 🔴 高

**现状**:
1. 列名 `A`/`B` 无业务语义（Prisma 隐式关联表约定）
2. `B` 列（property_id）**缺少外键约束**，无法保证引用完整性
3. 删除 PROPERTY 记录后会产生孤儿记录

**建议**: 替换为显式关联表
```sql
-- 创建新表
CREATE TABLE "EMAIL_PROPERTY" (
  email_id    INTEGER NOT NULL REFERENCES "EMAIL"(id) ON DELETE CASCADE,
  property_id INTEGER NOT NULL REFERENCES "PROPERTY"(id) ON DELETE CASCADE,
  PRIMARY KEY (email_id, property_id)
);
CREATE INDEX idx_email_property_prop ON "EMAIL_PROPERTY"(property_id);

-- 迁移数据
INSERT INTO "EMAIL_PROPERTY" (email_id, property_id)
SELECT "A", "B" FROM "_EmailToProperty";

-- 删除旧表
DROP TABLE "_EmailToProperty";
```

---

### 问题 4：TASK_FILES 缺少级联删除 🟡 中

**现状**: `TASK_FILES.task_id` 外键使用默认 `NO ACTION`。删除 TASK 时，如果存在关联文件记录，删除操作会被阻止。

**对比**: `VEU_PROJECT_FILES` 正确地使用了 `ON DELETE CASCADE`。

**建议**:
```sql
ALTER TABLE "TASK_FILES" DROP CONSTRAINT fk_task;
ALTER TABLE "TASK_FILES" ADD CONSTRAINT fk_task
  FOREIGN KEY (task_id) REFERENCES "TASK"(id) ON DELETE CASCADE;
```

---

### 问题 5：INSPECTION_BOOKING 冗余索引 🟡 中

**现状**: `idx_booking_token`（普通 btree 索引）和 `INSPECTION_BOOKING_booking_token_key`（UNIQUE btree 索引）在 `booking_token` 列上重复。UNIQUE 索引已经可以高效支持查找操作。

**影响**: 浪费存储空间，增加写入开销。

**建议**:
```sql
DROP INDEX CONCURRENTLY idx_booking_token;
```

---

### 问题 6：状态/角色/类型列缺少数据库级校验 🟡 中

**现状**: 以下列使用 `varchar` 存储但无 `CHECK` 约束或 `ENUM` 类型：

| 表 | 列 | 有效值 |
|---|---|---|
| `USER` | `role` | superuser, admin, agencyAdmin, agencyUser |
| `TASK` | `status` | unknown, pending, in_progress, completed, ... |
| `TASK` | `repeat_frequency` | none, daily, weekly, monthly, yearly |
| `EMAIL` | `direction` | inbound, outbound |
| `INSPECTION_SCHEDULE` | `status` | published, closed |
| `INSPECTION_BOOKING` | `status` | pending, confirmed, rejected, cancelled |
| `INSPECTION_BOOKING` | `booker_type` | contact, agencyUser |
| `INSPECTION_NOTIFICATION` | `status` | sent, delivered, failed |
| `INSPECTION_NOTIFICATION` | `recipient_type` | contact, agencyUser |

**风险**: 应用程序 bug 或直接 SQL 操作可能写入无效值。

**建议**: 对每个列添加 CHECK 约束（比创建 ENUM 更灵活，不需要迁移即可修改）
```sql
ALTER TABLE "USER" ADD CONSTRAINT chk_user_role
  CHECK (role IN ('superuser', 'admin', 'agencyAdmin', 'agencyUser'));

ALTER TABLE "TASK" ADD CONSTRAINT chk_task_status
  CHECK (status IN ('unknown', 'pending', 'in_progress', 'completed', 'cancelled'));

ALTER TABLE "EMAIL" ADD CONSTRAINT chk_email_direction
  CHECK (direction IN ('inbound', 'outbound'));

-- 其他类似...
```

---

### 问题 7：PROPERTY 通过 USER 间接关联 AGENCY 🟡 中

**现状**: PROPERTY 只有 `user_id`，没有直接的 `agency_id`。查询某中介的所有房产需要 JOIN USER 表：
```sql
SELECT p.* FROM "PROPERTY" p
JOIN "USER" u ON p.user_id = u.id
WHERE u.agency_id = ?;
```

**影响**: 增加查询复杂度，当用户的 agency 变更时房产归属也随之改变（可能非预期行为）。

**建议**: 考虑在 PROPERTY 上添加冗余 `agency_id` 列，或根据业务需求维持现有设计。如果房产确实应该"跟随"用户变更中介，则当前设计是合理的。

---

### 问题 8：CONTACT 未直接关联 AGENCY 🟡 中

**现状**: CONTACT 仅通过 `property_id` 关联到 PROPERTY。获取某中介的所有联系人需要三表联查：
```sql
SELECT c.* FROM "CONTACT" c
JOIN "PROPERTY" p ON c.property_id = p.id
JOIN "USER" u ON p.user_id = u.id
WHERE u.agency_id = ?;
```

**建议**: 同问题 7，如果频繁按中介筛选联系人，考虑添加冗余 `agency_id`。

---

### 问题 9：`updated_at` 不会自动更新 🟡 中

**现状**: 所有表的 `updated_at` 默认值为 `now()`（仅在 INSERT 时生效）。UPDATE 操作不会自动更新此字段，需要应用层手动设置。

**注意**: Prisma 的 `@updatedAt` 指令（用于 INSPECTION_CONFIG、INSPECTION_SCHEDULE、INSPECTION_BOOKING）在 Prisma Client 层面自动更新，但直接 SQL 操作不会触发。项目中同时使用 Prisma 和原生 SQL，存在不一致风险。

**建议**: 创建通用触发器函数
```sql
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 对每个有 updated_at 的表创建触发器
CREATE TRIGGER trg_agency_updated_at BEFORE UPDATE ON "AGENCY"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
-- 对其他表类似...
```

---

### 问题 10：SYSTEM_SETTINGS 单例模式无保障 🟢 低

**现状**: 表设计为单行记录存储全局配置，但没有任何机制阻止插入多行。

**建议**:
```sql
-- 方案一：CHECK 约束限制 id = 1
ALTER TABLE "SYSTEM_SETTINGS" ADD CONSTRAINT chk_singleton CHECK (id = 1);

-- 方案二：使用唯一布尔列
-- ALTER TABLE "SYSTEM_SETTINGS" ADD COLUMN is_singleton BOOLEAN NOT NULL DEFAULT TRUE UNIQUE;
-- ALTER TABLE "SYSTEM_SETTINGS" ADD CONSTRAINT chk_singleton CHECK (is_singleton = TRUE);
```

---

### 问题 11：缺少审计字段 🟢 低

**现状**: 大部分表没有 `created_by`/`updated_by` 字段，无法追踪是谁创建或修改了记录。

**已有审计字段的表**:
- `INSPECTION_SCHEDULE.created_by`
- `INSPECTION_BOOKING.confirmed_by`、`booked_by_user_id`

**建议**: 根据业务需求，对 TASK、PROPERTY、EMAIL 等核心表考虑添加 `created_by` 和 `updated_by` 字段。对于完整审计需求，考虑使用审计日志表。

---

### 问题 12：INSPECTION_SLOT.current_bookings 反范式化计数器 🟢 低

**现状**: `current_bookings` 是手动维护的计数器，每次预约操作需要同步更新。如果应用层出错或直接 SQL 操作，计数器可能与实际 BOOKING 记录数不一致。

**建议**:
- 短期：确保应用层使用事务同步更新
- 长期：考虑用视图或子查询替代
```sql
-- 查询时计算实际数量
SELECT s.*,
  (SELECT COUNT(*) FROM "INSPECTION_BOOKING" b
   WHERE b.slot_id = s.id AND b.status NOT IN ('cancelled', 'rejected'))
  AS actual_bookings
FROM "INSPECTION_SLOT" s;
```

---

### 问题 13：TASK.repeat_frequency 存储为文本 🟢 低

**现状**: `repeat_frequency` 使用 `varchar(20)` 存储，无校验。后端 cron 任务根据此字段计算下次任务日期，如果值非法将导致静默失败。

**建议**: 添加 CHECK 约束
```sql
ALTER TABLE "TASK" ADD CONSTRAINT chk_repeat_frequency
  CHECK (repeat_frequency IN ('none', 'daily', 'weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly'));
```

---

### 问题 14：Prisma Schema 与实际数据库不完全同步 🟡 中

**现状**: 发现以下差异：

| 差异 | Prisma Schema | 实际数据库 |
|---|---|---|
| TASK → PROPERTY FK 名称 | `map: "fk_property"` | `fk_task_property` |
| TASK → PROPERTY onDelete | `Cascade` | NO ACTION（默认） |
| VEU_PROJECT → PROPERTY FK | `onDelete: Cascade` | NO ACTION |

**风险**: Prisma Client 的行为基于 schema 文件中的定义，而直接 SQL 操作遵循实际数据库约束。两者不一致时可能产生预期外的行为。

**建议**: 运行 `npx prisma db pull` 重新同步 schema，然后审查并修复差异。

---

## 第四部分：优先级改进方案

### P0 — 数据完整性（建议立即修复）

| # | 问题 | 操作 | 风险 |
|---|---|---|---|
| 1 | `_EmailToProperty.B` 缺少 FK | 替换为 `EMAIL_PROPERTY` 显式表，或添加 FK | 孤儿记录 |
| 2 | Prisma Schema 与 DB 不同步 | 运行 `prisma db pull`，对齐 FK 行为 | 级联行为不符预期 |
| 3 | 外键列缺少索引（8 个） | 创建 CONCURRENTLY 索引 | 查询性能 |

### P1 — 一致性与规范（建议近期修复）

| # | 问题 | 操作 | 风险 |
|---|---|---|---|
| 4 | 时间戳类型不一致 | AGENCY 和 TASK 部分列改为 `timestamptz` | 时区问题 |
| 5 | TASK_FILES 缺少 CASCADE | 修改 FK 为 ON DELETE CASCADE | 删除受阻 |
| 6 | 冗余索引 `idx_booking_token` | 删除冗余索引 | 写入开销 |
| 7 | 状态列无校验 | 添加 CHECK 约束 | 脏数据 |
| 8 | `updated_at` 不自动更新 | 创建触发器 | 时间戳不准 |

### P2 — 架构优化（建议后续迭代）

| # | 问题 | 操作 | 影响 |
|---|---|---|---|
| 9 | PROPERTY 无直接 agency 关联 | 评估是否添加冗余 `agency_id` | 查询复杂度 |
| 10 | CONTACT 无直接 agency 关联 | 评估是否添加冗余 `agency_id` | 查询复杂度 |
| 11 | SYSTEM_SETTINGS 单例无保障 | 添加 CHECK (id = 1) | 配置混乱 |
| 12 | PERMISSION 缺少唯一约束 | 添加 UNIQUE (value, scope) | 重复权限 |
| 13 | 缺少审计字段 | 核心表添加 `created_by`/`updated_by` | 审计追踪 |
| 14 | current_bookings 反范式化 | 考虑计算列或视图替代 | 数据不一致 |
| 15 | SYSTEM_SETTINGS 明文密码 | 迁移敏感配置到环境变量或密钥管理服务 | 安全风险 |

---

> **总结**: 当前数据库设计在业务建模层面较为合理，核心表关系清晰。主要问题集中在约束完整性（缺少索引和外键）、类型一致性（时间戳）、以及 Prisma 自动生成遗留（`_EmailToProperty` 表）。建议按优先级分批修复，先确保数据完整性，再优化性能和规范性。

---

## 第五部分：迁移 SQL 脚本（P0 + P1）

> **生成日期**: 2026-03-03
> **适用数据库**: Neon PostgreSQL（项目: `sparkling-tree-12066464`，分支: `br-ancient-night-a7tqxg66`）
> **风险等级**: 整体 LOW — 所有表行数较少（最大 TASK 293 行），迁移可在毫秒级完成
> **执行方式**: 通过 Neon 控制台或 `psql` 逐步执行，建议在低峰时段操作

### 执行前须知

1. **索引创建**（Step 2、Step 6）使用 `CONCURRENTLY`，**不能在事务块内执行**，需逐条运行
2. **CHECK 约束**（Step 7）使用 `NOT VALID` + `VALIDATE` 两步模式，减少锁持有时间
3. 每个 Step 可独立执行和回滚，建议按顺序逐步操作并验证
4. 执行全部迁移后需运行 `npx prisma db pull` 同步 Prisma Schema

---

### Step 1：修复 `_EmailToProperty.B` 缺失外键（P0）

**问题**: `B` 列（property_id）无外键约束，删除 PROPERTY 后可能产生孤儿记录。

**前提**: 已确认当前 0 条孤儿记录（23 行数据全部合法）。

**风险**: LOW — 仅 23 行需验证，元数据级操作。

```sql
-- ========== UP ==========
ALTER TABLE "_EmailToProperty"
  ADD CONSTRAINT "_EmailToProperty_B_fkey"
  FOREIGN KEY ("B") REFERENCES "PROPERTY"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- ========== DOWN ==========
-- ALTER TABLE "_EmailToProperty" DROP CONSTRAINT "_EmailToProperty_B_fkey";
```

**验证**:
```sql
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = '"_EmailToProperty"'::regclass AND contype = 'f';
-- 应返回两行: _EmailToProperty_A_fkey 和 _EmailToProperty_B_fkey
```

---

### Step 2：添加 8 个缺失的外键索引（P0）

**问题**: 8 个外键列无索引，JOIN 查询需全表扫描。

**风险**: LOW — 使用 `CONCURRENTLY` 不阻塞写入，所有表行数 < 300。

> ⚠️ **每条语句必须单独执行，不可放在 `BEGIN/COMMIT` 事务块中。**

```sql
-- ========== UP（逐条执行）==========

-- TASK 表索引（293 行）
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_task_property_id ON "TASK" (property_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_task_agency_id ON "TASK" (agency_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_task_email_id ON "TASK" (email_id);

-- TASK_FILES 索引（0 行）
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_task_files_task_id ON "TASK_FILES" (task_id);

-- CONTACT 索引（256 行）
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contact_property_id ON "CONTACT" (property_id);

-- PROPERTY 索引（279 行）
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_property_user_id ON "PROPERTY" (user_id);

-- EMAIL 索引（23 行）
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_email_agency_id ON "EMAIL" (agency_id);

-- AGENCY_WHITELIST 索引（25 行）
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_whitelist_agency_id ON "AGENCY_WHITELIST" (agency_id);

-- ========== DOWN（逐条执行）==========
-- DROP INDEX CONCURRENTLY IF EXISTS idx_task_property_id;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_task_agency_id;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_task_email_id;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_task_files_task_id;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_contact_property_id;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_property_user_id;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_email_agency_id;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_whitelist_agency_id;
```

**验证**:
```sql
-- 确认 8 个索引已创建
SELECT tablename, indexname FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'idx_task_property_id', 'idx_task_agency_id', 'idx_task_email_id',
    'idx_task_files_task_id', 'idx_contact_property_id', 'idx_property_user_id',
    'idx_email_agency_id', 'idx_whitelist_agency_id'
  )
ORDER BY tablename;
-- 应返回 8 行

-- 确认无 INVALID 索引
SELECT indexrelid::regclass, indisvalid FROM pg_index WHERE NOT indisvalid;
-- 应返回 0 行
```

---

### Step 3：对齐 FK 级联行为（Prisma Schema vs 实际数据库）（P0）

**问题**: Prisma Schema 声明 `onDelete: Cascade`，但数据库实际使用 `NO ACTION`。需对齐以避免行为不一致。

**说明**: 应用使用软删除（`is_active = false`），CASCADE 仅在硬删除时触发。对齐后不影响正常业务流程。

**风险**: LOW — 元数据级操作，不影响现有数据。

```sql
-- ========== UP ==========

-- 3a: TASK.property_id → PROPERTY.id: NO ACTION → CASCADE
ALTER TABLE "TASK" DROP CONSTRAINT "fk_task_property";
ALTER TABLE "TASK"
  ADD CONSTRAINT "fk_task_property"
  FOREIGN KEY (property_id) REFERENCES "PROPERTY"(id) ON DELETE CASCADE ON UPDATE NO ACTION;

-- 3b: VEU_PROJECT.property_id → PROPERTY.id: NO ACTION → CASCADE
ALTER TABLE "VEU_PROJECT" DROP CONSTRAINT "fk_veu_project_property";
ALTER TABLE "VEU_PROJECT"
  ADD CONSTRAINT "fk_veu_project_property"
  FOREIGN KEY (property_id) REFERENCES "PROPERTY"(id) ON DELETE CASCADE ON UPDATE NO ACTION;

-- ========== DOWN ==========
-- ALTER TABLE "TASK" DROP CONSTRAINT "fk_task_property";
-- ALTER TABLE "TASK"
--   ADD CONSTRAINT "fk_task_property"
--   FOREIGN KEY (property_id) REFERENCES "PROPERTY"(id);

-- ALTER TABLE "VEU_PROJECT" DROP CONSTRAINT "fk_veu_project_property";
-- ALTER TABLE "VEU_PROJECT"
--   ADD CONSTRAINT "fk_veu_project_property"
--   FOREIGN KEY (property_id) REFERENCES "PROPERTY"(id);
```

**验证**:
```sql
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE contype = 'f'
  AND conrelid IN ('"TASK"'::regclass, '"VEU_PROJECT"'::regclass)
  AND confrelid = '"PROPERTY"'::regclass;
-- 两行均应显示 ON DELETE CASCADE
```

---

### Step 4：修复时间戳类型不一致（P1）

**问题**: AGENCY 的 `created_at`/`updated_at` 和 TASK 的 `due_date`/`inspection_date` 使用 `timestamp`（无时区），其他表均使用 `timestamptz`。

**风险**: LOW-MEDIUM — 需要表重写（ACCESS EXCLUSIVE 锁），但 AGENCY 仅 38 行、TASK 仅 293 行，重写瞬间完成。

```sql
-- ========== UP ==========

-- AGENCY 表（38 行）
ALTER TABLE "AGENCY" ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC';
ALTER TABLE "AGENCY" ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE 'UTC';

-- TASK 表（293 行）
ALTER TABLE "TASK" ALTER COLUMN due_date TYPE timestamptz USING due_date AT TIME ZONE 'UTC';
ALTER TABLE "TASK" ALTER COLUMN inspection_date TYPE timestamptz USING inspection_date AT TIME ZONE 'UTC';

-- ========== DOWN ==========
-- ALTER TABLE "AGENCY" ALTER COLUMN created_at TYPE timestamp USING created_at AT TIME ZONE 'UTC';
-- ALTER TABLE "AGENCY" ALTER COLUMN updated_at TYPE timestamp USING updated_at AT TIME ZONE 'UTC';
-- ALTER TABLE "TASK" ALTER COLUMN due_date TYPE timestamp USING due_date AT TIME ZONE 'UTC';
-- ALTER TABLE "TASK" ALTER COLUMN inspection_date TYPE timestamp USING inspection_date AT TIME ZONE 'UTC';
```

**验证**:
```sql
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'AGENCY' AND column_name IN ('created_at', 'updated_at'))
    OR (table_name = 'TASK' AND column_name IN ('due_date', 'inspection_date'))
  );
-- 四列均应显示 'timestamp with time zone'
```

---

### Step 5：TASK_FILES 添加级联删除（P1）

**问题**: `TASK_FILES.task_id` FK 使用默认 `NO ACTION`，应改为 `CASCADE`（与 VEU_PROJECT_FILES 保持一致）。

**风险**: VERY LOW — 表内 0 行数据，纯元数据操作。

```sql
-- ========== UP ==========
ALTER TABLE "TASK_FILES" DROP CONSTRAINT "fk_task";
ALTER TABLE "TASK_FILES"
  ADD CONSTRAINT "fk_task"
  FOREIGN KEY (task_id) REFERENCES "TASK"(id) ON DELETE CASCADE ON UPDATE NO ACTION;

-- ========== DOWN ==========
-- ALTER TABLE "TASK_FILES" DROP CONSTRAINT "fk_task";
-- ALTER TABLE "TASK_FILES"
--   ADD CONSTRAINT "fk_task"
--   FOREIGN KEY (task_id) REFERENCES "TASK"(id);
```

**验证**:
```sql
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = '"TASK_FILES"'::regclass AND contype = 'f';
-- 应显示 ON DELETE CASCADE
```

---

### Step 6：删除冗余索引（P1）

**问题**: `idx_booking_token`（普通 btree）与 `INSPECTION_BOOKING_booking_token_key`（UNIQUE btree）功能完全重复。

**风险**: VERY LOW — UNIQUE 索引保留，查询不受影响。0 行数据。

> ⚠️ 使用 `CONCURRENTLY`，**不可在事务块内执行**。

```sql
-- ========== UP ==========
DROP INDEX CONCURRENTLY IF EXISTS idx_booking_token;

-- ========== DOWN ==========
-- CREATE INDEX CONCURRENTLY idx_booking_token ON "INSPECTION_BOOKING" (booking_token);
```

**验证**:
```sql
SELECT indexname FROM pg_indexes
WHERE tablename = 'INSPECTION_BOOKING' AND indexname LIKE '%token%';
-- 应仅返回 INSPECTION_BOOKING_booking_token_key
```

---

### Step 7：添加 CHECK 约束（P1）

**问题**: 多个状态/角色/类型列缺少数据库级校验，应用 bug 或直接 SQL 可写入无效值。

**前置数据清洗**: TASK 表中有 6 行 `status = 'unknown'`（小写），需统一为 `'UNKNOWN'`。

**约束值来源**: `src/config/constants.js` + `src/services/emailService.js`（`UNASSIGNED` 状态）。

**风险**: LOW — 使用 `NOT VALID` + `VALIDATE` 两步模式避免长时间锁表。

```sql
-- ========== UP ==========

-- 7a: 数据清洗 — 统一 TASK.status 大小写
UPDATE "TASK" SET status = UPPER(status) WHERE status != UPPER(status);

-- 7b: 添加 CHECK 约束（每对 NOT VALID + VALIDATE 可放在同一事务中）

-- USER.role
ALTER TABLE "USER" ADD CONSTRAINT chk_user_role
  CHECK (role IN ('superuser', 'admin', 'agency-admin', 'agency-user')) NOT VALID;
ALTER TABLE "USER" VALIDATE CONSTRAINT chk_user_role;

-- TASK.status（包含 emailService 使用的 UNASSIGNED）
ALTER TABLE "TASK" ADD CONSTRAINT chk_task_status
  CHECK (status IN ('UNKNOWN', 'UNASSIGNED', 'INCOMPLETE', 'PROCESSING', 'DUE_SOON', 'EXPIRED', 'COMPLETED', 'HISTORY')) NOT VALID;
ALTER TABLE "TASK" VALIDATE CONSTRAINT chk_task_status;

-- TASK.repeat_frequency
ALTER TABLE "TASK" ADD CONSTRAINT chk_task_repeat_frequency
  CHECK (repeat_frequency IN ('none', '1 month', '3 months', '6 months', '1 year', '2 years', '3 years')) NOT VALID;
ALTER TABLE "TASK" VALIDATE CONSTRAINT chk_task_repeat_frequency;

-- EMAIL.direction
ALTER TABLE "EMAIL" ADD CONSTRAINT chk_email_direction
  CHECK (direction IN ('inbound', 'outbound')) NOT VALID;
ALTER TABLE "EMAIL" VALIDATE CONSTRAINT chk_email_direction;

-- INSPECTION_SCHEDULE.status
ALTER TABLE "INSPECTION_SCHEDULE" ADD CONSTRAINT chk_schedule_status
  CHECK (status IN ('published', 'closed')) NOT VALID;
ALTER TABLE "INSPECTION_SCHEDULE" VALIDATE CONSTRAINT chk_schedule_status;

-- INSPECTION_BOOKING.status
ALTER TABLE "INSPECTION_BOOKING" ADD CONSTRAINT chk_booking_status
  CHECK (status IN ('pending', 'confirmed', 'rejected', 'cancelled')) NOT VALID;
ALTER TABLE "INSPECTION_BOOKING" VALIDATE CONSTRAINT chk_booking_status;

-- INSPECTION_BOOKING.booker_type（可为 NULL）
ALTER TABLE "INSPECTION_BOOKING" ADD CONSTRAINT chk_booking_booker_type
  CHECK (booker_type IN ('contact', 'agencyUser') OR booker_type IS NULL) NOT VALID;
ALTER TABLE "INSPECTION_BOOKING" VALIDATE CONSTRAINT chk_booking_booker_type;

-- INSPECTION_NOTIFICATION.status
ALTER TABLE "INSPECTION_NOTIFICATION" ADD CONSTRAINT chk_notification_status
  CHECK (status IN ('sent', 'delivered', 'failed')) NOT VALID;
ALTER TABLE "INSPECTION_NOTIFICATION" VALIDATE CONSTRAINT chk_notification_status;

-- INSPECTION_NOTIFICATION.recipient_type（可为 NULL）
ALTER TABLE "INSPECTION_NOTIFICATION" ADD CONSTRAINT chk_notification_recipient_type
  CHECK (recipient_type IN ('contact', 'agencyUser') OR recipient_type IS NULL) NOT VALID;
ALTER TABLE "INSPECTION_NOTIFICATION" VALIDATE CONSTRAINT chk_notification_recipient_type;

-- ========== DOWN ==========
-- ALTER TABLE "USER" DROP CONSTRAINT IF EXISTS chk_user_role;
-- ALTER TABLE "TASK" DROP CONSTRAINT IF EXISTS chk_task_status;
-- ALTER TABLE "TASK" DROP CONSTRAINT IF EXISTS chk_task_repeat_frequency;
-- ALTER TABLE "EMAIL" DROP CONSTRAINT IF EXISTS chk_email_direction;
-- ALTER TABLE "INSPECTION_SCHEDULE" DROP CONSTRAINT IF EXISTS chk_schedule_status;
-- ALTER TABLE "INSPECTION_BOOKING" DROP CONSTRAINT IF EXISTS chk_booking_status;
-- ALTER TABLE "INSPECTION_BOOKING" DROP CONSTRAINT IF EXISTS chk_booking_booker_type;
-- ALTER TABLE "INSPECTION_NOTIFICATION" DROP CONSTRAINT IF EXISTS chk_notification_status;
-- ALTER TABLE "INSPECTION_NOTIFICATION" DROP CONSTRAINT IF EXISTS chk_notification_recipient_type;
```

**验证**:
```sql
SELECT tc.table_name, tc.constraint_name, cc.check_clause
FROM information_schema.table_constraints tc
JOIN information_schema.check_constraints cc
  ON tc.constraint_name = cc.constraint_name
WHERE tc.constraint_type = 'CHECK'
  AND tc.table_schema = 'public'
  AND tc.constraint_name LIKE 'chk_%'
ORDER BY tc.table_name;
-- 应返回 9 行
```

---

### Step 8：添加 `updated_at` 自动更新触发器（P1）

**问题**: 所有表的 `updated_at` 仅在 INSERT 时设置（`DEFAULT now()`），UPDATE 操作不会自动更新。Prisma 的 `@updatedAt` 仅覆盖 3 张表，且直接 SQL 操作不受 Prisma 管理。

**覆盖范围**: 14 张含 `updated_at` 列的表。

**风险**: LOW — 触发器开销可忽略（每行更新一次 `NOW()` 调用）。对 Prisma 管理的表无冲突（两者均设置当前时间）。

```sql
-- ========== UP ==========

-- 创建通用触发器函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 为 14 张表创建触发器
CREATE TRIGGER trg_updated_at BEFORE UPDATE ON "AGENCY"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_updated_at BEFORE UPDATE ON "AGENCY_WHITELIST"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_updated_at BEFORE UPDATE ON "CONTACT"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_updated_at BEFORE UPDATE ON "EMAIL"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_updated_at BEFORE UPDATE ON "INSPECTION_BOOKING"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_updated_at BEFORE UPDATE ON "INSPECTION_CONFIG"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_updated_at BEFORE UPDATE ON "INSPECTION_SCHEDULE"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_updated_at BEFORE UPDATE ON "PROPERTY"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_updated_at BEFORE UPDATE ON "SYSTEM_SETTINGS"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_updated_at BEFORE UPDATE ON "TASK"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_updated_at BEFORE UPDATE ON "TASK_FILES"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_updated_at BEFORE UPDATE ON "USER"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_updated_at BEFORE UPDATE ON "VEU_PROJECT"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_updated_at BEFORE UPDATE ON "VEU_PROJECT_FILES"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ========== DOWN ==========
-- DROP TRIGGER IF EXISTS trg_updated_at ON "AGENCY";
-- DROP TRIGGER IF EXISTS trg_updated_at ON "AGENCY_WHITELIST";
-- DROP TRIGGER IF EXISTS trg_updated_at ON "CONTACT";
-- DROP TRIGGER IF EXISTS trg_updated_at ON "EMAIL";
-- DROP TRIGGER IF EXISTS trg_updated_at ON "INSPECTION_BOOKING";
-- DROP TRIGGER IF EXISTS trg_updated_at ON "INSPECTION_CONFIG";
-- DROP TRIGGER IF EXISTS trg_updated_at ON "INSPECTION_SCHEDULE";
-- DROP TRIGGER IF EXISTS trg_updated_at ON "PROPERTY";
-- DROP TRIGGER IF EXISTS trg_updated_at ON "SYSTEM_SETTINGS";
-- DROP TRIGGER IF EXISTS trg_updated_at ON "TASK";
-- DROP TRIGGER IF EXISTS trg_updated_at ON "TASK_FILES";
-- DROP TRIGGER IF EXISTS trg_updated_at ON "USER";
-- DROP TRIGGER IF EXISTS trg_updated_at ON "VEU_PROJECT";
-- DROP TRIGGER IF EXISTS trg_updated_at ON "VEU_PROJECT_FILES";
-- DROP FUNCTION IF EXISTS update_updated_at_column();
```

**验证**:
```sql
SELECT trigger_name, event_object_table, action_timing, event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'public' AND trigger_name = 'trg_updated_at'
ORDER BY event_object_table;
-- 应返回 14 行
```

---

### 迁移后操作：同步 Prisma Schema

执行全部迁移后，需同步 Prisma Schema 以反映数据库变更：

```bash
cd RJL-Backend
npx prisma db pull    # 从数据库拉取最新 Schema
npx prisma generate   # 重新生成 Prisma Client
```

**预期变更**:
- `TaskFile.task` 关系将显示 `onDelete: Cascade`
- `Agency.createdAt`/`updatedAt` 将从 `@db.Timestamp(6)` 变为 `@db.Timestamptz(6)`
- `Task.dueDate`/`inspectionDate` 将从 `@db.Timestamp(6)` 变为 `@db.Timestamptz(6)`
- `_EmailToProperty` 的 `B` 列将显示外键关系

> **注意**: Prisma 不会自动读取 CHECK 约束和触发器，这些仅存在于数据库层面。

---

### 风险总览

| Step | 风险 | 锁类型 | 预计耗时 | 影响行数 |
|---|---|---|---|---|
| 1: _EmailToProperty FK | LOW | SHARE ROW EXCLUSIVE | < 1s | 23 行验证 |
| 2: 8 个索引 | LOW | 无锁（CONCURRENTLY） | 每个 < 1s | 0-293 行 |
| 3: FK 级联对齐 | LOW | ACCESS EXCLUSIVE（瞬时） | < 1s | 仅元数据 |
| 4: 时间戳类型 | LOW-MEDIUM | ACCESS EXCLUSIVE | < 1s | 38 + 293 行重写 |
| 5: TASK_FILES CASCADE | VERY LOW | ACCESS EXCLUSIVE（瞬时） | < 1s | 仅元数据 |
| 6: 删除冗余索引 | VERY LOW | 无锁（CONCURRENTLY） | < 1s | 0 行 |
| 7a: 数据清洗 | LOW | ROW | < 1s | 6 行 |
| 7b: CHECK 约束 | LOW | SHARE UPDATE EXCLUSIVE | < 1s | 验证扫描 |
| 8: 触发器 | LOW | SHARE ROW EXCLUSIVE | < 1s | 仅元数据 |
