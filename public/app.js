// ==========================================
//  校园经济平台 - 学生端  v4.0
//  去掉了管理面板 · 订单按用户名隔离
// ==========================================

var API = '/api';
var currentPage = 'home';
var cart = [];
var products = [];
var serverInfo = { lanIP: '...', lanURL: '', publicURL: '', port: 3000 };

// ========== 工具函数 ==========
function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }

function loadCart() {
  try { cart = JSON.parse(localStorage.getItem('campus_cart') || '[]'); } catch(e) { cart = []; }
}
function saveCart() {
  localStorage.setItem('campus_cart', JSON.stringify(cart));
  updateCartBadge();
}
function updateCartBadge() {
  var b = $('#cart-badge');
  if (b) b.textContent = cart.reduce(function(s, i) { return s + i.quantity; }, 0);
}

function showToast(msg, type) {
  type = type || 'success';
  var toast = $('#toast');
  toast.textContent = msg;
  toast.className = 'toast ' + type + ' show';
  clearTimeout(toast._tid);
  toast._tid = setTimeout(function() { toast.classList.remove('show'); }, 2800);
}

function escapeHtml(str) {
  if (str == null) return '';
  var div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

function escapeAttr(str) {
  if (str == null) return '';
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&#39;');
}

function debounce(fn, delay) {
  var timer;
  return function() {
    var ctx = this, args = arguments;
    clearTimeout(timer);
    timer = setTimeout(function() { fn.apply(ctx, args); }, delay);
  };
}

function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function() { showToast('链接已复制！'); });
  } else {
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.left = '-9999px';
    document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
    showToast('链接已复制！');
  }
}

// ========== 页面路由 ==========
function navigate(page) {
  currentPage = page;
  $$('.nav-btn').forEach(function(b) { b.classList.toggle('active', b.dataset.page === page); });
  var root = $('#app-root');
  root.innerHTML = '';
  switch (page) {
    case 'home': renderHome(root); break;
    case 'cart': renderCart(root); break;
    case 'orders': renderOrders(root); break;
  }
}

// ========== 首页 ==========
function renderHome(root) {
  var shareURL = 'https://optimistic-curiosity-production-5452.up.railway.app';
  root.innerHTML =
    '<div class="hero">' +
      '<h1>校园经济平台</h1>' +
      '<p>发现身边的校园服务 · 下单方便 · 同学互助</p>' +
    '</div>' +

    '<div class="toolbar">' +
      '<input class="search-box" id="search-input" placeholder="搜索商品、服务、卖家..." />' +
      '<select class="filter-select" id="category-filter">' +
        '<option value="">全部分类</option>' +
        '<option value="生活服务">生活服务</option>' +
        '<option value="技术服务">技术服务</option>' +
        '<option value="学习资料">学习资料</option>' +
        '<option value="兴趣培训">兴趣培训</option>' +
        '<option value="闲置交易">闲置交易</option>' +
      '</select>' +
      '<select class="filter-select" id="sort-filter">' +
        '<option value="">默认排序</option>' +
        '<option value="hot">热门优先</option>' +
        '<option value="price-asc">价格从低到高</option>' +
        '<option value="price-desc">价格从高到低</option>' +
      '</select>' +
    '</div>' +
    '<div class="product-grid" id="product-grid"></div>' +

    '<div class="share-section share-section-bottom">' +
      '<div class="share-left">' +
        '<div class="share-title">📱 扫码分享给同学</div>' +
        '<div class="share-url-row">' +
          '<code id="share-url-text">' + shareURL + '</code>' +
          '<button class="btn-copy" onclick="copyText(document.getElementById(\'share-url-text\').textContent)">复制链接</button>' +
        '</div>' +
      '</div>' +
      '<div class="share-right">' +
        '<div class="qr-box" id="qr-box">' +
          '<div class="qr-loading">二维码加载中...</div>' +
        '</div>' +
        '<p class="qr-label">扫一扫直接逛</p>' +
      '</div>' +
    '</div>';

  loadQRCode(shareURL);
  loadProducts();
  $('#search-input').addEventListener('input', debounce(loadProducts, 300));
  $('#category-filter').addEventListener('change', loadProducts);
  $('#sort-filter').addEventListener('change', loadProducts);
}

