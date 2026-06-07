const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const QRCode = require('qrcode');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_URL = process.env.PUBLIC_URL || 'https://campus-market.serveousercontent.com';

// 管理密码（可通过环境变量 ADMIN_PASS 覆盖）
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin888';

// ========== 自动获取本机局域网 IP ==========
function getLanIP() {
  const nets = os.networkInterfaces();
  const priorityNames = ['WLAN', 'Wi-Fi', '无线网络', '以太网', 'Ethernet'];
  const candidates = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        candidates.push({ address: net.address, ifName: name });
      }
    }
  }
  for (const pn of priorityNames) {
    const hit = candidates.find(c => c.ifName.toLowerCase().includes(pn.toLowerCase()));
    if (hit) return hit.address;
  }
  const noVPN = candidates.filter(c =>
    !c.ifName.toLowerCase().includes('vpn') && !c.ifName.toLowerCase().includes('vethernet')
  );
  if (noVPN.length) return noVPN[0].address;
  return candidates[0]?.address || '127.0.0.1';
}

const LAN_IP = getLanIP();
const LAN_URL = `http://${LAN_IP}:${PORT}`;

// ========== Middleware ==========
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ========== 管理权限验证中间件 ==========
function adminAuth(req, res, next) {
  const pass = req.headers['x-admin-pass'] || req.query.pass || '';
  if (pass === ADMIN_PASS) return next();
  res.status(401).json({ error: '管理密码错误，请在管理页面右上角设置密码' });
}

// ========== 文件上传配置 (multer) ==========
const storage = multer.diskStorage({
  destination: path.join(__dirname, 'public'),
  filename: function(req, file, cb) {
    // 固定保存为 payment-qr，保留原始扩展名
    var ext = path.extname(file.originalname) || '.png';
    cb(null, 'payment-qr' + ext);
  }
});
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: function(req, file, cb) {
    var allowed = /\.(png|jpg|jpeg|gif|bmp|svg|webp)$/i;
    if (allowed.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error('仅支持图片格式：png/jpg/jpeg/gif/bmp/svg/webp'));
    }
  }
});

// ========== 数据文件路径 ==========
const DATA_DIR = path.join(__dirname, 'data');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const SELLERS_FILE = path.join(DATA_DIR, 'sellers.json');
const PAYMENT_QR_FILE = path.join(__dirname, 'public', 'payment-qr.png');
const PROOFS_DIR = path.join(DATA_DIR, 'payment-proofs');
const SELLER_QR_DIR = path.join(DATA_DIR, 'seller-qr');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(PROOFS_DIR)) fs.mkdirSync(PROOFS_DIR);
if (!fs.existsSync(SELLER_QR_DIR)) fs.mkdirSync(SELLER_QR_DIR, { recursive: true });

// ========== 数据读写 ==========
function readJSON(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf-8')); } catch { return null; }
}
function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

let cachedSellers = null;
function readSellers() {
  if (cachedSellers) return cachedSellers;
  cachedSellers = readJSON(SELLERS_FILE) || [];
  return cachedSellers;
}
function writeSellers(data) { cachedSellers = data; writeJSON(SELLERS_FILE, data); }

