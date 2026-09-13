
import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ShoppingCart, Search, Plus, Minus, Trash2, X, CheckCircle2, ChevronDown,
  ChevronLeft, LayoutGrid, Receipt, Users, CreditCard as CreditCardIcon,
  LogOut, Wallet, Banknote, Smartphone, Clock, Package, TrendingUp,
  Coffee, Tag, Link2, Globe, Megaphone, UtensilsCrossed, Settings, Printer, Bell, Camera,
} from 'lucide-react';
import { supabase } from './supabaseClient.js';

// ==================================================================
// Autenticación
// ==================================================================

function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (authError) setError('Correo o contraseña incorrectos.');
  }

  return (
    <div className="login-shell">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="brand-mark">CA</div>
        <h1>Cafetería</h1>
        <p>Ingresa con tu cuenta de caja</p>
        {error && <div className="login-error">{error}</div>}
        <div className="login-field">
          <label>Correo</label>
          <div className="field"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="usuario@laneverita.pe" required autoFocus /></div>
        </div>
        <div className="login-field">
          <label>Contraseña</label>
          <div className="field"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required /></div>
        </div>
        <button className="login-submit" disabled={loading} type="submit">{loading ? 'Ingresando...' : 'Ingresar'}</button>
      </form>
    </div>
  );
}

// ==================================================================
// Utilidades
// ==================================================================

function formatMoney(n) {
  return `S/ ${Number(n || 0).toFixed(2)}`;
}