function loadQRCode(url) {
  fetch(API + '/qrcode?url=' + encodeURIComponent(url))
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.ok) { $('#qr-box').innerHTML = '<img src="' + data.qr + '" alt="扫码访问" class="qr-img" />'; }
    })
    .catch(function() {
      $('#qr-box').innerHTML = '<img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(url) + '" alt="扫码访问" class="qr-img" />';
    });
}

// ========== 商品列表 ==========
function loadProducts() {
  var search = ($('#search-input') && $('#search-input').value) || '';
  var category = ($('#category-filter') && $('#category-filter').value) || '';
  var sort = ($('#sort-filter') && $('#sort-filter').value) || '';
  var params = new URLSearchParams();
  if (category) params.set('category', category);
  if (search) params.set('search', search);
  if (sort) params.set('sort', sort);

  fetch(API + '/products?' + params.toString())
    .then(function(r) { return r.json(); })
    .then(function(data) { products = data; renderProductGrid(products); })
    .catch(function() { showToast('加载失败，请确认服务器已启动', 'error'); });
}

function renderProductGrid(items) {
  var grid = $('#product-grid');
  if (!grid) return;
  if (!items.length) {
    grid.innerHTML = '<p style="text-align:center;color:#6b7280;padding:40px;">没有找到匹配的商品</p>';
    return;
  }
  grid.innerHTML = items.map(function(p) { return '' +
    '<div class="product-card" data-id="' + p.id + '">' +
      '<div class="product-icon">' + escapeHtml(p.image || '📦') + '</div>' +
      '<span class="product-category">' + escapeHtml(p.category) + '</span>' +
      '<div class="product-name">' + escapeHtml(p.name) + (p.hot ? ' <span class="product-hot">HOT</span>' : '') + '</div>' +
      '<div class="product-desc">' + escapeHtml((p.description || '').slice(0, 55)) + '...</div>' +
      '<div class="product-meta">' +
        '<div><span class="product-price">¥' + p.price.toFixed(2) + ' <small>/' + escapeHtml(p.unit) + '</small></span></div>' +
        '<span class="product-seller">' + escapeHtml(p.seller) + '</span>' +
      '</div>' +
    '</div>';
  }).join('');

  grid.querySelectorAll('.product-card').forEach(function(card) {
    card.addEventListener('click', function() { showProductDetail(parseInt(card.dataset.id)); });
  });
}

function showProductDetail(productId) {
  var product = products.find(function(p) { return p.id === productId; });
  if (!product) return;

  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML =
    '<div class="modal">' +
      '<button class="modal-close">✕</button>' +
      '<div class="modal-icon">' + escapeHtml(product.image || '📦') + '</div>' +
      '<h2>' + escapeHtml(product.name) + '</h2>' +
      '<span class="product-category">' + escapeHtml(product.category) + '</span>' +
      '<p class="modal-desc">' + escapeHtml(product.description) + '</p>' +
      '<div class="modal-info">' +
        '<p><strong>卖家：</strong>' + escapeHtml(product.seller) + '</p>' +
        '<p><strong>联系方式：</strong>' + escapeHtml(product.contact) + '</p>' +
        '<p><strong>剩余：</strong>' + product.stock + ' ' + escapeHtml(product.unit) + '</p>' +
      '</div>' +
      '<div class="modal-price">¥' + product.price.toFixed(2) + ' <small>/' + escapeHtml(product.unit) + '</small></div>' +
      '<div class="quantity-row"><label>数量：</label><input type="number" id="detail-qty" value="1" min="1" max="' + product.stock + '" /></div>' +
      '<button class="btn btn-primary btn-block" id="detail-add-cart">加入购物车</button>' +
    '</div>';

  document.body.appendChild(overlay);
  overlay.querySelector('.modal-close').addEventListener('click', function() { overlay.remove(); });
  overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('#detail-add-cart').addEventListener('click', function() {
    var qty = parseInt(overlay.querySelector('#detail-qty').value) || 1;
    addToCart(product, qty); overlay.remove();
    showToast('已添加 ' + product.name + ' ×' + qty + ' 到购物车');
  });
}