// 商家收款码上传
const sellerQRStorage = multer.diskStorage({
  destination: SELLER_QR_DIR,
  filename: function(req, file, cb) {
    var sellerId = req.params.sellerId || 'unknown';
    var ext = path.extname(file.originalname) || '.png';
    cb(null, 'seller-' + sellerId + '-' + Date.now() + ext);
  }
});
const sellerQRUpload = multer({ storage: sellerQRStorage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: function(req, file, cb) { var ext = path.extname(file.originalname).toLowerCase(); if (/\.(png|jpg|jpeg|gif|webp)$/.test(ext)) cb(null, true); else cb(new Error('仅支持图片')); } });
function initData() {
  // 初始化示例商家（sellerId=0 为"平台管理员"，旧商品兼容）
  if (!readJSON(SELLERS_FILE)) {
    writeJSON(SELLERS_FILE, []);
  }

  if (!readJSON(PRODUCTS_FILE)) {
    const defaultProducts = [
      { id: 1, sellerId: 0, name: '校园约拍服务', category: '生活服务', price: 29.9, unit: '次', description: '专业相机 + 学校场景精修9张图，送调色预设。约1小时随拍，适合个人写真、毕业照、情侣照。', image: '📸', seller: '摄影社·小明', contact: 'WeChat: xiaoming_photo', stock: 10, hot: true, qrDataUrl: '', createdAt: new Date().toISOString() },
      { id: 2, sellerId: 0, name: '电脑维修 & 清灰', category: '技术服务', price: 19.9, unit: '台', description: '笔记本清灰、换硅脂、重装系统、C盘清理加速。上门取送，当天完成。', image: '💻', seller: '计算机协会·阿杰', contact: 'WeChat: ajie_pc', stock: 20, hot: true, qrDataUrl: '', createdAt: new Date().toISOString() },
      { id: 3, sellerId: 0, name: '期末复习资料包', category: '学习资料', price: 9.9, unit: '套', description: '高数、大物、线代期末复习笔记 + 历年真题 + 老师划重点整理。电子版，下单秒发。', image: '📚', seller: '学霸·小李', contact: 'QQ: 12345678', stock: 999, hot: true, qrDataUrl: '', createdAt: new Date().toISOString() },
      { id: 4, sellerId: 0, name: '食堂代跑腿', category: '生活服务', price: 3.0, unit: '单', description: '帮你带饭到宿舍楼下，指定食堂+窗口。中午12:00 / 下午5:30两批统一配送。', image: '🍱', seller: '勤工俭学·小张', contact: 'WeChat: zhang_runner', stock: 50, hot: false, qrDataUrl: '', createdAt: new Date().toISOString() },
      { id: 5, sellerId: 0, name: '理发造型上门', category: '生活服务', price: 25.0, unit: '次', description: '在校理发师，男生短发修剪，可到宿舍服务。工具齐全，风格可沟通。', image: '✂️', seller: '美发社·Tony', contact: 'WeChat: tony_school', stock: 30, hot: false, qrDataUrl: '', createdAt: new Date().toISOString() },
      { id: 6, sellerId: 0, name: '校园跑腿代办', category: '生活服务', price: 5.0, unit: '单', description: '取快递、打印文件、交材料、图书馆占座提醒…校内30分钟内响应。', image: '🏃', seller: '跑腿小队·小刘', contact: 'WeChat: liu_runner', stock: 100, hot: false, qrDataUrl: '', createdAt: new Date().toISOString() },
      { id: 7, sellerId: 0, name: '简历精修服务', category: '学习资料', price: 15.0, unit: '份', description: 'HR学姐亲自修改简历，优化排版和话术，附赠面试常见问题清单。适合实习/校招。', image: '🎓', seller: '职协·学姐小周', contact: 'WeChat: zhou_hr', stock: 15, hot: false, qrDataUrl: '', createdAt: new Date().toISOString() },
      { id: 8, sellerId: 0, name: '吉他/尤克里里教学', category: '兴趣培训', price: 39.9, unit: '课时', description: '零基础入门，45分钟/课时，一对一教学。可借练习琴，学完能弹唱3-5首歌。', image: '🎸', seller: '音乐社·阿豪', contact: 'WeChat: hao_music', stock: 8, hot: true, qrDataUrl: '', createdAt: new Date().toISOString() },
      { id: 9, sellerId: 0, name: '宿舍深度清洁', category: '生活服务', price: 35.0, unit: '次', description: '全宿舍清洁+垃圾打包+物品归纳。2小时内搞定，提供清洁工具。4人间以下不加价。', image: '🧹', seller: '清洁达人·小王', contact: 'WeChat: wang_clean', stock: 5, hot: false, qrDataUrl: '', createdAt: new Date().toISOString() },
      { id: 10, sellerId: 0, name: '二手教材回收转卖', category: '闲置交易', price: 12.0, unit: '本', description: '回收各专业旧教材，低价转卖给学弟学妹。比学校书店便宜60%+，成色好可用。', image: '📦', seller: '书店·老刘', contact: 'WeChat: laoliu_book', stock: 200, hot: false, qrDataUrl: '', createdAt: new Date().toISOString() }
    ];
    writeJSON(PRODUCTS_FILE, defaultProducts);
  }
  if (!readJSON(ORDERS_FILE)) { writeJSON(ORDERS_FILE, []); }
}

