# Backend API Documentation

This document describes the backend API routes for authentication and various user roles (Superuser, Admin, Agency Admin, and Agency User). All endpoints use JSON for requests and responses. Authentication is based on JWT tokens.

---

## Table of Contents

1. [Authentication Routes (/auth)](#authentication-routes-auth)
2. [Superuser Routes (/superuser)](#superuser-routes-superuser)
3. [Admin Routes (/admin)](#admin-routes-admin)
4. [Agency Admin Routes (/agency/admin)](#agency-admin-routes-agencyadmin)
5. [Agency User Routes (/agency/user)](#agency-user-routes-agencyuser)
6. [Routing Setup in Main Application](#routing-setup-in-main-application)
7. [Summary](#summary)

---

## Authentication Routes (/auth)

**Base URL:** `/auth`

These endpoints do not require token verification (except for getting the current user info) and are used for login, registration, token refresh, password reset, and logout.

### 1. Login

- **Method:** POST  
- **Endpoint:** `/auth/login`  
- **Description:** User login. On success, returns an access token (with permissions in payload) and a refresh token.  
- **Request Body:**

{
    "email": "user@example.com",
    "password": "your_password"
}

- **Response Example:**

{
    "message": "Login successful",
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "role": "admin",
    "email": "user@example.com"
}

### 2. Register

- **Method:** POST  
- **Endpoint:** `/auth/register`  
- **Description:** Register a new user.  
- **Request Body:**

{
    "email": "newuser@example.com",
    "password": "your_password",
    "name": "User Name",
    "role": "user",        // Optional; default is "user"
    "agency_id": 123       // Optional
}

- **Response Example:**

{
    "message": "Registration successful",
    "data": {
        "id": 5,
        "email": "newuser@example.com",
        "role": "user"
    }
}

### 3. Refresh Token

- **Method:** POST  
- **Endpoint:** `/auth/refresh-token`  
- **Description:** Generate a new access token using the refresh token.  
- **Request Body:**

{
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}

- **Response Example:**

{
    "accessToken": "new_access_token_here"
}

### 4. Forgot Password

- **Method:** POST  
- **Endpoint:** `/auth/forgot-password`  
- **Description:** Sends a password reset link (valid for 15 minutes) to the user's email.  
- **Request Body:**

{
    "email": "user@example.com"
}

- **Response Example:**

{
    "message": "Reset link sent to email",
    "resetToken": "reset_token_here"
}

### 5. Reset Password

- **Method:** POST  
- **Endpoint:** `/auth/reset-password`  
- **Description:** Reset the user's password.  
- **Request Body:**

{
    "email": "user@example.com",
    "token": "reset_token_here",
    "password": "new_password",
    "password_confirmation": "new_password"
}

- **Response Example:**

{
    "message": "Password reset successful"
}

### 6. Logout

- **Method:** POST  
- **Endpoint:** `/auth/logout`  
- **Description:** Logout and revoke the refresh token.  
- **Request Body:**

{
    "refreshToken": "refresh_token_here"
}

- **Response Example:**

{
    "message": "Logout successful, refresh token revoked"
}

### 7. Get Current User

- **Method:** GET  
- **Endpoint:** `/auth/me`  
- **Description:** Retrieve the current user's information based on the token. If the user role is "agency", the associated agency information is also returned.  
- **Response Example:**

{
    "id": 5,
    "email": "user@example.com",
    "role": "agency",
    "agency_id": 10,
    "agency": { ... }
}

---

## Superuser Routes (/superuser)

**Base URL:** `/superuser`  
**Authentication:** Requires a valid token with role **superuser** (verified by middleware `requireSuperuser`).

### User Management

- **List Users**  
  - **Method:** GET  
  - **Endpoint:** `/superuser/users`  
  - **Description:** List all users.

- **Get User Detail**  
  - **Method:** GET  
  - **Endpoint:** `/superuser/users/:id`  
  - **Description:** Get detailed information for a specific user.

- **Create User**  
  - **Method:** POST  
  - **Endpoint:** `/superuser/users/create`  
  - **Description:** Create a new user.  
  - **Request Body:** Same as Register.

- **Update User**  
  - **Method:** PUT  
  - **Endpoint:** `/superuser/users/:id`  
  - **Description:** Update a user's information.

- **Delete User**  
  - **Method:** DELETE  
  - **Endpoint:** `/superuser/users/:id`  
  - **Description:** Soft-delete a user (sets is_active to false).

### Agency Management

- **List Agencies**  
  - **Method:** GET  
  - **Endpoint:** `/superuser/agencies`  
  - **Description:** List all agencies.

- **Get Agency Detail**  
  - **Method:** GET  
  - **Endpoint:** `/superuser/agencies/:id`  
  - **Description:** Get detailed information for a specific agency.

- **Create Agency**  
  - **Method:** POST  
  - **Endpoint:** `/superuser/agencies/create`  
  - **Description:** Create a new agency.

- **Update Agency**  
  - **Method:** PUT  
  - **Endpoint:** `/superuser/agencies/:id`  
  - **Description:** Update agency information.

- **Delete Agency**  
  - **Method:** DELETE  
  - **Endpoint:** `/superuser/agencies/:id`  
  - **Description:** Delete an agency.

### Property Management

- **List Properties**  
  - **Method:** GET  
  - **Endpoint:** `/superuser/properties`  
  - **Description:** List all properties.

- **Get Property Detail**  
  - **Method:** GET  
  - **Endpoint:** `/superuser/properties/:id`  
  - **Description:** Get detailed information for a specific property, including associated tasks, emails, contacts, and agency info.

- **Create Property**  
  - **Method:** POST  
  - **Endpoint:** `/superuser/properties/create`  
  - **Description:** Create a new property.

- **Update Property**  
  - **Method:** PUT  
  - **Endpoint:** `/superuser/properties/:id`  
  - **Description:** Update property information.

- **Delete Property**  
  - **Method:** DELETE  
  - **Endpoint:** `/superuser/properties/:id`  
  - **Description:** Soft-delete a property.

### Task Management

- **List Tasks**  
  - **Method:** GET  
  - **Endpoint:** `/superuser/tasks`  
  - **Description:** List all tasks.

- **Get Task Detail**  
  - **Method:** GET  
  - **Endpoint:** `/superuser/tasks/:id`  
  - **Description:** Get detailed information for a specific task, including associated property, contacts, and emails.

- **Create Task**  
  - **Method:** POST  
  - **Endpoint:** `/superuser/tasks/create`  
  - **Description:** Create a new task.

- **Update Task**  
  - **Method:** PUT  
  - **Endpoint:** `/superuser/tasks/:id`  
  - **Description:** Update task information.

- **Delete Task**  
  - **Method:** DELETE  
  - **Endpoint:** `/superuser/tasks/:id`  
  - **Description:** Soft-delete a task.

### Contact Management

- **List Contacts**  
  - **Method:** GET  
  - **Endpoint:** `/superuser/contacts`  
  - **Description:** List all contacts.

- **Get Contact Detail**  
  - **Method:** GET  
  - **Endpoint:** `/superuser/contacts/:id`  
  - **Description:** Get detailed information for a specific contact.

- **Create Contact**  
  - **Method:** POST  
  - **Endpoint:** `/superuser/contacts/create`  
  - **Description:** Create a new contact.

- **Update Contact**  
  - **Method:** PUT  
  - **Endpoint:** `/superuser/contacts/:id`  
  - **Description:** Update contact information.

- **Delete Contact**  
  - **Method:** DELETE  
  - **Endpoint:** `/superuser/contacts/:id`  
  - **Description:** Soft-delete a contact.

---

## Admin Routes (/admin)

**Base URL:** `/admin`  
**Authentication:** Requires a valid token with role **admin** (verified by middleware `requireAdmin`).  
**Note:** Admins can query, create, and update data but are not allowed to perform delete operations.

### User Management (No Delete)

- **List Users**  
  - **Method:** GET  
  - **Endpoint:** `/admin/users`  
  - **Description:** List all users.

- **Get User Detail**  
  - **Method:** GET  
  - **Endpoint:** `/admin/users/:id`  
  - **Description:** Get detailed information for a specific user.

- **Create User**  
  - **Method:** POST  
  - **Endpoint:** `/admin/users/create`  
  - **Description:** Create a new user.

- **Update User**  
  - **Method:** PUT  
  - **Endpoint:** `/admin/users/:id`  
  - **Description:** Update user information.

### Agency Management (No Delete)

- **List Agencies**  
  - **Method:** GET  
  - **Endpoint:** `/admin/agencies`  
  - **Description:** List all agencies.

- **Get Agency Detail**  
  - **Method:** GET  
  - **Endpoint:** `/admin/agencies/:id`  
  - **Description:** Get agency detail.

- **Create Agency**  
  - **Method:** POST  
  - **Endpoint:** `/admin/agencies/create`  
  - **Description:** Create a new agency.

- **Update Agency**  
  - **Method:** PUT  
  - **Endpoint:** `/admin/agencies/:id`  
  - **Description:** Update agency information.

### Property Management (No Delete)

- **List Properties**  
  - **Method:** GET  
  - **Endpoint:** `/admin/properties`  
  - **Description:** List all properties.

- **Get Property Detail**  
  - **Method:** GET  
  - **Endpoint:** `/admin/properties/:id`  
  - **Description:** Get property detail.

- **Create Property**  
  - **Method:** POST  
  - **Endpoint:** `/admin/properties/create`  
  - **Description:** Create a new property.

- **Update Property**  
  - **Method:** PUT  
  - **Endpoint:** `/admin/properties/:id`  
  - **Description:** Update property information.

### Task Management (No Delete)

- **List Tasks**  
  - **Method:** GET  
  - **Endpoint:** `/admin/tasks`  
  - **Description:** List all tasks.

- **Get Task Detail**  
  - **Method:** GET  
  - **Endpoint:** `/admin/tasks/:id`  
  - **Description:** Get task detail.

- **Create Task**  
  - **Method:** POST  
  - **Endpoint:** `/admin/tasks/create`  
  - **Description:** Create a new task.

- **Update Task**  
  - **Method:** PUT  
  - **Endpoint:** `/admin/tasks/:id`  
  - **Description:** Update task information.

### Contact Management (No Delete)

- **List Contacts**  
  - **Method:** GET  
  - **Endpoint:** `/admin/contacts`  
  - **Description:** List all contacts.

- **Get Contact Detail**  
  - **Method:** GET  
  - **Endpoint:** `/admin/contacts/:id`  
  - **Description:** Get contact detail.

- **Create Contact**  
  - **Method:** POST  
  - **Endpoint:** `/admin/contacts/create`  
  - **Description:** Create a new contact.

- **Update Contact**  
  - **Method:** PUT  
  - **Endpoint:** `/admin/contacts/:id`  
  - **Description:** Update contact information.

---

## Agency Admin Routes (/agency/admin)

**Base URL:** `/agency/admin`  
**Authentication:** Requires a valid token with role **agencyAdmin** (verified by middleware `requireAgencyAdmin`).  
**Note:** Agency Admin can update their own user info and manage properties and tasks within their agency (CRUD operations).

### Personal User Information

- **Get My User Detail**  
  - **Method:** GET  
  - **Endpoint:** `/agency/admin/me`  
  - **Description:** Retrieve personal user information.

- **Update My User Detail**  
  - **Method:** PUT  
  - **Endpoint:** `/agency/admin/me`  
  - **Description:** Update personal user information.

### Agency Information

- **Get My Agency Detail**  
  - **Method:** GET  
  - **Endpoint:** `/agency/admin/agency`  
  - **Description:** Retrieve the agency details associated with the current user.

- **Update My Agency Detail**  
  - **Method:** PUT  
  - **Endpoint:** `/agency/admin/agency`  
  - **Description:** Update the agency information for the current user's agency.

### Property Management (Within My Agency)

- **List My Properties**  
  - **Method:** GET  
  - **Endpoint:** `/agency/admin/properties`  
  - **Description:** List all properties belonging to the current user's agency.

- **Create Property**  
  - **Method:** POST  
  - **Endpoint:** `/agency/admin/properties/create`  
  - **Description:** Create a new property under the current user's agency.

- **Update Property**  
  - **Method:** PUT  
  - **Endpoint:** `/agency/admin/properties/:id`  
  - **Description:** Update a property belonging to the current user's agency.

- **Delete Property**  
  - **Method:** DELETE  
  - **Endpoint:** `/agency/admin/properties/:id`  
  - **Description:** Delete (soft-delete) a property under the current user's agency.

### Task Management (Within My Agency)

- **List My Tasks**  
  - **Method:** GET  
  - **Endpoint:** `/agency/admin/tasks`  
  - **Description:** List all tasks belonging to the current user's agency.

- **Create Task**  
  - **Method:** POST  
  - **Endpoint:** `/agency/admin/tasks/create`  
  - **Description:** Create a new task under a property of the current user's agency.

- **Update Task**  
  - **Method:** PUT  
  - **Endpoint:** `/agency/admin/tasks/:id`  
  - **Description:** Update a task under the current user's agency.

- **Delete Task**  
  - **Method:** DELETE  
  - **Endpoint:** `/agency/admin/tasks/:id`  
  - **Description:** Delete (soft-delete) a task under the current user's agency.

---

## Agency User Routes (/agency/user)

**Base URL:** `/agency/user`  
**Authentication:** Requires a valid token with role **agencyUser** (verified by middleware `requireAgencyUser`).  
**Note:** Agency Users can only view and update their personal user info and manage tasks within their agency.

### Personal User Information

- **Get My User Detail**  
  - **Method:** GET  
  - **Endpoint:** `/agency/user/me`  
  - **Description:** Retrieve personal user information.

- **Update My User Detail**  
  - **Method:** PUT  
  - **Endpoint:** `/agency/user/me`  
  - **Description:** Update personal user information.

### Task Management (Within My Agency)

- **List My Tasks**  
  - **Method:** GET  
  - **Endpoint:** `/agency/user/tasks`  
  - **Description:** List all tasks under the current user's agency.

- **Create Task**  
  - **Method:** POST  
  - **Endpoint:** `/agency/user/tasks/create`  
  - **Description:** Create a new task under a property belonging to the current user's agency.

- **Get Task Detail**  
  - **Method:** GET  
  - **Endpoint:** `/agency/user/tasks/:id`  
  - **Description:** Retrieve task details (only if the task belongs to the current user's agency).

- **Update Task**  
  - **Method:** PUT  
  - **Endpoint:** `/agency/user/tasks/:id`  
  - **Description:** Update a task under the current user's agency.

- **Delete Task**  
  - **Method:** DELETE  
  - **Endpoint:** `/agency/user/tasks/:id`  
  - **Description:** Delete (soft-delete) a task under the current user's agency.

---

v1.0.0

