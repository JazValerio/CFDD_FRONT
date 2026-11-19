import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api, dateTime, money } from './api.js';

const initialSession = () => {
  try {
    return JSON.parse(localStorage.getItem('puesto-feria-session') || 'null');
  } catch {
    return null;
  }
};

const navItems = [
  { id: 'dashboard', label: 'Resumen', icon: '▦' },
  { id: 'sale', label: 'Nueva venta', icon: '＋' },
  { id: 'products', label: 'Productos', icon: '◈' },
  { id: 'orders', label: 'Ventas', icon: '▤' },
  { id: 'users', label: 'Vendedores', icon: '♙', admin: true },
];

function BrandIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 4.5c0-1 .8-1.6.8-2.5M14 4.5c0-1 .8-1.6.8-2.5M7 8h10l1 11H6L7 8Z" />
      <path d="M5 11H3.5v4H6m12-4h2.5v4H18M8 7h8M9 21h6" />
    </svg>
  );
}

function App() {
  const [session, setSession] = useState(initialSession);
  const [page, setPage] = useState('dashboard');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [products, setProducts] = useState([]);
  const [methods, setMethods] = useState([]);
  const [orders, setOrders] = useState([]);
  const [users, setUsers] = useState([]);
  const [orderDetail, setOrderDetail] = useState(null);
  const [modal, setModal] = useState(null);
  const [orderFilters, setOrderFilters] = useState({ fecha_desde: '', fecha_hasta: '', id_usuario: '' });
  const isAdmin = session?.user?.rol === 'admin';
  const token = session?.token;

  const logout = useCallback(() => {
    localStorage.removeItem('puesto-feria-session');
    setSession(null);
    setPage('dashboard');
    setError('');
    setNotice('');
  }, []);

  useEffect(() => {
    const expire = () => {
      logout();
      setError('Tu sesión venció. Inicia sesión de nuevo.');
    };
    window.addEventListener('session-expired', expire);
    return () => window.removeEventListener('session-expired', expire);
  }, [logout]);

  const loadCore = useCallback(async () => {
    if (!token) return;
    setBusy(true);
    setError('');
    try {
      const [nextProducts, nextMethods, nextOrders] = await Promise.all([
        api('/productos?todos=1', { token }),
        api('/metodos-pago', { token }),
        api('/comandas?limite=100', { token }),
      ]);
      setProducts(nextProducts);
      setMethods(nextMethods);
      setOrders(nextOrders);
      if (isAdmin) setUsers(await api('/usuarios', { token }));
      else setUsers([]);
    } catch (requestError) {
      if (requestError.message) setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }, [token, isAdmin]);

  useEffect(() => {
    loadCore();
  }, [loadCore]);

  useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(() => setNotice(''), 3500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const todayOrders = useMemo(() => {
    const today = new Date().toLocaleDateString('en-CA');
    return orders.filter((order) => new Date(order.fecha).toLocaleDateString('en-CA') === today);
  }, [orders]);
  const todayTotal = todayOrders.reduce((sum, order) => sum + Number(order.total), 0);
  const activeProducts = products.filter((product) => product.disponible).length;
  const average = todayOrders.length ? todayTotal / todayOrders.length : 0;

  async function handleLogin(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      const result = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          username: form.get('username'),
          password: form.get('password'),
        }),
      });
      const nextSession = { token: result.token, user: result.user };
      localStorage.setItem('puesto-feria-session', JSON.stringify(nextSession));
      setSession(nextSession);
      setPage('dashboard');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function refreshOrders(filters = orderFilters) {
    const query = new URLSearchParams({ limite: '100' });
    Object.entries(filters).forEach(([key, value]) => {
      if (value) query.set(key, value);
    });
    setBusy(true);
    setError('');
    try {
      setOrders(await api(`/comandas?${query}`, { token }));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function createOrder(payload) {
    setBusy(true);
    setError('');
    try {
      const created = await api('/comandas', {
        token,
        method: 'POST',
        body: JSON.stringify(payload),
      });
      await loadCore();
      setNotice(`Comanda #${created.id_comanda} registrada correctamente`);
      setPage('dashboard');
      setModal({ type: 'order-success', order: created });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveProduct(product) {
    setBusy(true);
    setError('');
    try {
      await api(product.id_producto ? `/productos/${product.id_producto}` : '/productos', {
        token,
        method: product.id_producto ? 'PUT' : 'POST',
        body: JSON.stringify({
          nombre: product.nombre,
          descripcion: product.descripcion,
          precio: Number(product.precio),
          ...(product.id_producto ? {} : { disponible: true }),
        }),
      });
      setModal(null);
      setNotice(product.id_producto ? 'Producto actualizado' : 'Producto agregado al catálogo');
      await loadCore();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleProduct(product) {
    setBusy(true);
    setError('');
    try {
      await api(`/productos/${product.id_producto}`, {
        token,
        method: 'PUT',
        body: JSON.stringify({ disponible: !product.disponible }),
      });
      setNotice(product.disponible ? 'Producto marcado como agotado' : 'Producto disponible nuevamente');
      await loadCore();
    } catch (requestError) {
      setError(requestError.message);
      setBusy(false);
    }
  }

  async function saveUser(user) {
    setBusy(true);
    setError('');
    try {
      await api(user.id_usuario ? `/usuarios/${user.id_usuario}` : '/usuarios', {
        token,
        method: user.id_usuario ? 'PUT' : 'POST',
        body: JSON.stringify(user),
      });
      setModal(null);
      setNotice(user.id_usuario ? 'Vendedor actualizado' : 'Usuario creado correctamente');
      await loadCore();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleUser(user) {
    setBusy(true);
    setError('');
    try {
      if (user.estado) {
        await api(`/usuarios/${user.id_usuario}`, { token, method: 'DELETE' });
      } else {
        await api(`/usuarios/${user.id_usuario}`, {
          token,
          method: 'PUT',
          body: JSON.stringify({ estado: true }),
        });
      }
      setNotice(user.estado ? 'Acceso del usuario desactivado' : 'Usuario reactivado');
      await loadCore();
    } catch (requestError) {
      setError(requestError.message);
      setBusy(false);
    }
  }

  async function showOrder(order) {
    setBusy(true);
    setError('');
    try {
      setOrderDetail(await api(`/comandas/${order.id_comanda}`, { token }));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  if (!session) {
    return <Login onSubmit={handleLogin} error={error} busy={busy} />;
  }

  const visibleNav = navItems.filter((item) => !item.admin || isAdmin);
  const currentPage = visibleNav.some((item) => item.id === page) ? page : 'dashboard';

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" onClick={(event) => { event.preventDefault(); setPage('dashboard'); }}>
          <span className="brand-mark"><BrandIcon /></span>
          <span><strong>Cocinita Desmonteña</strong><small>Sistema de cobro · Diaconía de Desmonte</small></span>
        </a>
        <div className="sidebar-label">MENÚ PRINCIPAL</div>
        <nav className="main-nav" aria-label="Menú principal">
          {visibleNav.map((item) => (
            <button key={item.id} className={`nav-item ${currentPage === item.id ? 'selected' : ''}`} onClick={() => { setPage(item.id); setError(''); }}>
              <span className="nav-icon">{item.icon}</span>{item.label}
              {item.id === 'sale' && <span className="nav-shortcut">F2</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card"><span className="help-icon">✦</span><strong>Todo listo para vender</strong><span>Los cambios se guardan automáticamente.</span></div>
          <div className="profile">
            <div className="avatar">{session.user.nombre?.charAt(0)?.toUpperCase() || 'U'}</div>
            <div className="profile-copy"><strong>{session.user.nombre}</strong><span>{isAdmin ? 'Administrador' : 'Vendedor'}</span></div>
            <button className="logout-button" onClick={logout} title="Cerrar sesión" aria-label="Cerrar sesión">↗</button>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="mobile-brand"><span className="brand-mark"><BrandIcon /></span><strong>Cocinita Desmonteña</strong></div>
          <div className="breadcrumbs"><span>Inicio</span><b>/</b><strong>{navItems.find((item) => item.id === currentPage)?.label}</strong></div>
          <div className="topbar-actions"><span className="status-dot" /> Sistema en línea <button className="icon-button" onClick={loadCore} aria-label="Actualizar">↻</button></div>
        </header>
        <div className="mobile-nav">
          {visibleNav.map((item) => <button key={item.id} className={currentPage === item.id ? 'active' : ''} onClick={() => setPage(item.id)}><span>{item.icon}</span>{item.label}</button>)}
        </div>
        <section className="page-content">
          {error && <div className="alert alert-error" role="alert"><span>!</span><p>{error}</p><button onClick={() => setError('')} aria-label="Cerrar mensaje">×</button></div>}
          {notice && <div className="alert alert-success" role="status"><span>✓</span><p>{notice}</p><button onClick={() => setNotice('')} aria-label="Cerrar mensaje">×</button></div>}
          {busy && <div className="loading-line" />}
          {currentPage === 'dashboard' && <Dashboard
            user={session.user} total={todayTotal} count={todayOrders.length} average={average}
            products={activeProducts} orders={orders.slice(0, 6)} onNewSale={() => setPage('sale')}
            onShowOrder={showOrder} onViewOrders={() => setPage('orders')}
          />}
          {currentPage === 'sale' && <SalePage products={products.filter((item) => item.disponible)} methods={methods} busy={busy} onSubmit={createOrder} onClearError={() => setError('')} />}
          {currentPage === 'products' && <ProductsPage products={products} isAdmin={isAdmin} onAdd={() => setModal({ type: 'product' })} onEdit={(product) => setModal({ type: 'product', product })} onToggle={toggleProduct} />}
          {currentPage === 'orders' && <OrdersPage orders={orders} users={users} isAdmin={isAdmin} filters={orderFilters} setFilters={setOrderFilters} onSearch={() => refreshOrders()} onShowOrder={showOrder} />}
          {currentPage === 'users' && isAdmin && <UsersPage users={users} onAdd={() => setModal({ type: 'user' })} onEdit={(user) => setModal({ type: 'user', user })} onToggle={toggleUser} />}
        </section>
      </main>
      {modal?.type === 'product' && <ProductModal product={modal.product} onClose={() => setModal(null)} onSave={saveProduct} busy={busy} />}
      {modal?.type === 'user' && <UserModal user={modal.user} onClose={() => setModal(null)} onSave={saveUser} busy={busy} />}
      {modal?.type === 'order-success' && <SuccessModal order={modal.order} onClose={() => setModal(null)} onDetail={() => { setModal(null); showOrder(modal.order); }} />}
      {orderDetail && <OrderModal order={orderDetail} onClose={() => setOrderDetail(null)} />}
    </div>
  );
}

function Login({ onSubmit, error, busy }) {
  const [showPassword, setShowPassword] = useState(false);
  return (
    <main className="login-page">
      <div className="login-art">
        <div className="art-glow" />
        <div className="art-brand"><span className="brand-mark"><BrandIcon /></span><span>Cocinita Desmonteña</span></div>
        <div className="art-content">
          <div className="art-eyebrow"><span /> FIESTAS DE LA DIACONÍA DE DESMONTE</div>
          <h1>¡Estamos de fiesta<br />en Desmonte!</h1>
          <p>Celebremos las fiestas de la Diaconía de Desmonte con el sabor y la alegría de nuestra comunidad.</p>
          <div className="art-stats">
            <div><strong>Sabor local</strong><span>para compartir</span></div><i />
            <div><strong>Comunidad</strong><span>que celebra unida</span></div>
          </div>
        </div>
        <div className="art-footer">Cocinita Desmonteña · Fiestas de la Diaconía de Desmonte <span>✦</span></div>
      </div>
      <div className="login-panel">
        <form className="login-form" onSubmit={onSubmit}>
          <div className="login-mobile-mark"><span className="brand-mark"><BrandIcon /></span></div>
          <div className="form-eyebrow">BIENVENIDO DE VUELTA</div>
          <h2>Iniciar sesión</h2>
          <p className="login-subtitle">Ingresa tus datos para entrar al panel.</p>
          {error && <div className="alert alert-error login-alert" role="alert"><span>!</span><p>{error}</p></div>}
          <label className="field-label" htmlFor="username">Usuario</label>
          <div className="input-wrap"><span className="input-icon">♙</span><input id="username" name="username" autoComplete="username" placeholder="Tu nombre de usuario" required /></div>
          <label className="field-label password-label" htmlFor="password">Contraseña</label>
          <div className="input-wrap"><span className="input-icon">⌑</span><input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Tu contraseña" required /><button className="show-password" type="button" onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Ocultar' : 'Mostrar'}</button></div>
          <button className="button button-primary login-submit" disabled={busy}>{busy ? <><span className="spinner" />Ingresando...</> : <>Entrar al panel <span>→</span></>}</button>
          <div className="login-footnote"><span>▣</span> Acceso privado para el equipo del puesto</div>
        </form>
        <div className="login-copyright">© {new Date().getFullYear()} Cocinita Desmonteña <span>·</span> Diaconía de Desmonte</div>
      </div>
    </main>
  );
}

function PageHeading({ eyebrow, title, description, actions }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{actions && <div className="heading-actions">{actions}</div>}</div>;
}

function Dashboard({ user, total, count, average, products, orders, onNewSale, onShowOrder, onViewOrders }) {
  return (
    <>
      <PageHeading eyebrow="TU PUESTO, AL DÍA" title={`¡Hola, ${user.nombre?.split(' ')[0] || 'equipo'}!`} description="Esto es lo que está pasando en el puesto hoy." actions={<button className="button button-primary" onClick={onNewSale}><span>＋</span> Nueva venta</button>} />
      <div className="stats-grid">
        <StatCard title="Ventas de hoy" value={money(total)} caption="Ingresos registrados hoy" icon="₡" tone="orange" />
        <StatCard title="Comandas" value={count} caption="Transacciones de hoy" icon="▤" tone="green" />
        <StatCard title="Promedio por venta" value={money(average)} caption="Monto promedio de hoy" icon="⌁" tone="blue" />
        <StatCard title="Productos disponibles" value={products} caption="Listos para vender" icon="◈" tone="purple" />
      </div>
      <div className="dashboard-grid">
        <section className="panel recent-panel">
          <div className="panel-heading"><div><h2>Ventas recientes</h2><p>Últimos movimientos del puesto</p></div><button className="text-button" onClick={onViewOrders}>Ver todas <span>→</span></button></div>
          {orders.length ? <div className="table-scroll"><table><thead><tr><th>COMANDA</th><th>CLIENTE</th><th>VENDEDOR</th><th>MÉTODO</th><th>FECHA</th><th className="align-right">TOTAL</th></tr></thead><tbody>{orders.map((order) => <tr key={order.id_comanda} onClick={() => onShowOrder(order)} className="clickable-row"><td><span className="order-number">#{order.id_comanda}</span></td><td>{order.nombre_cliente || 'Sin nombre'}</td><td>{order.vendedor || 'Vendedor'}</td><td><span className={`payment-tag ${order.nombre_metodo?.toLowerCase().includes('sinpe') ? 'tag-sinpe' : ''}`}>{order.nombre_metodo}</span></td><td>{dateTime(order.fecha)}</td><td className="align-right amount-cell">{money(order.total)}</td></tr>)}</tbody></table></div> : <EmptyState icon="▤" title="Todavía no hay ventas" description="Cuando registres una comanda, aparecerá aquí." action={<button className="button button-outline" onClick={onNewSale}>Registrar primera venta</button>} />}
        </section>
        <aside className="panel quick-panel"><div className="panel-heading"><div><h2>Accesos rápidos</h2><p>Lo que necesitas, a mano</p></div></div><button className="quick-action" onClick={onNewSale}><span className="quick-icon quick-orange">＋</span><span><strong>Registrar una venta</strong><small>Crea una nueva comanda</small></span><b>→</b></button><button className="quick-action" onClick={onViewOrders}><span className="quick-icon quick-blue">▤</span><span><strong>Consultar ventas</strong><small>Revisa las transacciones</small></span><b>→</b></button><div className="quick-tip"><span>✦</span><p><strong>Un buen día empieza aquí</strong><br />Mantén tu catálogo al día para que el equipo venda sin contratiempos.</p></div></aside>
      </div>
    </>
  );
}

function StatCard({ title, value, caption, icon, tone }) {
  return <article className="stat-card"><div className={`stat-icon ${tone}`}>{icon}</div><span className="stat-title">{title}</span><strong className="stat-value">{value}</strong><span className="stat-caption">{caption}</span></article>;
}

function SalePage({ products, methods, busy, onSubmit, onClearError }) {
  const [cart, setCart] = useState({});
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Todos');
  const [methodId, setMethodId] = useState('');
  const [received, setReceived] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [notes, setNotes] = useState('');
  const categories = ['Todos', ...new Set(products.map((product) => product.descripcion).filter(Boolean))];
  const shownProducts = products.filter((product) => {
    const matchName = product.nombre.toLowerCase().includes(query.toLowerCase());
    const matchCategory = category === 'Todos' || product.descripcion === category;
    return matchName && matchCategory;
  });
  const cartItems = products.filter((product) => cart[product.id_producto]).map((product) => ({ ...product, cantidad: cart[product.id_producto] }));
  const total = cartItems.reduce((sum, item) => sum + Number(item.precio) * item.cantidad, 0);
  const selectedMethod = methods.find((method) => String(method.id_metodo_pago) === String(methodId));
  const isCash = selectedMethod?.es_efectivo;
  const change = isCash && Number(received) >= total ? Number(received) - total : 0;
  const add = (product) => { onClearError(); setCart((current) => ({ ...current, [product.id_producto]: (current[product.id_producto] || 0) + 1 })); };
  const updateQuantity = (productId, delta) => setCart((current) => {
    const nextQuantity = (current[productId] || 0) + delta;
    const next = { ...current };
    if (nextQuantity <= 0) delete next[productId];
    else next[productId] = nextQuantity;
    return next;
  });
  const submit = (event) => {
    event.preventDefault();
    if (!cartItems.length || !customerName.trim() || !methodId || (isCash && Number(received) < total)) return;
    onSubmit({
      id_metodo_pago: Number(methodId),
      ...(isCash ? { monto_recibido: Number(received) } : {}),
      productos: cartItems.map((item) => ({ id_producto: item.id_producto, cantidad: item.cantidad })),
      nombre_cliente: customerName,
      notas: notes,
    });
  };
  return (
    <>
      <PageHeading eyebrow="CAJA" title="Nueva venta" description="Agrega los productos y registra el pago de la comanda." />
      <div className="sale-layout">
        <section className="panel catalog-panel">
          <div className="catalog-toolbar"><div><h2>Catálogo</h2><p>{products.length} productos disponibles</p></div><div className="catalog-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar producto..." /></div></div>
          <div className="category-tabs">{categories.map((item) => <button className={category === item ? 'active' : ''} key={item} onClick={() => setCategory(item)}>{item}</button>)}</div>
          {shownProducts.length ? <div className="product-grid">{shownProducts.map((product, index) => <button className={`product-tile ${cart[product.id_producto] ? 'in-cart' : ''}`} key={product.id_producto} onClick={() => add(product)}><span className={`product-emoji emoji-${index % 6}`}>{['🍛', '🥤', '🌮', '🍰', '🥟', '🍟'][index % 6]}</span><span className="product-tile-name">{product.nombre}</span><span className="product-tile-bottom"><strong>{money(product.precio)}</strong><i>{cart[product.id_producto] ? `×${cart[product.id_producto]}` : '+'}</i></span></button>)}</div> : <EmptyState icon="⌕" title="No encontramos productos" description="Prueba con otro nombre o categoría." />}
        </section>
        <form className="panel checkout-panel" onSubmit={submit}>
          <div className="panel-heading checkout-heading"><div><h2>Tu comanda</h2><p>{cartItems.length} {cartItems.length === 1 ? 'producto' : 'productos'} en la venta</p></div><button className="clear-button" type="button" disabled={!cartItems.length} onClick={() => setCart({})}>Limpiar</button></div>
          <div className="cart-list">
            {cartItems.length ? cartItems.map((item) => <div className="cart-item" key={item.id_producto}><div className="cart-product-icon">{item.nombre.charAt(0).toUpperCase()}</div><div className="cart-product-info"><strong>{item.nombre}</strong><small>{money(item.precio)} c/u</small></div><div className="quantity-control"><button type="button" onClick={() => updateQuantity(item.id_producto, -1)} aria-label={`Quitar ${item.nombre}`}>−</button><span>{item.cantidad}</span><button type="button" onClick={() => updateQuantity(item.id_producto, 1)} aria-label={`Agregar ${item.nombre}`}>＋</button></div><strong className="cart-subtotal">{money(Number(item.precio) * item.cantidad)}</strong></div>) : <div className="empty-cart"><span>＋</span><strong>Tu comanda está vacía</strong><p>Elige productos del catálogo para empezar.</p></div>}
          </div>
          <label className="field-label" htmlFor="sale-customer-name">Nombre del cliente</label>
          <input id="sale-customer-name" className="form-input" maxLength="120" value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Ej. María Rodríguez" required />
          <label className="field-label" htmlFor="sale-notes">Notas <span className="optional">(opcional)</span></label>
          <textarea id="sale-notes" className="notes-input" maxLength="500" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Ej. Sin cebolla, para llevar..." />
          <div className="payment-section"><div className="payment-label">Método de pago</div><div className="payment-options">{methods.map((method) => <button type="button" key={method.id_metodo_pago} className={`payment-option ${String(method.id_metodo_pago) === String(methodId) ? 'selected' : ''}`} onClick={() => setMethodId(String(method.id_metodo_pago))}><span className="payment-option-icon">{method.es_efectivo ? '₡' : '↗'}</span><span>{method.nombre_metodo}</span>{String(method.id_metodo_pago) === String(methodId) && <b>✓</b>}</button>)}</div></div>
          {isCash && <div className="cash-fields"><label className="field-label" htmlFor="cash-received">Monto recibido</label><div className="currency-input"><span>₡</span><input id="cash-received" type="number" min={total} step="0.01" value={received} onChange={(event) => setReceived(event.target.value)} placeholder="0.00" required /></div><div className="change-row"><span>Vuelto</span><strong>{money(change)}</strong></div></div>}
          <div className="total-block"><span>Total a pagar</span><strong>{money(total)}</strong></div>
          <button className="button button-primary checkout-submit" disabled={busy || !cartItems.length || !customerName.trim() || !methodId || (isCash && Number(received) < total)}>{busy ? <><span className="spinner" /> Procesando...</> : <>Completar venta <span>→</span></>}</button>
          <div className="secure-note"><span>✓</span> Transacción segura · Montos en colones CRC</div>
        </form>
      </div>
    </>
  );
}

function ProductsPage({ products, isAdmin, onAdd, onEdit, onToggle }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('todos');
  const filtered = products.filter((product) => product.nombre.toLowerCase().includes(search.toLowerCase()) && (filter === 'todos' || String(product.disponible) === filter));
  return (
    <>
      <PageHeading eyebrow="CATÁLOGO" title="Productos" description="Administra los productos y su disponibilidad." actions={isAdmin && <button className="button button-primary" onClick={onAdd}><span>＋</span> Nuevo producto</button>} />
      <div className="panel listing-panel">
        <div className="list-toolbar"><div className="catalog-search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar producto..." /></div><select className="filter-select" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="todos">Todos los productos</option><option value="true">Disponibles</option><option value="false">Agotados</option></select><span className="result-count">{filtered.length} productos</span></div>
        {filtered.length ? <div className="table-scroll"><table><thead><tr><th>PRODUCTO</th><th>DESCRIPCIÓN</th><th>PRECIO</th><th>DISPONIBILIDAD</th>{isAdmin && <th className="align-right">ACCIONES</th>}</tr></thead><tbody>{filtered.map((product, index) => <tr key={product.id_producto}><td><div className="product-cell"><span className={`mini-emoji emoji-${index % 6}`}>{['🍛', '🥤', '🌮', '🍰', '🥟', '🍟'][index % 6]}</span><strong>{product.nombre}</strong></div></td><td className="muted-cell">{product.descripcion || '—'}</td><td className="amount-cell">{money(product.precio)}</td><td><span className={`status-tag ${product.disponible ? 'status-available' : 'status-unavailable'}`}><i />{product.disponible ? 'Disponible' : 'Agotado'}</span></td>{isAdmin && <td className="align-right"><div className="row-actions"><button className="edit-action" onClick={() => onEdit(product)}>Editar</button><button className={`availability-action ${product.disponible ? '' : 'restore'}`} onClick={() => onToggle(product)}>{product.disponible ? 'Marcar agotado' : 'Activar'}</button></div></td>}</tr>)}</tbody></table></div> : <EmptyState icon="◈" title="No hay productos para mostrar" description={search ? 'Revisa tu búsqueda o cambia el filtro.' : 'Cuando agregues productos, aparecerán aquí.'} /> }
      </div>
      <div className="footnote"><span>✦</span> {isAdmin ? 'Mantén actualizado el catálogo y marca como agotados los productos que ya no estén disponibles.' : 'Consulta aquí el catálogo actualizado de productos disponibles para la venta.'}</div>
    </>
  );
}

function OrdersPage({ orders, users, isAdmin, filters, setFilters, onSearch, onShowOrder }) {
  return (
    <>
      <PageHeading eyebrow="MOVIMIENTOS" title="Ventas" description="Consulta el historial de comandas registradas." />
      <section className="panel listing-panel">
        <div className="orders-toolbar"><div><h2>Historial de ventas</h2><p>{orders.length} transacciones en esta consulta</p></div><div className="filter-controls"><label>Desde<input type="date" value={filters.fecha_desde} onChange={(event) => setFilters({ ...filters, fecha_desde: event.target.value })} /></label><label>Hasta<input type="date" value={filters.fecha_hasta} onChange={(event) => setFilters({ ...filters, fecha_hasta: event.target.value })} /></label>{isAdmin && <label>Vendedor<select value={filters.id_usuario} onChange={(event) => setFilters({ ...filters, id_usuario: event.target.value })}><option value="">Todos</option>{users.filter((user) => user.estado).map((user) => <option value={user.id_usuario} key={user.id_usuario}>{user.nombre}</option>)}</select></label>}<button className="button button-primary filter-button" onClick={onSearch}>Filtrar</button></div></div>
        {orders.length ? <div className="table-scroll"><table><thead><tr><th>COMANDA</th><th>FECHA Y HORA</th><th>CLIENTE</th><th>VENDEDOR</th><th>MÉTODO</th><th>ESTADO</th><th className="align-right">TOTAL</th></tr></thead><tbody>{orders.map((order) => <tr key={order.id_comanda} className="clickable-row" onClick={() => onShowOrder(order)}><td><span className="order-number">#{order.id_comanda}</span></td><td>{dateTime(order.fecha)}</td><td>{order.nombre_cliente || 'Sin nombre'}</td><td>{order.vendedor || 'Vendedor'}</td><td><span className={`payment-tag ${order.nombre_metodo?.toLowerCase().includes('sinpe') ? 'tag-sinpe' : ''}`}>{order.nombre_metodo}</span></td><td><span className="status-tag status-available"><i />{order.estado || 'Completada'}</span></td><td className="align-right amount-cell">{money(order.total)}</td></tr>)}</tbody></table></div> : <EmptyState icon="▤" title="Sin ventas para este período" description="Prueba con otras fechas o registra una nueva comanda." /> }
      </section>
    </>
  );
}

function UsersPage({ users, onAdd, onEdit, onToggle }) {
  const [search, setSearch] = useState('');
  const filtered = users.filter((user) => `${user.nombre} ${user.username}`.toLowerCase().includes(search.toLowerCase()));
  return (
    <>
      <PageHeading eyebrow="EQUIPO" title="Vendedores" description="Administra quién tiene acceso al sistema." actions={<button className="button button-primary" onClick={onAdd}><span>＋</span> Agregar usuario</button>} />
      <section className="panel listing-panel">
        <div className="list-toolbar"><div className="catalog-search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre o usuario..." /></div><span className="result-count">{users.filter((user) => user.estado).length} usuarios activos</span></div>
        {filtered.length ? <div className="table-scroll"><table><thead><tr><th>PERSONA</th><th>NOMBRE DE USUARIO</th><th>ROL</th><th>ESTADO</th><th className="align-right">ACCIONES</th></tr></thead><tbody>{filtered.map((user) => <tr key={user.id_usuario}><td><div className="user-cell"><span className="avatar small-avatar">{user.nombre.charAt(0).toUpperCase()}</span><strong>{user.nombre}</strong></div></td><td className="muted-cell">@{user.username}</td><td><span className={`role-tag ${user.rol === 'admin' ? 'role-admin' : ''}`}>{user.rol === 'admin' ? 'Administrador' : 'Vendedor'}</span></td><td><span className={`status-tag ${user.estado ? 'status-available' : 'status-unavailable'}`}><i />{user.estado ? 'Activo' : 'Inactivo'}</span></td><td className="align-right"><div className="row-actions"><button className="edit-action" onClick={() => onEdit(user)}>Editar</button><button className={`availability-action ${user.estado ? '' : 'restore'}`} onClick={() => onToggle(user)}>{user.estado ? 'Desactivar' : 'Reactivar'}</button></div></td></tr>)}</tbody></table></div> : <EmptyState icon="♙" title="No encontramos usuarios" description="Intenta con otro nombre." /> }
      </section>
      <div className="footnote"><span>♙</span> Los vendedores pueden registrar ventas. Solo los administradores pueden gestionar productos y usuarios.</div>
    </>
  );
}

function EmptyState({ icon, title, description, action }) {
  return <div className="empty-state"><span className="empty-icon">{icon}</span><strong>{title}</strong><p>{description}</p>{action}</div>;
}

function ModalFrame({ title, description, onClose, children, wide = false }) {
  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className={`modal-card ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title"><header className="modal-header"><div><h2 id="modal-title">{title}</h2><p>{description}</p></div><button className="modal-close" onClick={onClose} aria-label="Cerrar">×</button></header>{children}</section></div>;
}

function ProductModal({ product, onClose, onSave, busy }) {
  const submit = (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onSave({ id_producto: product?.id_producto, nombre: data.get('nombre'), descripcion: data.get('descripcion'), precio: data.get('precio') });
  };
  return <ModalFrame title={product ? 'Editar producto' : 'Nuevo producto'} description="Completa la información del producto." onClose={onClose}><form className="modal-form" onSubmit={submit}><label className="field-label" htmlFor="product-name">Nombre</label><input id="product-name" name="nombre" className="form-input" maxLength="120" defaultValue={product?.nombre || ''} placeholder="Ej. Casado con pollo" required /><label className="field-label" htmlFor="product-description">Descripción <span className="optional">(opcional)</span></label><input id="product-description" name="descripcion" className="form-input" maxLength="500" defaultValue={product?.descripcion || ''} placeholder="Ej. Acompañado de ensalada" /><label className="field-label" htmlFor="product-price">Precio en colones</label><div className="currency-input modal-currency"><span>₡</span><input id="product-price" name="precio" type="number" min="0" max="99999999.99" step="0.01" defaultValue={product?.precio ?? ''} placeholder="0.00" required /></div><div className="modal-actions"><button type="button" className="button button-outline" onClick={onClose}>Cancelar</button><button className="button button-primary" disabled={busy}>{busy ? 'Guardando...' : product ? 'Guardar cambios' : 'Crear producto'}</button></div></form></ModalFrame>;
}

function UserModal({ user, onClose, onSave, busy }) {
  const submit = (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const payload = { nombre: data.get('nombre'), username: data.get('username'), rol: data.get('rol') };
    if (data.get('password')) payload.password = data.get('password');
    if (user) payload.estado = user.estado;
    onSave({ id_usuario: user?.id_usuario, ...payload });
  };
  return <ModalFrame title={user ? 'Editar usuario' : 'Agregar vendedor'} description={user ? 'Actualiza los datos y permisos de acceso.' : 'Crea el acceso para una persona del equipo.'} onClose={onClose}><form className="modal-form" onSubmit={submit}><label className="field-label" htmlFor="user-name">Nombre completo</label><input id="user-name" name="nombre" className="form-input" maxLength="120" defaultValue={user?.nombre || ''} placeholder="Ej. María Rodríguez" required /><label className="field-label" htmlFor="user-username">Nombre de usuario</label><input id="user-username" name="username" className="form-input" maxLength="50" defaultValue={user?.username || ''} placeholder="Ej. maria" required /><label className="field-label" htmlFor="user-role">Rol de acceso</label><select id="user-role" name="rol" className="form-input" defaultValue={user?.rol || 'vendedor'}><option value="vendedor">Vendedor</option><option value="admin">Administrador</option></select><label className="field-label" htmlFor="user-password">{user ? 'Nueva contraseña' : 'Contraseña'} {user && <span className="optional">(opcional)</span>}</label><input id="user-password" name="password" className="form-input" type="password" minLength="8" maxLength="72" placeholder={user ? 'Dejar en blanco para mantenerla' : 'Mínimo 8 caracteres'} required={!user} /><div className="form-hint">La contraseña debe tener al menos 8 caracteres.</div><div className="modal-actions"><button type="button" className="button button-outline" onClick={onClose}>Cancelar</button><button className="button button-primary" disabled={busy}>{busy ? 'Guardando...' : user ? 'Guardar cambios' : 'Crear usuario'}</button></div></form></ModalFrame>;
}

function SuccessModal({ order, onClose, onDetail }) {
  return <ModalFrame title="¡Venta registrada!" description={`Comanda #${order.id_comanda} guardada correctamente.`} onClose={onClose}><div className="success-content"><span className="success-check">✓</span><span className="success-total">{money(order.total)}</span><span className="success-caption">Total de la venta</span><div className="success-meta"><span>Cliente: <strong>{order.nombre_cliente}</strong></span><span>Pago: <strong>{order.nombre_metodo}</strong></span><span>Vuelto: <strong>{money(order.vuelto)}</strong></span></div><div className="modal-actions"><button className="button button-outline" onClick={onDetail}>Ver comanda</button><button className="button button-primary" onClick={onClose}>Listo</button></div></div></ModalFrame>;
}

function OrderModal({ order, onClose }) {
  return <ModalFrame title={`Comanda #${order.id_comanda}`} description={dateTime(order.fecha)} onClose={onClose} wide><div className="order-detail"><div className="order-summary-grid"><div><span>Cliente</span><strong>{order.nombre_cliente || 'Sin nombre'}</strong></div><div><span>Vendedor</span><strong>{order.vendedor || 'Vendedor'}</strong></div><div><span>Método de pago</span><strong>{order.nombre_metodo}</strong></div><div><span>Recibido</span><strong>{money(order.monto_recibido)}</strong></div><div><span>Vuelto</span><strong>{money(order.vuelto)}</strong></div></div><div className="table-scroll detail-table"><table><thead><tr><th>PRODUCTO</th><th>CANTIDAD</th><th>PRECIO UNITARIO</th><th className="align-right">SUBTOTAL</th></tr></thead><tbody>{order.detalle?.map((item) => <tr key={item.id_detalle}><td><strong>{item.nombre_producto}</strong></td><td>{item.cantidad}</td><td>{money(item.precio_unitario)}</td><td className="align-right amount-cell">{money(item.subtotal)}</td></tr>)}</tbody></table></div>{order.notas && <div className="order-notes"><span>Notas</span><p>{order.notas}</p></div>}<div className="order-grand-total"><span>Total</span><strong>{money(order.total)}</strong></div><div className="modal-actions"><button className="button button-primary" onClick={onClose}>Cerrar</button></div></div></ModalFrame>;
}

export default App;