// ========== 购物车 ==========
function addToCart(product, qty) {
  qty = qty || 1;
  var existing = cart.find(function(i) { return i.productId === product.id; });
  if (existing) { existing.quantity = Math.min(existing.quantity + qty, product.stock); }
  else {
    cart.push({
      productId: product.id, image: product.image, name: product.name,
      price: product.price, unit: product.unit, stock: product.stock,
      seller: product.seller, quantity: Math.min(qty, product.stock)
    });
  }
  saveCart();
}

function updateCartQty(productId, delta) {
  var item = cart.find(function(i) { return i.productId === productId; });
  if (!item) return;
  item.quantity += delta;
  if (item.quantity <= 0) { cart = cart.filter(function(i) { return i.productId !== productId; }); }
  else { item.quantity = Math.min(item.quantity, item.stock); }
  saveCart();
  navigate('cart');
}

function renderCart(root) {
  root.innerHTML = '<div class="section-title">购物车</div><div id="cart-content"></div>';
  renderCartContent();
}

function renderCartContent() {
  var container = $('#cart-content');
  if (!container) return;

  if (!cart.length) {
    container.innerHTML =
      '<div class="cart-empty"><div class="cart-empty-icon">🛒</div><p>购物车是空的，去逛逛吧~</p>' +
      '<button class="btn btn-primary" style="margin-top:12px;" onclick="navigate(\'home\')">去逛商品大厅</button></div>';
    return;
  }

  var total = cart.reduce(function(s, i) { return s + i.price * i.quantity; }, 0);

  container.innerHTML =
    '<div class="cart-list">' +
      cart.map(function(i) { return '' +
        '<div class="cart-item">' +
          '<div class="cart-item-icon">' + escapeHtml(i.image || '📦') + '</div>' +
          '<div class="cart-item-info"><div class="cart-item-name">' + escapeHtml(i.name) + '</div><div class="cart-item-meta">' + escapeHtml(i.seller) + ' · 库存 ' + i.stock + ' ' + escapeHtml(i.unit) + '</div></div>' +
          '<div class="cart-item-qty">' +
            '<button onclick="updateCartQty(' + i.productId + ',-1)">−</button>' +
            '<span>' + i.quantity + '</span>' +
            '<button onclick="updateCartQty(' + i.productId + ',1)">+</button>' +
          '</div>' +
          '<div class="cart-item-price">¥' + (i.price * i.quantity).toFixed(2) + '</div>' +
          '<button class="btn btn-danger btn-sm" onclick="updateCartQty(' + i.productId + ',-999)">删除</button>' +
        '</div>';
      }).join('') +
    '</div>' +
    '<div class="cart-summary">' +
      '<div class="cart-total">合计：¥' + total.toFixed(2) + '</div>' +
      '<div class="form-group"><label>你的名字</label><input type="text" id="buyer-name" placeholder="输入你的真实姓名" /></div>' +
      '<div class="form-group"><label>联系方式（选填，代课服务需填写微信号）</label><input type="text" id="buyer-contact" placeholder="微信 / QQ / 手机号" /></div>' +
      '<div class="form-group"><label>备注（选填）</label><textarea id="buyer-note" placeholder="有特殊要求可以写这里..."></textarea></div>' +
      '<button class="btn btn-primary btn-block" id="submit-order">确认下单 & 查看付款码 💰</button>' +
    '</div>';

  $('#submit-order').addEventListener('click', showPaymentModal);
}