// ========== 公开 API ==========
app.get('/api/status', (req, res) => {
  const products = readJSON(PRODUCTS_FILE) || [];
  const orders = readJSON(ORDERS_FILE) || [];
  res.json({ ok: true, lanIP: LAN_IP, lanURL: LAN_URL, publicURL: PUBLIC_URL, port: PORT, productCount: products.length, orderCount: orders.length });
});

app.get('/api/qrcode', async (req, res) => {
  const targetURL = req.query.url || PUBLIC_URL || LAN_URL;
  try {
    const qrDataURL = await QRCode.toDataURL(targetURL, { width: 400, margin: 2, color: { dark: '#1a1a2e', light: '#ffffff' } });
    res.json({ ok: true, url: targetURL, qr: qrDataURL });
  } catch (e) { res.status(500).json({ error: 'QR 生成失败' }); }
});

function enrichProducts(products) {
  var sellers = readSellers();
  return products.map(function(p) {
    var seller = sellers.find(function(s) { return s.id === p.sellerId; });
    return Object.assign({}, p, {
      seller: seller ? seller.shopName : (p.seller || '未知商家'),
      contact: p.contact || (seller ? seller.phone : '')
    });
  });
}

app.get('/api/products', (req, res) => {
  const products = readJSON(PRODUCTS_FILE) || [];
  const { category, search, sort } = req.query;
  let result = enrichProducts(products);
  if (category && category !== '全部') result = result.filter(p => p.category === category);
  if (search) {
    var q = search.toLowerCase();
    result = result.filter(function(p) { return p.name.toLowerCase().includes(q) || (p.description||'').toLowerCase().includes(q) || (p.seller||'').toLowerCase().includes(q); });
  }
  if (sort === 'price-asc') result.sort(function(a, b) { return a.price - b.price; });
  else if (sort === 'price-desc') result.sort(function(a, b) { return b.price - a.price; });
  else if (sort === 'hot') result.sort(function(a, b) { return (b.hot ? 1 : 0) - (a.hot ? 1 : 0); });
  res.json(result);
});

app.get('/api/products/:id', (req, res) => {
  const products = readJSON(PRODUCTS_FILE) || [];
  const product = products.find(p => p.id === parseInt(req.params.id));
  if (!product) return res.status(404).json({ error: '商品不存在' });
  res.json(enrichProducts([product])[0]);
});

app.post('/api/orders', (req, res) => {
  const { items, buyer, contact, note } = req.body;
  if (!items || !items.length) return res.status(400).json({ error: '购物车不能为空' });
  if (!buyer) return res.status(400).json({ error: '请填写你的姓名' });
  const products = readJSON(PRODUCTS_FILE) || [];
  const orders = readJSON(ORDERS_FILE) || [];
  let total = 0;
  const orderItems = [];
  for (const item of items) {
    const product = products.find(p => p.id === item.productId);
    if (!product) continue;
    const qty = Math.min(item.quantity || 1, product.stock);
    var sellerId = product.sellerId || 0;
    orderItems.push({ productId: product.id, name: product.name, price: product.price, quantity: qty, sellerId: sellerId, seller: product.seller || '未知商家' });
    total += product.price * qty;
    product.stock = Math.max(0, product.stock - qty);
  }
  const order = { id: Date.now(), items: orderItems, buyer, contact, note: note || '', total: Math.round(total * 100) / 100, status: 'pending', proofImage: req.body.proofImage || null, createdAt: new Date().toISOString() };
  orders.push(order);
  writeJSON(ORDERS_FILE, orders);
  writeJSON(PRODUCTS_FILE, products);
  res.json({ success: true, order });
});

