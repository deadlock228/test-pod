// Servicio de autenticación y multi-tenant.
import { hashPassword, verifyPassword } from './password.js';
import { issueTokenPair, signToken, verifyToken, ACCESS_TTL } from './jwt.js';
import { isValidRole } from './rbac.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class AuthError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}

export class AuthService {
  constructor(store, secret) {
    if (!secret) throw new Error('JWT secret requerido');
    this.store = store;
    this.secret = secret;
  }

  /**
   * Registra un nuevo tenant junto con su primer usuario admin.
   * @returns {{ tenant, user, tokens }}
   */
  registerTenant({ tenantName, email, password }) {
    if (!tenantName || typeof tenantName !== 'string') {
      throw new AuthError('tenantName requerido');
    }
    if (!email || !EMAIL_RE.test(email)) {
      throw new AuthError('email inválido');
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
      throw new AuthError('La contraseña debe tener al menos 8 caracteres');
    }

    const tenant = this.store.insertTenant({ name: tenantName });
    // El primer usuario del tenant siempre es admin.
    const user = this.store.insert('user', tenant.id, {
      email: email.toLowerCase(),
      password_hash: hashPassword(password),
      role: 'admin',
    });

    return {
      tenant,
      user: this._publicUser(user),
      tokens: issueTokenPair(user, this.secret),
    };
  }

  /**
   * Crea un usuario adicional dentro de un tenant (acción de admin).
   */
  createUser(tenantId, { email, password, role }) {
    if (!email || !EMAIL_RE.test(email)) throw new AuthError('email inválido');
    if (!password || password.length < 8) {
      throw new AuthError('La contraseña debe tener al menos 8 caracteres');
    }
    if (!isValidRole(role)) throw new AuthError('rol inválido');

    const normalized = email.toLowerCase();
    // Unicidad de email POR tenant (aislamiento): buscamos solo en este tenant.
    const existing = this.store.findOne(
      'user',
      tenantId,
      (u) => u.email === normalized,
    );
    if (existing) throw new AuthError('El email ya existe en este tenant', 409);

    const user = this.store.insert('user', tenantId, {
      email: normalized,
      password_hash: hashPassword(password),
      role,
    });
    return this._publicUser(user);
  }

  /** Login por email + password → par de tokens (JWT + refresh). */
  login({ tenantId, email, password }) {
    if (!tenantId) throw new AuthError('tenantId requerido');
    if (!email || !password) throw new AuthError('credenciales requeridas');

    const normalized = email.toLowerCase();
    const user = this.store.findOne(
      'user',
      tenantId,
      (u) => u.email === normalized,
    );
    // Mensaje genérico para no filtrar si el email existe.
    if (!user || !verifyPassword(password, user.password_hash)) {
      throw new AuthError('credenciales inválidas', 401);
    }
    return {
      user: this._publicUser(user),
      tokens: issueTokenPair(user, this.secret),
    };
  }

  /** Intercambia un refresh token válido por un nuevo access token. */
  refresh(refreshToken) {
    let claims;
    try {
      claims = verifyToken(refreshToken, this.secret);
    } catch (err) {
      throw new AuthError(`refresh token inválido: ${err.message}`, 401);
    }
    if (claims.type !== 'refresh') {
      throw new AuthError('se esperaba un refresh token', 401);
    }
    const user = this.store.findOne(
      'user',
      claims.tenantId,
      (u) => u.id === claims.sub,
    );
    if (!user) throw new AuthError('usuario inexistente', 401);

    const accessToken = signToken(
      { sub: user.id, tenantId: user.tenant_id, role: user.role, type: 'access' },
      this.secret,
      ACCESS_TTL,
    );
    return { accessToken, tokenType: 'Bearer', expiresIn: ACCESS_TTL };
  }

  /** Verifica un access token y devuelve el contexto autenticado. */
  authenticate(accessToken) {
    let claims;
    try {
      claims = verifyToken(accessToken, this.secret);
    } catch (err) {
      throw new AuthError(`token inválido: ${err.message}`, 401);
    }
    if (claims.type !== 'access') {
      throw new AuthError('se esperaba un access token', 401);
    }
    return { userId: claims.sub, tenantId: claims.tenantId, role: claims.role };
  }

  _publicUser(user) {
    const { password_hash, ...rest } = user;
    return rest;
  }
}