function showPaymentModal() {
  var buyer = $('#buyer-name').value.trim();
  var contact = $('#buyer-contact').value.trim();
  var note = $('#buyer-note').value.trim();
  if (!buyer) { showToast('请填写你的名字', 'error'); return; }

  var total = cart.reduce(function(s, i) { return s + i.price * i.quantity; }, 0);
  var amountYuan = total.toFixed(2);
  var qrImgSrc = API + '/payment-qr?t=' + Date.now();
  var isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  var isWechat = /MicroMessenger/i.test(navigator.userAgent);

  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML =
    '<div class="modal payment-modal">' +
      '<button class="modal-close">✕</button>' +
      '<h2 style="text-align:center;">💰 微信扫码付款</h2>' +
      '<p style="text-align:center;color:#6b7280;margin-bottom:14px;">应付金额：<strong style="font-size:1.6rem;color:#6366f1;">¥' + amountYuan + '</strong></p>' +

      // 收款码
      '<div style="text-align:center;margin-bottom:14px;padding:12px;background:#f9fafb;border-radius:14px;">' +
        '<img src="' + qrImgSrc + '" alt="收款码" style="width:220px;height:220px;border-radius:10px;object-fit:contain;box-shadow:0 4px 20px rgba(0,0,0,.1);" id="payment-qr-img" />' +
        '<p style="font-size:.75rem;color:#9ca3af;margin-top:8px;">' +
          (isWechat ?
            '长按上方收款码 → 识别图中二维码' :
            (isMobile ?
              '截图 → 打开微信扫一扫 → 右上角相册识别' :
              '打开手机微信 → 扫一扫'
            )
          ) +
        '</p>' +
      '</div>' +

      // 金额 + 复制
      '<div style="margin-bottom:10px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:10px;text-align:center;">' +
        '<p style="font-size:.82rem;color:#065f46;margin-bottom:4px;"><strong>📋 应付金额：¥' + amountYuan + '</strong></p>' +
        '<p style="font-size:.72rem;color:#047857;">金额已自动复制，扫码后直接粘贴付款</p>' +
        (isWechat ? '' : '<button class="btn btn-outline btn-sm" id="btn-copy-amount" style="font-size:.78rem;margin-top:4px;">📋 点击复制 ¥' + amountYuan + '</button>') +
      '</div>' +

      // ===== 付款截图上传（核心验证） =====
      '<div style="background:#fff7ed;border:2px dashed #fbbf24;border-radius:12px;padding:14px;margin-bottom:10px;text-align:center;" id="proof-upload-area">' +
        '<p style="font-weight:700;font-size:.85rem;margin-bottom:6px;">📸 上传付款截图（必填）</p>' +
        '<p style="font-size:.72rem;color:#6b7280;margin-bottom:8px;">付款成功后截图微信支付成功页面，上传作为付款凭证</p>' +
        '<input type="file" id="proof-file-input" accept="image/*" style="display:none;" />' +
        '<button class="btn btn-sm btn-outline" id="btn-select-proof" style="font-size:.78rem;">📁 选择付款截图</button>' +
        '<span style="display:none;font-size:.75rem;color:#059669;margin-left:8px;" id="proof-selected-label">✅ 截图已选择</span>' +
        '<div id="proof-preview" style="margin-top:8px;display:none;"></div>' +
      '</div>' +

      '<div class="form-group"><label>付款备注（选填，方便核对）</label><input type="text" id="pay-note" placeholder="如：微信昵称" /></div>' +
      '<button class="btn btn-success btn-block" id="confirm-payment">✅ 我已付款，提交订单</button>' +
      '<p style="text-align:center;color:#9ca3af;font-size:.72rem;margin-top:8px;">上传截图后提交，卖家核对后将确认订单</p>' +
    '</div>';

  document.body.appendChild(overlay);

  // 自动复制金额
  function copyAmount() {
    try {
      var ta = document.createElement('textarea');
      ta.value = amountYuan; ta.style.position = 'fixed'; ta.style.left = '-9999px';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
      showToast('已复制：¥' + amountYuan);
    } catch(e) {}
  }
  copyAmount();

  var btnCopyAmount = overlay.querySelector('#btn-copy-amount');
  if (btnCopyAmount) btnCopyAmount.addEventListener('click', copyAmount);

  // 付款截图选择
  var proofFile = null;
  overlay.querySelector('#btn-select-proof').addEventListener('click', function() {
    overlay.querySelector('#proof-file-input').click();
  });
  overlay.querySelector('#proof-file-input').addEventListener('change', function() {
    var file = this.files[0];
    if (!file) return;
    proofFile = file;
    overlay.querySelector('#proof-selected-label').style.display = 'inline';

    // 预览
    var preview = overlay.querySelector('#proof-preview');
    preview.style.display = 'block';
    var reader = new FileReader();
    reader.onload = function(e) {
      preview.innerHTML = '<img src="' + e.target.result + '" style="max-width:200px;max-height:120px;border-radius:8px;margin-top:6px;" />' +
        '<p style="font-size:.7rem;color:#059669;">' + file.name + '</p>';
    };
    reader.readAsDataURL(file);
  });

  // 点击收款码放大
  overlay.querySelector('#payment-qr-img').addEventListener('click', function() {
    var bigOverlay = document.createElement('div');
    bigOverlay.className = 'modal-overlay';
    bigOverlay.style.zIndex = '300';
    bigOverlay.innerHTML =
      '<div style="text-align:center;padding:20px;">' +
        '<img src="' + qrImgSrc + '" style="width:300px;height:300px;border-radius:16px;object-fit:contain;box-shadow:0 8px 40px rgba(0,0,0,.3);" />' +
        '<p style="color:#fff;margin-top:16px;font-weight:700;font-size:1.2rem;">长按识别 → 微信支付 ¥' + amountYuan + '</p>' +
        '<p style="color:#d1d5db;margin-top:6px;font-size:.85rem;">点击空白处关闭</p>' +
      '</div>';
    document.body.appendChild(bigOverlay);
    bigOverlay.addEventListener('click', function() { bigOverlay.remove(); });
  });

  overlay.querySelector('.modal-close').addEventListener('click', function() { overlay.remove(); });
  overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });

  // 提交订单（先创建订单，再上传截图）
  overlay.querySelector('#confirm-payment').addEventListener('click', function() {
    if (!proofFile) { showToast('请先上传付款截图', 'error'); return; }

    var payNote = overlay.querySelector('#pay-note').value.trim();
    var fullNote = note;
    if (payNote) fullNote = fullNote ? fullNote + ' | 付款名: ' + payNote : '付款名: ' + payNote;

    // 先创建订单
    submitOrderDirect(buyer, contact, fullNote, proofFile, overlay);
  });
}