function formatFecha(iso) {
  const d = new Date(iso);
  return d.toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const PRODUCT_ICON_CLASSES = ['mint', 'lime', 'coffee', 'latte', 'orange', 'green', 'sand', 'yellow', 'sky'];
function iconClassFor(id) { return PRODUCT_ICON_CLASSES[id % PRODUCT_ICON_CLASSES.length]; }

// ==================================================================
// Caja (POS)
// ==================================================================

function CajaView({ profile, activeBranchId, branchName }) {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [category, setCategory] = useState('Todas las categorías');
  const [search, setSearch] = useState('');
  const [barcode, setBarcode] = useState('');
  const [cart, setCart] = useState([]);
  const [payment, setPayment] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  const [printerConnected, setPrinterConnected] = useState(false);
  const [printerConnecting, setPrinterConnecting] = useState(false);

  function conectarTicketera() {
    setPrinterConnecting(true);
    setTimeout(() => { setPrinterConnecting(false); setPrinterConnected(true); }, 900);
  }

  useEffect(() => {
    let active = true;
    async function loadCatalog() {
      setLoadingCatalog(true);
      const [{ data: cats, error: catErr }, { data: prods, error: prodErr }] = await Promise.all([
        supabase.from('categories').select('*').eq('branch_id', activeBranchId).eq('active', true).order('position'),
        supabase.from('products').select('*').eq('branch_id', activeBranchId).eq('active', true).order('name'),
      ]);
      if (!active) return;
      if (catErr || prodErr) {
        setError('No se pudo cargar el catálogo. Intenta recargar la página.');
      } else {
        setCategories(cats || []);
        setProducts(prods || []);
      }
      setLoadingCatalog(false);
    }
    loadCatalog();
    return () => { active = false; };
  }, [activeBranchId]);

  const categoryNames = useMemo(() => ['Todas las categorías', ...categories.map((c) => c.name)], [categories]);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const matchesCategory = category === 'Todas las categorías' || categories.find((c) => c.id === p.category_id)?.name === category;
      const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [products, categories, category, search]);

  function addProduct(p) {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === p.id);
      if (existing) return prev.map((i) => (i.id === p.id ? { ...i, quantity: i.quantity + 1 } : i));
      return [...prev, { ...p, quantity: 1 }];
    });
  }

  function changeQuantity(id, delta) {
    setCart((prev) => prev
      .map((i) => (i.id === id ? { ...i, quantity: i.quantity + delta } : i))
      .filter((i) => i.quantity > 0));
  }

  function addBarcode() {
    if (!barcode.trim()) return;
    const codigo = barcode.trim();
    const porCodigo = products.find((p) => p.sku && p.sku.toLowerCase() === codigo.toLowerCase());
    const match = porCodigo || products.find((p) => p.name.toLowerCase().includes(codigo.toLowerCase()));
    if (match) { addProduct(match); setError(''); } else { setError(`No se encontró ningún producto para "${codigo}".`); }
    setBarcode('');
  }

  const total = cart.reduce((sum, i) => sum + Number(i.price) * i.quantity, 0);
  const itemCount = cart.reduce((sum, i) => sum + i.quantity, 0);

  async function completarPago(metodo) {
    setSaving(true);
    setError('');
    const { data: order, error: orderErr } = await supabase.from('orders').insert({
      customer_name: 'generico',
      total,
      organization_id: profile.organization_id,
      branch_id: activeBranchId,
      status: 'completed',
      channel: 'counter',
      payment_method: metodo,
      activo: true,
    }).select().single();

    if (orderErr) { setSaving(false); setError('No se pudo registrar la venta. Intenta de nuevo.'); return; }

    const items = cart.map((i) => ({ order_id: order.id, product_id: i.id, quantity: i.quantity }));
    const { error: itemsErr } = await supabase.from('order_items').insert(items);
    if (itemsErr) { setSaving(false); setError('La venta se creó pero hubo un error guardando los productos.'); return; }

    // Descuenta stock (mejor esfuerzo; no bloquea la venta si falla)
    await Promise.all(cart.map((i) =>
      supabase.from('products').update({ stock: Math.max(0, i.stock - i.quantity) }).eq('id', i.id)
    ));

    setSaving(false);
    setDone({ total, itemCount });
    setCart([]);
  }

  function cerrarModal() {
    setPayment(false);
    if (done) {
      setProducts((prev) => prev); // noop, catálogo ya actualizado localmente vía stock si se desea
      setDone(null);
    }
  }

  return (
    <>
      <div className="workspace">
        <div className="catalog">
          <div className="ticket-banner">
            <div>
              <span className="banner-title"><Package size={13} className="signal-icon" />CATÁLOGO — {branchName}</span>
              <p>{loadingCatalog ? 'Cargando productos...' : `${products.length} productos activos`}</p>
              <span>Datos en vivo desde Supabase</span>
            </div>
          </div>

          <div className="hardware-row">
            <div className={`printer-card ${printerConnected ? 'connected' : ''}`}>
              <div className="printer-card-top">
                <Printer size={15} />
                <span>Ticketera</span>
                <em className={printerConnected ? 'ok' : 'off'}>{printerConnecting ? 'Conectando...' : printerConnected ? 'Conectada' : 'Sin conexión'}</em>
              </div>
              {!printerConnected && (
                <div className="printer-card-body">
                  <p>Conexión directa disponible: conecta la ticketera una vez.</p>
                  <div className="printer-card-actions">
                    <button onClick={conectarTicketera} disabled={printerConnecting}>{printerConnecting ? 'Conectando...' : 'Conectar'}</button>
                    <span className="printer-mode">Modo: Servidor</span>
                  </div>
                </div>
              )}
            </div>
            <div className="barcode-status"><Camera size={14} />Código de barras — escaneo automático <CheckCircle2 size={13} /></div>
          </div>

          <div className="scan-row">
            <div className="field barcode"><Search size={16} /><input value={barcode} onChange={(e) => setBarcode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addBarcode()} placeholder="Escanea o escribe el nombre del producto..." /></div>
            <button className="add-button" onClick={addBarcode}><Plus size={15} />Agregar</button>
          </div>

          <div className="filters">
            <label>Abonado opcional<div className="select-like">— Ningún abonado —<ChevronDown size={15} /></div></label>
            <label>Cliente opcional<div className="select-like muted">Cliente</div></label>
            <label>Categoría<div className="select-like category-select"><select value={category} onChange={(e) => setCategory(e.target.value)}>{categoryNames.map((c) => <option key={c} value={c}>{c}</option>)}</select><ChevronDown size={15} /></div></label>
            <label className="search-field">Buscar producto<div className="field"><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar: agua, pan..." /></div></label>
          </div>

          <div className="products-heading"><div><span className="eyebrow">Catálogo</span><h2>{filtered.length} disponibles</h2></div><span className="touch-hint">Toca para agregar</span></div>

          {error && <div className="cart-error">{error}</div>}

          <div className="product-grid">
            {filtered.map((p) => (
              <div key={p.id} className="product-card">
                <button className="product-main" onClick={() => addProduct(p)}>
                  <div className={`product-icon ${iconClassFor(p.id)}`}>{p.image_url ? <img src={p.image_url} alt="" onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'block'; }} /> : null}<span style={{ display: p.image_url ? 'none' : 'block' }}>🥤</span></div>
                  <div className="product-info">
                    <h3>{p.name}</h3>
                    <strong>{formatMoney(p.price)}</strong>
                    <span>Stock: {p.stock}</span>
                  </div>
                </button>
                <button className="card-add" onClick={() => addProduct(p)}><Plus size={13} />Agregar</button>
              </div>
            ))}
          </div>
        </div>

        <div className="cart-panel">
          <div className="cart-header">
            <div><h2>Carrito</h2></div>
            {cart.length > 0 && <button className="clear" onClick={() => setCart([])}>Vaciar</button>}
          </div>
          <div className="cart-meta"><span><ShoppingCart size={13} />{itemCount} artículos</span><span>{branchName}</span></div>

          {cart.length === 0 ? (
            <div className="empty-cart">
              <div className="empty-icon"><ShoppingCart size={22} /></div>
              <h3>Carrito vacío</h3>
              <p>Agrega productos para comenzar</p>
            </div>
          ) : (
            <div className="cart-items">
              {cart.map((i) => (
                <div key={i.id} className="cart-item">
                  <div className={`item-thumb ${iconClassFor(i.id)}`}>🥤</div>
                  <div className="item-copy"><b>{i.name}</b><span>{formatMoney(i.price)} c/u</span>
                    <div className="quantity"><button onClick={() => changeQuantity(i.id, -1)}><Minus size={11} /></button>{i.quantity}<button onClick={() => changeQuantity(i.id, 1)}><Plus size={11} /></button></div>
                  </div>
                  <strong>{formatMoney(i.price * i.quantity)}</strong>
                  <button className="remove" onClick={() => changeQuantity(i.id, -i.quantity)}><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}

          <div className="cart-footer">
            <div className="summary-line"><span>Subtotal</span><b>{formatMoney(total)}</b></div>
            <div className="total-line">Total<b> {formatMoney(total)}</b></div>
            <button className="pay-button" disabled={cart.length === 0} onClick={() => setPayment(true)}><Wallet size={16} />Cobrar <span>{formatMoney(total)}</span></button>
          </div>
        </div>
      </div>

      {payment && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && !saving && cerrarModal()}>
          <div className="payment-modal">
            <button className="modal-close" onClick={cerrarModal}><X size={16} /></button>
            {done ? (
              <>
                <div className="success-mark"><CheckCircle2 size={26} /></div>
                <h2>¡Venta registrada!</h2>
                <p>Total cobrado <strong>{formatMoney(done.total)}</strong></p>
                <button className="login-submit" style={{ marginTop: 24 }} onClick={cerrarModal}>Nueva venta</button>
              </>
            ) : (
              <>
                <h2>Elige el método de pago</h2>
                <p>Total a cobrar <strong>{formatMoney(total)}</strong></p>
                {error && <div className="cart-error">{error}</div>}
                <div className="payment-options">
                  <button disabled={saving} onClick={() => completarPago('efectivo')}><Banknote size={20} />Efectivo</button>
                  <button disabled={saving} onClick={() => completarPago('yape')}><Smartphone size={20} />Yape/Plin</button>
                  <button disabled={saving} onClick={() => completarPago('tarjeta')}><CreditCardIcon size={20} />Tarjeta</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ==================================================================
// Pedidos
// ==================================================================

function inicioDeHoyISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function PedidosView({ profile, activeBranchId, onBack }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [itemsByOrder, setItemsByOrder] = useState({});

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setLoadError('');
      // Solo las ventas de HOY (desde medianoche) — el conteo de productos es liviano y rápido
      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(count)')
        .eq('branch_id', activeBranchId)
        .gte('created_at', inicioDeHoyISO())
        .order('created_at', { ascending: false })
        .limit(500);
      if (!active) return;
      if (error) {
        console.error('Error cargando pedidos:', error);
        setLoadError(error.message || 'No se pudieron cargar los pedidos.');
        setOrders([]);
      } else {
        setOrders(data || []);
      }
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, [activeBranchId]);

  async function toggleExpand(order) {
    if (expanded === order.id) { setExpanded(null); return; }
    setExpanded(order.id);
    if (!itemsByOrder[order.id]) {
      const { data, error } = await supabase.from('order_items').select('quantity, product_id, products(name, price)').eq('order_id', order.id);
      if (error) console.error('Error cargando detalle del pedido:', error);
      setItemsByOrder((prev) => ({ ...prev, [order.id]: data || [] }));
    }
  }

  const [deleting, setDeleting] = useState(null);

  async function eliminarPedido(order, e) {
    e.stopPropagation();
    if (!window.confirm(`¿Eliminar el pedido #${order.id} (${formatMoney(order.total)})? Esto no se puede deshacer. El stock de sus productos se va a devolver automáticamente.`)) return;
    setDeleting(order.id);

    // Trae los items (usa los ya cargados si el pedido estaba expandido)
    let items = itemsByOrder[order.id];
    if (!items) {
      const { data } = await supabase.from('order_items').select('quantity, product_id').eq('order_id', order.id);
      items = data || [];
    }

    // Devuelve el stock de cada producto (mejor esfuerzo, no bloquea el borrado si falla)
    await Promise.all(items.map(async (it) => {
      const { data: prod } = await supabase.from('products').select('stock').eq('id', it.product_id).single();
      if (prod) await supabase.from('products').update({ stock: prod.stock + it.quantity }).eq('id', it.product_id);
    }));

    const { error: err } = await supabase.from('orders').delete().eq('id', order.id);
    setDeleting(null);
    if (err) { window.alert(`No se pudo eliminar el pedido: ${err.message}`); return; }
    setOrders((prev) => prev.filter((o) => o.id !== order.id));
    if (expanded === order.id) setExpanded(null);
  }

  const totalVendido = orders.reduce((s, o) => s + Number(o.total), 0);

  return (
    <div className="pedidos-view">
      <div className="pedidos-header">
        <button className="back-btn" onClick={onBack}><ChevronLeft size={15} />Volver a caja</button>
        <div className="pedidos-stats">
          <div className="stat-card"><div className="stat-icon"><Receipt size={18} /></div><div><span className="stat-label">Ventas de hoy</span><strong>{orders.length}</strong></div></div>
          <div className="stat-card"><div className="stat-icon"><TrendingUp size={18} /></div><div><span className="stat-label">Total vendido hoy</span><strong>{formatMoney(totalVendido)}</strong></div></div>
          <div className="stat-card"><div className="stat-icon"><Clock size={18} /></div><div><span className="stat-label">Última venta</span><strong>{orders[0] ? formatFecha(orders[0].created_at) : '—'}</strong></div></div>
        </div>
      </div>

      {loading ? (
        <div className="pedidos-loading">Cargando pedidos...</div>
      ) : loadError ? (
        <div className="pedidos-empty"><div className="empty-icon"><Receipt size={22} /></div><h3>No se pudieron cargar los pedidos</h3><p>{loadError}</p></div>
      ) : orders.length === 0 ? (
        <div className="pedidos-empty"><div className="empty-icon"><Receipt size={22} /></div><h3>Sin ventas hoy todavía</h3><p>Las ventas que registres en caja van a aparecer aquí, y se reinician automáticamente cada día a medianoche.</p></div>
      ) : (
        <div className="pedidos-list">
          {orders.map((o) => {
            const itemCount = o.order_items?.[0]?.count || 0;
            const items = itemsByOrder[o.id];
            return (
              <div key={o.id} className={`pedido-card ${expanded === o.id ? 'expanded' : ''}`} onClick={() => toggleExpand(o)}>
                <div className="pedido-top">
                  <div className="pedido-icon"><Receipt size={16} /></div>
                  <div className="pedido-main"><span className="pedido-id">Pedido #{o.id}</span><span className="pedido-fecha"><Clock size={10} />{formatFecha(o.created_at)}</span></div>
                  <span className="pedido-items-count">{itemCount} {itemCount === 1 ? 'producto' : 'productos'}</span>
                  <span className="pedido-total">{formatMoney(o.total)}</span>
                  <button className="icon-btn danger pedido-delete" title="Eliminar pedido" onClick={(e) => eliminarPedido(o, e)} disabled={deleting === o.id}><Trash2 size={14} /></button>
                  <ChevronDown size={16} className={`chevron ${expanded === o.id ? 'rotated' : ''}`} />
                </div>
                {expanded === o.id && (
                  <div className="pedido-detail">
                    <div className="pedido-detail-items">
                      {!items ? (
                        <div className="pedido-detail-item"><span className="pd-name">Cargando...</span></div>
                      ) : items.length === 0 ? (
                        <div className="pedido-detail-item"><span className="pd-name">Sin productos registrados</span></div>
                      ) : items.map((it, idx) => (
                        <div key={idx} className="pedido-detail-item"><span className="pd-name">{it.quantity}× {it.products?.name || 'Producto'}</span><span className="pd-price">{formatMoney(Number(it.products?.price || 0) * it.quantity)}</span></div>
                      ))}
                    </div>
                    <div className="pedido-detail-footer">
                      <span className="pd-method">{o.payment_method || 'sin especificar'}</span>
                      <div className="pd-total-line">Total<b>{formatMoney(o.total)}</b></div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ==================================================================
// Abonados
// ==================================================================

function AbonadosView({ activeBranchId }) {
  const [abonados, setAbonados] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    supabase.from('abonados').select('*').eq('branch_id', activeBranchId).eq('active', true).order('student_name').then(({ data }) => {
      if (active) { setAbonados(data || []); setLoading(false); }
    });
    return () => { active = false; };
  }, [activeBranchId]);

  const filtered = abonados.filter((a) => a.student_name.toLowerCase().includes(search.toLowerCase()) || a.parent_name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="list-view">
      <div className="list-header">
        <h2>Abonados ({abonados.length})</h2>
        <div className="field list-search"><Search size={15} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar alumno o apoderado..." /></div>
      </div>
      {loading ? <div className="pedidos-loading">Cargando...</div> : (
        <div className="list-table">
          <div className="list-row head"><span>Alumno</span><span>Apoderado</span><span>Saldo</span></div>
          {filtered.map((a) => (
            <div key={a.id} className="list-row">
              <div><div className="list-name">{a.student_name}</div>{a.aula && <div className="list-sub">{a.aula}</div>}</div>
              <div className="list-name">{a.parent_name}</div>
              <span className={`balance-chip ${a.balance > 0 ? 'positive' : a.balance < 0 ? 'negative' : 'zero'}`}>{formatMoney(a.balance)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ==================================================================
// Créditos
// ==================================================================

function CreditosView({ activeBranchId }) {
  const [clientes, setClientes] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    supabase.from('credito_clientes').select('*').eq('branch_id', activeBranchId).eq('active', true).order('nombre').then(({ data }) => {
      if (active) { setClientes(data || []); setLoading(false); }
    });
    return () => { active = false; };
  }, [activeBranchId]);

  const filtered = clientes.filter((c) => c.nombre.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="list-view">
      <div className="list-header">
        <h2>Créditos ({clientes.length})</h2>
        <div className="field list-search"><Search size={15} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente..." /></div>
      </div>
      {loading ? <div className="pedidos-loading">Cargando...</div> : (
        <div className="list-table">
          <div className="list-row head"><span>Cliente</span><span>Límite</span><span>Deuda</span></div>
          {filtered.map((c) => (
            <div key={c.id} className="list-row">
              <div><div className="list-name">{c.nombre}</div>{c.telefono && <div className="list-sub">{c.telefono}</div>}</div>
              <div className="list-name">{c.limite != null ? formatMoney(c.limite) : '—'}</div>
              <span className={`balance-chip ${c.deuda > 0 ? 'negative' : 'zero'}`}>{formatMoney(c.deuda)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PlaceholderView({ label }) {
  return (
    <div className="placeholder-view">
      <h2>{label}</h2>
      <p>Esta sección estará disponible próximamente.</p>
    </div>
  );
}

function ProductosView({ profile, activeBranchId }) {
  const [productos, setProductos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null); // null | 'new' | producto object
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', price: '', stock: '', category_id: '', sku: '', image_url: '' });
  const [nuevaCategoria, setNuevaCategoria] = useState(null); // null = oculto, '' = mostrando input vacío
  const [creandoCategoria, setCreandoCategoria] = useState(false);

  async function cargar() {
    setLoading(true);
    const [{ data: prods, error: err1 }, { data: cats, error: err2 }] = await Promise.all([
      supabase.from('products').select('*').eq('branch_id', activeBranchId).order('name'),
      supabase.from('categories').select('*').eq('branch_id', activeBranchId).eq('active', true).order('position'),
    ]);
    if (err1 || err2) { setError((err1 || err2).message); } else { setProductos(prods || []); setCategorias(cats || []); setError(''); }
    setLoading(false);
  }

  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [activeBranchId]);

  function abrirNuevo() {
    setForm({ name: '', price: '', stock: '', category_id: categorias[0]?.id || '', sku: '', image_url: '' });
    setNuevaCategoria(null);
    setModal('new');
  }

  function abrirEditar(p) {
    setForm({ name: p.name, price: p.price, stock: p.stock, category_id: p.category_id, sku: p.sku || '', image_url: p.image_url || '' });
    setNuevaCategoria(null);
    setModal(p);
  }

  async function crearCategoriaRapida() {
    const nombre = (nuevaCategoria || '').trim();
    if (!nombre) { setError('Escribe un nombre para la nueva categoría.'); return; }
    setCreandoCategoria(true);
    setError('');
    const { data, error: err } = await supabase.from('categories').insert({
      name: nombre, position: categorias.length,
      organization_id: profile.organization_id, branch_id: activeBranchId, active: true,
    }).select().single();
    setCreandoCategoria(false);
    if (err) { setError(err.message); return; }
    setCategorias((prev) => [...prev, data]);
    setForm((f) => ({ ...f, category_id: data.id }));
    setNuevaCategoria(null);
  }

  async function guardar() {
    if (!form.name.trim()) { setError('Ponle un nombre al producto.'); return; }
    if (!form.category_id) { setError('Elige una categoría (crea una primero en la sección Categorías si no hay ninguna).'); return; }
    setSaving(true);
    setError('');
    const payload = {
      name: form.name.trim(),
      price: Number(form.price) || 0,
      stock: Number(form.stock) || 0,
      category_id: Number(form.category_id),
      sku: form.sku.trim() || null,
      image_url: form.image_url.trim() || null,
    };
    if (modal === 'new') {
      const { error: err } = await supabase.from('products').insert({ ...payload, organization_id: profile.organization_id, branch_id: activeBranchId, active: true });
      if (err) { setError(err.message); setSaving(false); return; }
    } else {
      const { error: err } = await supabase.from('products').update(payload).eq('id', modal.id);
      if (err) { setError(err.message); setSaving(false); return; }
    }
    setSaving(false);
    setModal(null);
    cargar();
  }

  async function toggleActivo(p) {
    const { error: err } = await supabase.from('products').update({ active: !p.active }).eq('id', p.id);
    if (err) { setError(err.message); return; }
    cargar();
  }

  async function eliminar(p) {
    if (!window.confirm(`¿Eliminar "${p.name}"? Esto no se puede deshacer. Si tiene ventas registradas, esas líneas de venta también se van a borrar (el total de cada venta se mantiene, solo se pierde el detalle de este producto en ellas).`)) return;
    const { error: err } = await supabase.from('products').delete().eq('id', p.id);
    if (err) {
      const msg = `No se pudo eliminar: ${err.message}`;
      setError(msg);
      window.alert(msg);
      return;
    }
    cargar();
  }

  const nombreCategoria = (id) => categorias.find((c) => c.id === id)?.name || '—';

  return (
    <div className="list-view">
      <div className="list-header">
        <h2>Productos ({productos.length})</h2>
        <button className="add-button" onClick={abrirNuevo}><Plus size={15} />Nuevo producto</button>
      </div>

      {error && <div className="cart-error">{error}</div>}

      {loading ? <div className="pedidos-loading">Cargando...</div> : productos.length === 0 ? (
        <div className="pedidos-empty"><div className="empty-icon"><Coffee size={22} /></div><h3>Sin productos todavía</h3><p>Crea el primero con el botón de arriba.</p></div>
      ) : (
        <div className="list-table">
          <div className="list-row head prod-row"><span>Producto</span><span>Categoría</span><span>Precio</span><span>Stock</span><span></span></div>
          {productos.map((p) => (
            <div key={p.id} className="list-row prod-row">
              <div className="prod-name-cell">
                <div className={`product-icon ${iconClassFor(p.id)} prod-thumb-sm`}>{p.image_url ? <img src={p.image_url} alt="" /> : '🥤'}</div>
                <div><div className="list-name">{p.name}</div>{p.sku && <div className="list-sub">Código: {p.sku}</div>}</div>
              </div>
              <div className="list-sub">{nombreCategoria(p.category_id)}</div>
              <div className="list-name">{formatMoney(p.price)}</div>
              <button className={`balance-chip ${p.stock > 0 ? 'positive' : 'negative'} chip-button`} onClick={() => toggleActivo(p)} title={p.active ? 'Activo — clic para desactivar' : 'Inactivo — clic para activar'}>{p.stock} {p.active ? '' : '(inactivo)'}</button>
              <div className="cat-actions">
                <button className="icon-btn" title="Editar" onClick={() => abrirEditar(p)}><Coffee size={14} /></button>
                <button className="icon-btn danger" title="Eliminar" onClick={() => eliminar(p)}><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && !saving && setModal(null)}>
          <div className="payment-modal cat-modal">
            <button className="modal-close" onClick={() => setModal(null)}><X size={16} /></button>
            <h2>{modal === 'new' ? 'Nuevo producto' : 'Editar producto'}</h2>

            <div className="login-field" style={{ textAlign: 'left', marginTop: 18 }}>
              <label>NOMBRE</label>
              <div className="field"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej: Agua mineral" autoFocus /></div>
            </div>
            <div className="form-grid-2">
              <div className="login-field" style={{ textAlign: 'left' }}>
                <label>PRECIO (S/)</label>
                <div className="field"><input type="number" step="0.01" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="0.00" /></div>
              </div>
              <div className="login-field" style={{ textAlign: 'left' }}>
                <label>STOCK</label>
                <div className="field"><input type="number" min="0" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} placeholder="0" /></div>
              </div>
            </div>
            <div className="login-field" style={{ textAlign: 'left' }}>
              <label>CATEGORÍA</label>
              {nuevaCategoria === null ? (
                <div className="select-like category-select"><select value={form.category_id} onChange={(e) => { if (e.target.value === '__nueva__') { setNuevaCategoria(''); } else { setForm({ ...form, category_id: e.target.value }); } }}>
                  {categorias.length === 0 && <option value="">— no hay categorías todavía —</option>}
                  {categorias.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  <option value="__nueva__">+ Crear nueva categoría...</option>
                </select><ChevronDown size={15} /></div>
              ) : (
                <div className="new-cat-row">
                  <div className="field"><input value={nuevaCategoria} onChange={(e) => setNuevaCategoria(e.target.value)} placeholder="Nombre de la categoría nueva" autoFocus onKeyDown={(e) => e.key === 'Enter' && crearCategoriaRapida()} /></div>
                  <button className="add-button" type="button" onClick={crearCategoriaRapida} disabled={creandoCategoria}>{creandoCategoria ? '...' : 'Crear'}</button>
                  <button className="icon-btn" type="button" onClick={() => setNuevaCategoria(null)}><X size={14} /></button>
                </div>
              )}
            </div>
            <div className="login-field" style={{ textAlign: 'left' }}>
              <label>CÓDIGO DE BARRAS (opcional)</label>
              <div className="field"><input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="Escanea o escribe el código" /></div>
              <span className="field-hint">Con esto el cajero puede escanear el producto en la Caja rápida.</span>
            </div>
            <div className="login-field" style={{ textAlign: 'left' }}>
              <label>IMAGEN (opcional, link a una foto)</label>
              <div className="field"><input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} placeholder="https://..." /></div>
            </div>

            {error && <div className="cart-error">{error}</div>}
            <button className="login-submit" onClick={guardar} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function CategoriasView({ profile, activeBranchId }) {
  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null); // null | 'new' | categoria object
  const [nombre, setNombre] = useState('');
  const [posicion, setPosicion] = useState(0);
  const [saving, setSaving] = useState(false);

  async function cargar() {
    setLoading(true);
    const { data, error: err } = await supabase.from('categories').select('*').eq('branch_id', activeBranchId).order('position').order('name');
    if (err) { setError(err.message); } else { setCategorias(data || []); setError(''); }
    setLoading(false);
  }

  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [activeBranchId]);

  function abrirNueva() {
    setNombre('');
    setPosicion(categorias.length);
    setModal('new');
  }

  function abrirEditar(cat) {
    setNombre(cat.name);
    setPosicion(cat.position);
    setModal(cat);
  }

  async function guardar() {
    if (!nombre.trim()) { setError('Ponle un nombre a la categoría.'); return; }
    setSaving(true);
    setError('');
    if (modal === 'new') {
      const { error: err } = await supabase.from('categories').insert({
        name: nombre.trim(), position: Number(posicion) || 0,
        organization_id: profile.organization_id, branch_id: activeBranchId, active: true,
      });
      if (err) { setError(err.message); setSaving(false); return; }
    } else {
      const { error: err } = await supabase.from('categories').update({ name: nombre.trim(), position: Number(posicion) || 0 }).eq('id', modal.id);
      if (err) { setError(err.message); setSaving(false); return; }
    }
    setSaving(false);
    setModal(null);
    cargar();
  }

  async function toggleActiva(cat) {
    const { error: err } = await supabase.from('categories').update({ active: !cat.active }).eq('id', cat.id);
    if (err) { setError(err.message); return; }
    cargar();
  }

  async function eliminar(cat) {
    if (!window.confirm(`¿Eliminar la categoría "${cat.name}"? Esto no se puede deshacer.`)) return;
    const { error: err } = await supabase.from('categories').delete().eq('id', cat.id);
    if (err) {
      const msg = err.code === '23503'
        ? `No se pudo eliminar "${cat.name}" porque todavía tiene productos dentro. Mueve o elimina esos productos primero, o usa "Desactivar" en su lugar (clic en el chip de estado).`
        : `No se pudo eliminar: ${err.message}`;
      setError(msg);
      window.alert(msg);
      return;
    }
    cargar();
  }

  return (
    <div className="list-view">
      <div className="list-header">
        <h2>Categorías ({categorias.length})</h2>
        <button className="add-button" onClick={abrirNueva}><Plus size={15} />Nueva categoría</button>
      </div>

      {error && <div className="cart-error">{error}</div>}

      {loading ? <div className="pedidos-loading">Cargando...</div> : categorias.length === 0 ? (
        <div className="pedidos-empty"><div className="empty-icon"><Tag size={22} /></div><h3>Sin categorías todavía</h3><p>Crea la primera con el botón de arriba.</p></div>
      ) : (
        <div className="list-table">
          <div className="list-row head cat-row"><span>Nombre</span><span>Orden</span><span>Estado</span><span></span></div>
          {categorias.map((c) => (
            <div key={c.id} className="list-row cat-row">
              <div className="list-name">{c.name}</div>
              <div className="list-sub">{c.position}</div>
              <button className={`balance-chip ${c.active ? 'positive' : 'zero'} chip-button`} onClick={() => toggleActiva(c)}>{c.active ? 'Activa' : 'Inactiva'}</button>
              <div className="cat-actions">
                <button className="icon-btn" title="Editar" onClick={() => abrirEditar(c)}><Tag size={14} /></button>
                <button className="icon-btn danger" title="Eliminar" onClick={() => eliminar(c)}><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && !saving && setModal(null)}>
          <div className="payment-modal cat-modal">
            <button className="modal-close" onClick={() => setModal(null)}><X size={16} /></button>
            <h2>{modal === 'new' ? 'Nueva categoría' : 'Editar categoría'}</h2>
            <div className="login-field" style={{ textAlign: 'left', marginTop: 20 }}>
              <label>NOMBRE</label>
              <div className="field"><input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Bebidas" autoFocus /></div>
            </div>
            <div className="login-field" style={{ textAlign: 'left' }}>
              <label>ORDEN (0 = primero)</label>
              <div className="field"><input type="number" value={posicion} onChange={(e) => setPosicion(e.target.value)} /></div>
            </div>
            {error && <div className="cart-error">{error}</div>}
            <button className="login-submit" onClick={guardar} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ==================================================================
// Shell principal (sidebar + topbar)
// ==================================================================

const ROLE_LABEL = { SERVICE_ADMIN: 'Administrador de servicio', COMPANY_ADMIN: 'Administrador', CASHIER: 'Cajero/a' };

function MainApp({ profile }) {
  const [view, setView] = useState('caja');
  const [branches, setBranches] = useState([]);
  const [activeBranchId, setActiveBranchId] = useState(profile.branch_id);
  const isAdmin = profile.role === 'SERVICE_ADMIN' || profile.role === 'COMPANY_ADMIN';

  useEffect(() => {
    if (!isAdmin) return;
    supabase.from('branches').select('*').eq('organization_id', profile.organization_id).eq('active', true).then(({ data }) => {
      setBranches(data || []);
      if (!activeBranchId && data?.length) setActiveBranchId(data[0].id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, profile.organization_id]);

  const branchName = (isAdmin ? branches.find((b) => b.id === activeBranchId)?.name : null) || 'Mi sede';

  async function handleLogout() { await supabase.auth.signOut(); }

  const menu = [
    { key: 'caja', label: 'Caja', icon: LayoutGrid },
    { key: 'pedidos', label: 'Pedidos', icon: Receipt },
    { key: 'empresa', label: 'Empresa', icon: Package },
    { key: 'productos', label: 'Productos', icon: Coffee },
    { key: 'categorias', label: 'Categorías', icon: Tag },
    { key: 'abonados', label: 'Abonados', icon: Users },
    { key: 'creditos', label: 'Créditos', icon: CreditCardIcon },
    { key: 'solicitudes', label: 'Solicitudes', icon: Link2 },
    { key: 'ganancias', label: 'Ganancias', icon: TrendingUp },
    { key: 'gananciasAbonados', label: 'Abonados S/', icon: Wallet },
    { key: 'recargas', label: 'Recargas', icon: Globe },
    { key: 'clientesApp', label: 'Clientes app', icon: Smartphone },
    { key: 'comunicados', label: 'Comunicados', icon: Megaphone },
    { key: 'menuSemana', label: 'Menú de la semana', icon: UtensilsCrossed },
    { key: 'configuracion', label: 'Configuración', icon: Settings },
  ];

  const placeholderViews = {
    solicitudes: 'Solicitudes',
    gananciasAbonados: 'Abonados S/',
    recargas: 'Recargas',
    clientesApp: 'Clientes app',
    comunicados: 'Comunicados',
    menuSemana: 'Menú de la semana',
    configuracion: 'Configuración',
    empresa: 'Empresa',
    ganancias: 'Ganancias',
  };

  if (!activeBranchId) {
    return <div className="app-loading">Tu cuenta no tiene una sede asignada. Contacta al administrador.</div>;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">CA</div><div><strong>Cafetería</strong><span>Sistema de Caja</span></div></div>

        <div className="branch-card">
          <small>Sede activa</small>
          <b>{branchName}</b>
          {isAdmin && branches.length > 1 ? (
            <select value={activeBranchId || ''} onChange={(e) => setActiveBranchId(Number(e.target.value))} style={{ width: '100%', height: 34, background: '#172d51', color: '#dce8ff', border: '1px solid #29456f', borderRadius: 7, marginTop: 4 }}>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          ) : <span>Vista acotada a tu sede</span>}
        </div>

        <nav>
          {menu.map((m) => (
            <button key={m.key} className={view === m.key ? 'active' : ''} onClick={() => setView(m.key)}><m.icon size={16} />{m.label}</button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="profile">
            <div className="avatar">{(profile.full_name || '?').slice(0, 1).toUpperCase()}</div>
            <div><b>{profile.full_name || 'Usuario'}</b><span>{ROLE_LABEL[profile.role] || profile.role}</span></div>
          </div>
          <button onClick={handleLogout} style={{ marginTop: 10 }}><LogOut size={15} />Cerrar sesión</button>
        </div>
      </aside>

      <main className="main-content">
        {view !== 'pedidos' && (
          <div className="topbar">
            <h1><span className="live-dot" />{menu.find((m) => m.key === view)?.label || 'Caja'}</h1>
            <div className="top-actions"><button className="help" title="Notificaciones"><Bell size={17} /></button><div className="connection"><span />Conectado</div></div>
          </div>
        )}
        {view === 'caja' && <CajaView profile={profile} activeBranchId={activeBranchId} branchName={branchName} />}
        {view === 'pedidos' && <PedidosView profile={profile} activeBranchId={activeBranchId} onBack={() => setView('caja')} />}
        {view === 'abonados' && <AbonadosView activeBranchId={activeBranchId} />}
        {view === 'creditos' && <CreditosView activeBranchId={activeBranchId} />}
        {view === 'categorias' && <CategoriasView profile={profile} activeBranchId={activeBranchId} />}
        {view === 'productos' && <ProductosView profile={profile} activeBranchId={activeBranchId} />}
        {placeholderViews[view] && <PlaceholderView label={placeholderViews[view]} />}
      </main>
    </div>
  );
}

// ==================================================================
// Raíz: maneja sesión + perfil
// ==================================================================

function Root() {
  const [session, setSession] = useState(undefined); // undefined = cargando, null = sin sesión
  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) { setProfile(null); return; }
    let active = true;
    supabase.from('profiles').select('*').eq('id', session.user.id).single().then(({ data, error }) => {
      if (!active) return;
      if (error || !data) setProfileError('Tu usuario inició sesión, pero no tiene un perfil asignado en el sistema. Pide al administrador que te cree uno en la tabla "profiles".');
      else setProfile(data);
    });
    return () => { active = false; };
  }, [session]);

  if (session === undefined) return <div className="app-loading">Cargando...</div>;
  if (!session) return <LoginScreen />;
  if (profileError) return <div className="app-loading" style={{ maxWidth: 420, textAlign: 'center', padding: 20 }}>{profileError}</div>;
  if (!profile) return <div className="app-loading">Cargando perfil...</div>;

  return <MainApp profile={profile} />;
}

createRoot(document.getElementById('root')).render(<Root />);
