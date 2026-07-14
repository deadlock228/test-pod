# API — Autenticación y multi-tenant (slice `auth-multitenant`)

Implementación del backlog **B01**: registro/login, JWT + refresh token,
aislamiento por `tenant_id` y control de acceso por roles
(`admin` / `operador` / `viewer`).

Sin dependencias externas: usa solo módulos nativos de Node.js
(`node:http`, `node:crypto`) y el test runner integrado (`node --test`),
para poder validarse sin `npm install`.

## Comandos

```bash
npm test        # node --test  (corre apps/api/test/*.test.js)
npm start       # levanta la API (PORT, JWT_SECRET)
```

## Endpoints

| Método | Ruta             | Auth        | Rol            | Descripción |
|--------|------------------|-------------|----------------|-------------|
| POST   | `/auth/register` | pública     | —              | Crea tenant + primer usuario **admin**; devuelve tokens |
| POST   | `/auth/login`    | pública     | —              | Devuelve `accessToken` (JWT) + `refreshToken` |
| POST   | `/auth/refresh`  | refresh tok | —              | Renueva el access token |
| GET    | `/me`            | Bearer      | cualquiera     | Contexto autenticado |
| POST   | `/users`         | Bearer      | admin          | Alta de usuario en el tenant |
| POST   | `/contacts`      | Bearer      | admin/operador | Crea contacto del tenant |
| GET    | `/contacts`      | Bearer      | admin/op/viewer| Lista contactos del **propio** tenant |
| GET    | `/health`        | pública     | —              | Health check |

## Diseño

- **JWT HS256** firmado con `crypto.createHmac` (`src/jwt.js`), access de 15 min
  y refresh de 7 días; verificación con comparación en tiempo constante.
- **Contraseñas** con `scrypt` + salt aleatorio (`src/password.js`); nunca se
  devuelve el `password_hash`.
- **Aislamiento multi-tenant** a nivel de aplicación (`src/store.js`): toda tabla
  de negocio exige `tenant_id` y las lecturas/escrituras filtran SIEMPRE por él,
  imposibilitando el acceso cruzado entre tenants.
- **RBAC** (`src/rbac.js`): permisos por rol aplicados como middleware.