function submitOrderDirect(buyer, contact, note, proofFile, overlay) {
  var items = cart.map(function(i) { return { productId: i.productId, quantity: i.quantity }; });

  fetch(API + '/orders', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: items, buyer: buyer, contact: contact, note: note })
  })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.success) {
        localStorage.setItem('campus_buyer_name', buyer);
        localStorage.setItem('campus_buyer_contact', contact);
        cart = []; saveCart();

        // 如果有付款截图，上传截图
        if (proofFile) {
          uploadPaymentProof(data.order.id, proofFile, function() {
            showToast('下单成功！付款截图已上传，卖家核对后将确认订单');
            navigate('orders');
          });
        } else {
          showToast('下单成功！卖家将通过你留下的联系方式联系你');
          navigate('orders');
        }
      } else { showToast(data.error || '下单失败', 'error'); }
    })
    .catch(function() { showToast('网络错误，请确认服务器已启动', 'error'); });
}

function uploadPaymentProof(orderId, file, callback) {
  var formData = new FormData();
  formData.append('proof', file);

  var xhr = new XMLHttpRequest();
  xhr.open('POST', API + '/payment-proof/' + orderId);
  xhr.onload = function() {
    try {
      var data = JSON.parse(xhr.responseText);
      if (xhr.status === 200 && data.ok) {
        if (callback) callback();
      } else {
        showToast('付款截图上传失败：' + (data.error || '未知错误'), 'error');
        if (callback) callback();
      }
    } catch(e) {
      if (callback) callback();
    }
  };
  xhr.onerror = function() {
    showToast('截图上传失败，请稍后在管理后台上传', 'error');
    if (callback) callback();
  };
  xhr.send(formData);
}