app.get('/api/orders', (req, res) => {
  const orders = readJSON(ORDERS_FILE) || [];
  res.json(orders);
});

// ========== API：收款码 ==========
// 获取收款码图片
app.get('/api/payment-qr', (req, res) => {
  var qrFile = findPaymentQR();
  if (qrFile) {
    var ext = path.extname(qrFile).toLowerCase();
    var mimeMap = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.bmp': 'image/bmp', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
    res.setHeader('Content-Type', mimeMap[ext] || 'image/png');
    return res.sendFile(qrFile);
  }
  // 没有收款码时返回提示图
  res.setHeader('Content-Type', 'image/svg+xml');
  res.send('<svg xmlns="http://www.w3.org/2000/svg" width="280" height="280"><rect width="280" height="280" fill="#f9fafb" rx="12" stroke="#e5e7eb" stroke-width="2"/><text x="140" y="130" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#9ca3af">尚未上传收款码</text><text x="140" y="155" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#d1d5db">在管理后台 → 收款码设置中上传</text></svg>');
});

// 查找收款码文件（支持多种扩展名）
function findPaymentQR() {
  var exts = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg', '.webp'];
  for (var i = 0; i < exts.length; i++) {
    var p = path.join(__dirname, 'public', 'payment-qr' + exts[i]);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// 收款码是否已设
app.get('/api/payment-status', (req, res) => {
  res.json({ ready: !!findPaymentQR(), file: findPaymentQR() ? path.basename(findPaymentQR()) : null });
});

// ========== 收款码上传 (Base64) ==========
app.post('/api/admin/payment-qr', adminAuth, (req, res) => {
  var data = req.body.qrdata || '';
  if (!data) return res.status(400).json({ error: '没有数据，请在管理后台上传收款码图片' });

  // 支持 data:image/...;base64,xxx 格式
  var matches = data.match(/^data:image\/(png|jpg|jpeg|gif|webp|svg\+xml|bmp);base64,(.+)$/i);
  if (!matches) return res.status(400).json({ error: '图片格式不支持，请用管理后台上传' });

  var ext = matches[1].toLowerCase();
  if (ext === 'jpeg') ext = 'jpg';
  if (ext === 'svg+xml') ext = 'svg';
  var base64Data = matches[2];
  var buf = Buffer.from(base64Data, 'base64');

  // 删除旧收款码
  var exts = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg', '.webp'];
  exts.forEach(function(e) {
    var oldFile = path.join(__dirname, 'public', 'payment-qr' + e);
    if (fs.existsSync(oldFile)) { try { fs.unlinkSync(oldFile); } catch(err) {} }
  });

  var fileName = 'payment-qr.' + ext;
  var filePath = path.join(__dirname, 'public', fileName);
  fs.writeFileSync(filePath, buf);
  res.json({ ok: true, message: '收款码已上传', fileName: fileName });
});

// ===== 删除收款码（管理权限） =====
app.delete('/api/admin/payment-qr', adminAuth, (req, res) => {
  var qrFile = findPaymentQR();
  if (qrFile) {
    try { fs.unlinkSync(qrFile); } catch(e) {}
  }
  res.json({ ok: true, message: '收款码已删除' });
});

// ===== 付款截图上传（学生提交订单时或订单后补充） =====
app.post('/api/payment-proof/:orderId', upload.single('proof'), (req, res) => {
  var orders = readJSON(ORDERS_FILE) || [];
  var orderId = parseInt(req.params.orderId);
  var order = orders.find(function(o) { return o.id === orderId; });
  if (!order) return res.status(404).json({ error: '订单不存在' });

  if (!req.file) return res.status(400).json({ error: '请选择付款截图' });

  // 保存截图到 proofs 目录
  var ext = path.extname(req.file.originalname) || '.png';
  var proofFileName = 'proof-' + orderId + '-' + Date.now() + ext;
  var proofPath = path.join(PROOFS_DIR, proofFileName);
  fs.renameSync(req.file.path, proofPath);

  // 更新订单
  order.proofImage = '/api/proof/' + proofFileName;
  order.proofUploadedAt = new Date().toISOString();
  writeJSON(ORDERS_FILE, orders);

  res.json({ ok: true, message: '付款截图已上传，卖家将核对后确认', order: order });
});

// 获取付款截图
app.get('/api/proof/:fileName', (req, res) => {
  var f = path.join(PROOFS_DIR, req.params.fileName);
  if (!fs.existsSync(f)) return res.status(404).send('截图不存在');
  var ext = path.extname(f).toLowerCase();
  var mimeMap = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.bmp': 'image/bmp', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
  res.setHeader('Content-Type', mimeMap[ext] || 'image/png');
  res.sendFile(f);
});

// ============================================================
//  管理 API (需要密码)
// ============================================================

// 验证密码
app.post('/api/admin/login', (req, res) => {
  if (req.body.pass === ADMIN_PASS) {
    res.json({ ok: true, token: ADMIN_PASS });
  } else {
    res.status(401).json({ error: '密码错误' });
  }
});

// 新增商品
app.post('/api/admin/products', adminAuth, (req, res) => {
  const products = readJSON(PRODUCTS_FILE) || [];
  const { name, category, price, unit, description, image, seller, contact, stock, hot } = req.body;
  if (!name || !category || price == null) {
    return res.status(400).json({ error: '名称、分类、价格 必填' });
  }
  const maxId = products.reduce((m, p) => Math.max(m, p.id), 0);
  const product = {
    id: maxId + 1, name, category, price: Number(price), unit: unit || '次',
    description: description || '', image: image || '📦', seller: seller || '',
    contact: contact || '', stock: Number(stock) || 0, hot: !!hot
  };
  products.push(product);
  writeJSON(PRODUCTS_FILE, products);
  res.json({ ok: true, product });
});

// 修改商品
app.put('/api/admin/products/:id', adminAuth, (req, res) => {
  const products = readJSON(PRODUCTS_FILE) || [];
  const idx = products.findIndex(p => p.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: '商品不存在' });
  const updates = req.body;
  delete updates.id;
  Object.assign(products[idx], updates);
  if (updates.price !== undefined) products[idx].price = Number(updates.price);
  if (updates.stock !== undefined) products[idx].stock = Number(updates.stock);
  if (updates.hot !== undefined) products[idx].hot = !!updates.hot;
  writeJSON(PRODUCTS_FILE, products);
  res.json({ ok: true, product: products[idx] });
});

// 删除商品
app.delete('/api/admin/products/:id', adminAuth, (req, res) => {
  let products = readJSON(PRODUCTS_FILE) || [];
  const exists = products.find(p => p.id === parseInt(req.params.id));
  if (!exists) return res.status(404).json({ error: '商品不存在' });
  products = products.filter(p => p.id !== parseInt(req.params.id));
  writeJSON(PRODUCTS_FILE, products);
  res.json({ ok: true, deleted: exists });
});

// 修改订单状态
app.patch('/api/orders/:id', (req, res) => {
  const orders = readJSON(ORDERS_FILE) || [];
  const order = orders.find(o => o.id === parseInt(req.params.id));
  if (!order) return res.status(404).json({ error: '订单不存在' });
  if (req.body.status) order.status = req.body.status;
  if (req.body.note !== undefined) order.note = req.body.note;
  writeJSON(ORDERS_FILE, orders);
  res.json({ success: true, order });
});

// 删除订单
app.delete('/api/admin/orders/:id', adminAuth, (req, res) => {
  let orders = readJSON(ORDERS_FILE) || [];
  const exists = orders.find(o => o.id === parseInt(req.params.id));
  if (!exists) return res.status(404).json({ error: '订单不存在' });
  orders = orders.filter(o => o.id !== parseInt(req.params.id));
  writeJSON(ORDERS_FILE, orders);
  res.json({ ok: true, deleted: exists });
});

// 清空所有订单
app.delete('/api/admin/orders', adminAuth, (req, res) => {
  writeJSON(ORDERS_FILE, []);
  res.json({ ok: true });
});

// 重置所有数据
app.post('/api/admin/reset', adminAuth, (req, res) => {
  try { fs.unlinkSync(PRODUCTS_FILE); } catch {}
  try { fs.unlinkSync(ORDERS_FILE); } catch {}
  initData();
  res.json({ ok: true, message: '数据已重置' });
});

// ============================================================
//  商家 API — 注册/登录/商品/订单/收款码
// ============================================================

// 商家权限中间件
function sellerAuth(req, res, next) {
  var sellerId = parseInt(req.headers['x-seller-id']) || 0;
  var sellerPass = req.headers['x-seller-pass'] || '';
  if (!sellerId || !sellerPass) return res.status(401).json({ error: '请先登录商家中心' });
  var sellers = readSellers();
  var s = sellers.find(function(x) { return x.id === sellerId; });
  if (!s) return res.status(401).json({ error: '商家不存在' });
  if (s.password !== sellerPass) return res.status(401).json({ error: '密码错误' });
  if (s.status !== 'approved') return res.status(403).json({ error: '店铺审核中' });
  req.currentSeller = s;
  next();
}

// 商家入驻
app.post('/api/seller/register', function(req, res) {
  var body = req.body;
  var shopName = (body.shopName || '').trim();
  var realName = (body.realName || '').trim();
  var studentId = (body.studentId || '').trim();
  var phone = (body.phone || '').trim();
  var password = (body.password || '').trim();
  if (!shopName || !realName || !studentId || !phone || !password) return res.status(400).json({ error: '所有带*的字段为必填' });
  if (password.length < 6) return res.status(400).json({ error: '密码至少6位' });
  var sellers = readSellers();
  if (sellers.find(function(s) { return s.studentId === studentId || s.phone === phone; })) return res.status(400).json({ error: '该学号或手机号已注册' });
  var seller = {
    id: Date.now(), shopName: shopName, realName: realName, studentId: studentId,
    phone: phone, category: body.category || '生活服务', password: password,
    description: (body.description || '').trim(), status: 'approved',
    createdAt: new Date().toISOString(), qrDataUrl: ''
  };
  sellers.push(seller);
  writeSellers(sellers);
  res.json({ ok: true, seller: { id: seller.id, shopName: seller.shopName, realName: seller.realName, status: seller.status } });
});

// 商家登录
app.post('/api/seller/login', function(req, res) {
  var login = (req.body.login || '').trim();
  var pass = (req.body.password || '').trim();
  if (!login || !pass) return res.status(400).json({ error: '请输入账号和密码' });
  var sellers = readSellers();
  var seller = sellers.find(function(s) { return s.studentId === login || s.phone === login; });
  if (!seller) return res.status(400).json({ error: '账号不存在' });
  if (seller.password !== pass) return res.status(400).json({ error: '密码错误' });
  if (seller.status !== 'approved') return res.status(403).json({ error: '店铺审核中' });
  res.json({
    ok: true,
    seller: { id: seller.id, shopName: seller.shopName, realName: seller.realName, phone: seller.phone, studentId: seller.studentId, category: seller.category, description: seller.description, status: seller.status, createdAt: seller.createdAt, qrDataUrl: seller.qrDataUrl || '' }
  });
});

// 商家获取自己的信息
app.get('/api/seller/me', sellerAuth, function(req, res) {
  var s = req.currentSeller;
  res.json({ ok: true, seller: { id: s.id, shopName: s.shopName, realName: s.realName, phone: s.phone, studentId: s.studentId, category: s.category, description: s.description, status: s.status, createdAt: s.createdAt, qrDataUrl: s.qrDataUrl || '' } });
});

// 商家修改信息
app.put('/api/seller/me', sellerAuth, function(req, res) {
  var body = req.body;
  var sellers = readSellers();
  var idx = sellers.findIndex(function(s) { return s.id === req.currentSeller.id; });
  if (idx < 0) return res.status(404).json({ error: '商家不存在' });
  if (body.shopName) sellers[idx].shopName = body.shopName.trim();
  if (body.realName) sellers[idx].realName = body.realName.trim();
  if (body.phone) sellers[idx].phone = body.phone.trim();
  if (body.category) sellers[idx].category = body.category;
  if (body.description !== undefined) sellers[idx].description = body.description.trim();
  if (body.password && body.password.length >= 6) sellers[idx].password = body.password;
  writeSellers(sellers);
  req.currentSeller = sellers[idx];
  res.json({ ok: true, seller: sellers[idx] });
});

// 商家上传店铺收款码
app.post('/api/seller/me/qrcode', sellerAuth, sellerQRUpload.single('qrfile'), function(req, res) {
  if (!req.file) return res.status(400).json({ error: '请选择图片' });
  var qrUrl = '/api/seller-qr/' + req.file.filename;
  var sellers = readSellers();
  var idx = sellers.findIndex(function(s) { return s.id === req.currentSeller.id; });
  sellers[idx].qrDataUrl = qrUrl;
  writeSellers(sellers);
  req.currentSeller = sellers[idx];
  res.json({ ok: true, qrDataUrl: qrUrl });
});

// 商家获取自己的商品
app.get('/api/seller/products', sellerAuth, function(req, res) {
  var products = readJSON(PRODUCTS_FILE) || [];
  var mine = products.filter(function(p) { return p.sellerId === req.currentSeller.id; });
  res.json(mine);
});

// 商家新增商品
app.post('/api/seller/products', sellerAuth, function(req, res) {
  var body = req.body;
  if (!body.name || body.price == null) return res.status(400).json({ error: '名称和价格为必填' });
  var products = readJSON(PRODUCTS_FILE) || [];
  var maxId = products.reduce(function(m, p) { return Math.max(m, p.id); }, 0);
  var product = {
    id: maxId + 1, sellerId: req.currentSeller.id, name: body.name.trim(), category: body.category || req.currentSeller.category,
    price: Number(body.price), unit: body.unit || '次', stock: Number(body.stock) || 0,
    status: body.status || 'on', description: (body.description || '').trim(),
    hot: !!body.hot, image: body.image || '📦', contact: body.contact || req.currentSeller.phone,
    qrDataUrl: body.qrDataUrl || '', createdAt: new Date().toISOString()
  };
  products.push(product);
  writeJSON(PRODUCTS_FILE, products);
  res.json({ ok: true, product: product });
});

// 商家修改自己的商品
app.put('/api/seller/products/:id', sellerAuth, function(req, res) {
  var products = readJSON(PRODUCTS_FILE) || [];
  var idx = products.findIndex(function(p) { return p.id === parseInt(req.params.id) && p.sellerId === req.currentSeller.id; });
  if (idx < 0) return res.status(404).json({ error: '商品不存在或无权编辑' });
  var body = req.body;
  if (body.name !== undefined) products[idx].name = body.name.trim();
  if (body.category !== undefined) products[idx].category = body.category;
  if (body.price !== undefined) products[idx].price = Number(body.price);
  if (body.unit !== undefined) products[idx].unit = body.unit;
  if (body.stock !== undefined) products[idx].stock = Number(body.stock);
  if (body.status !== undefined) products[idx].status = body.status;
  if (body.description !== undefined) products[idx].description = body.description.trim();
  if (body.hot !== undefined) products[idx].hot = !!body.hot;
  if (body.image !== undefined) products[idx].image = body.image;
  if (body.qrDataUrl !== undefined) products[idx].qrDataUrl = body.qrDataUrl;
  writeJSON(PRODUCTS_FILE, products);
  res.json({ ok: true, product: products[idx] });
});

// 商家删除自己的商品
app.delete('/api/seller/products/:id', sellerAuth, function(req, res) {
  var products = readJSON(PRODUCTS_FILE) || [];
  var before = products.length;
  products = products.filter(function(p) { return !(p.id === parseInt(req.params.id) && p.sellerId === req.currentSeller.id); });
  if (products.length === before) return res.status(404).json({ error: '商品不存在或无权删除' });
  writeJSON(PRODUCTS_FILE, products);
  res.json({ ok: true });
});

// 商家获取自己的订单
app.get('/api/seller/orders', sellerAuth, function(req, res) {
  var orders = readJSON(ORDERS_FILE) || [];
  var mine = orders.filter(function(o) {
    return (o.items || []).some(function(i) { return i.sellerId === req.currentSeller.id; });
  });
  res.json(mine);
});

// 商家修改订单状态
app.patch('/api/seller/orders/:id', sellerAuth, function(req, res) {
  var orders = readJSON(ORDERS_FILE) || [];
  var order = orders.find(function(o) { return o.id === parseInt(req.params.id); });
  if (!order) return res.status(404).json({ error: '订单不存在' });
  var isMyOrder = (order.items || []).some(function(i) { return i.sellerId === req.currentSeller.id; });
  if (!isMyOrder) return res.status(403).json({ error: '无权操作此订单' });
  if (req.body.status) order.status = req.body.status;
  writeJSON(ORDERS_FILE, orders);
  res.json({ ok: true, order: order });
});

// 商家注销店铺
app.post('/api/seller/close', sellerAuth, function(req, res) {
  var sellers = readSellers();
  var idx = sellers.findIndex(function(s) { return s.id === req.currentSeller.id; });
  if (idx < 0) return res.status(404).json({ error: '商家不存在' });
  sellers[idx].status = 'closed';
  writeSellers(sellers);
  var products = readJSON(PRODUCTS_FILE) || [];
  products.forEach(function(p) { if (p.sellerId === req.currentSeller.id) p.status = 'off'; });
  writeJSON(PRODUCTS_FILE, products);
  res.json({ ok: true, message: '店铺已注销' });
});

// 服务商家收款码文件
app.get('/api/seller-qr/:filename', function(req, res) {
  var f = path.join(SELLER_QR_DIR, req.params.filename);
  if (!fs.existsSync(f)) return res.status(404).send('文件不存在');
  var ext = path.extname(f).toLowerCase();
  var mimeMap = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };
  res.setHeader('Content-Type', mimeMap[ext] || 'image/png');
  res.sendFile(f);
});

// ========== 管理后台独立页面 ==========
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ========== 商家中心独立页面 ==========
app.get('/seller', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'seller.html'));
});

// ========== SPA fallback ==========
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ========== 启动 ==========
initData();

app.listen(PORT, '0.0.0.0', () => {
  const bar = '═'.repeat(56);
  const adminUrl = PUBLIC_URL ? `${PUBLIC_URL}/admin` : `${LAN_URL}/admin`;
  console.log(`\n${bar}`);
  console.log(`  🎓  校园经济平台 已启动！`);
  console.log(``);
  console.log(`  📍 用户端：    ${LAN_URL}`);
  if (PUBLIC_URL) console.log(`  🌐 公网用户端：${PUBLIC_URL}`);
  console.log(``);
  console.log(`  ⚙️  管理后台：  ${adminUrl}`);
  console.log(`  🔑 管理密码：  ${ADMIN_PASS}`);
  console.log(``);
  console.log(`  💡 在管理后台中你可以：`);
  console.log(`     - 添加/编辑/删除商品`);
  console.log(`     - 管理所有订单（确认/完成/删除）`);
  console.log(`     - 查看数据统计`);
  console.log(`     - 重置全部数据`);
  console.log(`${bar}\n`);
});