// ========== 订单页（每人只看自己的） ==========
function renderOrders(root) {
  root.innerHTML =
    '<div class="section-title">我的订单</div>' +
    '<div style="margin-bottom:16px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;">' +
      '<input type="text" id="orders-name-filter" placeholder="输入你的名字查询订单" style="flex:1;min-width:160px;padding:10px 14px;border:2px solid #e5e7eb;border-radius:10px;font-size:.9rem;font-family:inherit;outline:none;" />' +
      '<button class="btn btn-primary btn-sm" id="orders-search-btn">查询</button>' +
      '<button class="btn btn-outline btn-sm" id="orders-clear-btn">清除</button>' +
    '</div>' +
    '<div id="orders-content"></div>';

  // 自动填入上次下单的名字
  var savedName = localStorage.getItem('campus_buyer_name') || '';
  if (savedName) { $('#orders-name-filter').value = savedName; }

  // 绑定查询
  $('#orders-search-btn').addEventListener('click', doSearchOrders);
  $('#orders-clear-btn').addEventListener('click', function() {
    $('#orders-name-filter').value = '';
    $('#orders-content').innerHTML = '<p style="color:#6b7280;text-align:center;padding:40px;">输入你的名字查看订单</p>';
  });

  // 回车查询
  $('#orders-name-filter').addEventListener('keydown', function(e) { if (e.key === 'Enter') doSearchOrders(); });

  // 如果有保存的名字，自动查询
  if (savedName) {
    $('#orders-content').innerHTML = '<p style="color:#6b7280;text-align:center;padding:40px;">正在查询...</p>';
    doSearchOrders();
  } else {
    $('#orders-content').innerHTML = '<p style="color:#6b7280;text-align:center;padding:40px;">输入你的名字查看你的订单</p>';
  }
}

function doSearchOrders() {
  var name = ($('#orders-name-filter') && $('#orders-name-filter').value.trim()) || '';
  if (!name) { showToast('请输入你的名字', 'error'); return; }
  localStorage.setItem('campus_buyer_name', name);

  fetch(API + '/orders')
    .then(function(r) { return r.json(); })
    .then(function(orders) {
      // 筛选出跟这个名字匹配的订单（大小写不敏感）
      var myOrders = orders.filter(function(o) {
        return o.buyer.toLowerCase().includes(name.toLowerCase()) ||
               name.toLowerCase().includes(o.buyer.toLowerCase());
      });

      var container = $('#orders-content');
      if (!container) return;

      if (!myOrders.length) {
        container.innerHTML = '<div class="cart-empty"><div class="cart-empty-icon">📋</div><p>没有找到「' + escapeHtml(name) + '」的订单</p><p style="font-size:.8rem;color:#9ca3af;">请检查名字是否正确（与你下单时填的一致）</p></div>';
        return;
      }

      var labels = { pending: '待处理', confirmed: '已确认', done: '已完成' };
      container.innerHTML = '<div class="order-list">' + myOrders.reverse().map(function(o) { return '' +
        '<div class="order-card">' +
          '<div class="order-header"><span class="order-id">#' + o.id + '</span><span class="order-status ' + o.status + '">' + (labels[o.status] || o.status) + '</span></div>' +
          '<div class="order-items">' + (o.items || []).map(function(i) { return escapeHtml(i.name) + ' ×' + i.quantity + ' (¥' + (i.price || 0).toFixed(2) + ')'; }).join('、') + '</div>' +
          '<div class="order-total">¥' + o.total.toFixed(2) + '</div>' +
          '<div class="order-time">' + escapeHtml(o.buyer) + ' · ' + escapeHtml(o.contact) + ' · ' + new Date(o.createdAt).toLocaleString('zh-CN') + '</div>' +
          (o.note ? '<div class="order-time" style="margin-top:4px;">📝 ' + escapeHtml(o.note) + '</div>' : '') +
        '</div>';
      }).join('') + '</div>';
    })
    .catch(function() { showToast('加载订单失败', 'error'); });
}

// ========== 初始化 ==========
function init() {
  fetch(API + '/status')
    .then(function(r) { return r.json(); })
    .then(function(data) { serverInfo = data; })
    .catch(function() {})
    .finally(function() { navigate('home'); });

  $$('.nav-btn').forEach(function(btn) {
    btn.addEventListener('click', function() { navigate(btn.dataset.page); });
  });
  $('.logo').addEventListener('click', function(e) { e.preventDefault(); navigate('home'); });

  loadCart();
  updateCartBadge();
}

document.addEventListener('DOMContentLoaded', init);